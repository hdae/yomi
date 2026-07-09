/**
 * `@hdae/yomi/browser` — ブラウザ用の辞書ローダ（純ブラウザ API・依存ゼロ）。
 *
 * 辞書 JTD1（~19MB）はパッケージに同梱せず、実行時に取得する。既定は Hugging Face
 * （`hdae/yomi-dict` dataset。GitHub の CORS 制約を避ける＝単純 GET はワイルドカード CORS）。
 * `getDictionary()` は既定で「このパッケージ自身の版」に対応する辞書を取得し（コードと辞書の版が
 * 常に一致・再現性）、版固定＝不変なので Cache API 優先で次回以降は network なしで返す。破損キャッシュは
 * 真実源（network）から取り直し（self-heal）、取得バイト列は JTD1 magic とセクション CRC で検証して
 * 破損は throw する（fail loud・黙って劣化しない）。
 *
 * MUST: ここは実行時依存ゼロ。Cache API / fetch / TextDecoder などブラウザ標準のみを使う。
 *
 * @module
 */

import { JtdContainer } from "../format/reader.ts";
import { crc32Hex } from "../format/crc32.ts";
import { JtdDictionary } from "../dict/dictionary.ts";
import { VERSION } from "../constants.ts";

export { VERSION };

/**
 * 既定の取得元。Hugging Face の `hdae/yomi-dict`（dataset）resolve エンドポイント。
 * `{version}` は取得時に解決する。ファイル名に版を埋めるため resolve/main でも版ごとに不変
 * （同名を上書きしない運用）。mirror / fork / 自ホストは `url` で上書きできる。
 */
const DEFAULT_URL =
  "https://huggingface.co/datasets/hdae/yomi-dict/resolve/main/naist-jdic-{version}.jtd";

const DEFAULT_CACHE_NAME = "yomi-dict";

/** 辞書取得の指定。すべて任意で、既定は「このパッケージ自身の版を Hugging Face から取得」。 */
export type GetDictionaryOptions = {
  /** 取得元 URL テンプレ（`{version}` を含む）または完成 URL。既定 = @hdae/yomi の HF dataset。 */
  url?: string;
  /** 取得するバージョン。既定 = このパッケージ自身のバージョン（`VERSION`）。 */
  version?: string;
  /** Cache Storage の名前空間。既定 "yomi-dict"。 */
  cacheName?: string;
};

/**
 * JTD1 バイト列の整合性を検証する（magic + 全セクション CRC）。
 * 破損していれば throw（fail loud）。JtdDictionary.load と同じ検証を、辞書オブジェクトを
 * 構築せず軽量に行う。
 */
export const verifyJtd = (bytes: Uint8Array): void => {
  // magic / formatVersion / セクションテーブルの境界検証は JtdContainer が行う。
  // JtdContainer は ArrayBuffer を要求するので、SharedArrayBuffer 由来でも安全なコピーを作る。
  const copy = new Uint8Array(bytes);
  const buffer: ArrayBuffer = copy.buffer;
  const container = new JtdContainer(buffer);

  const metaSec = container.section("META");
  const meta = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, metaSec.offset, metaSec.length)),
  ) as { checksums?: Record<string, string> };
  if (meta.checksums === undefined) {
    throw new Error("JTD1: META に checksums が無い（破損の可能性）");
  }
  for (const [name, expected] of Object.entries(meta.checksums)) {
    const s = container.section(name);
    const actual = crc32Hex(new Uint8Array(buffer, s.offset, s.length));
    if (actual !== expected) {
      throw new Error(`JTD1: セクション ${name} のCRC不一致: ${actual} != ${expected}（破損）`);
    }
  }
};

/**
 * 検証済み JTD1 の ArrayBuffer を取得する（キャッシュ優先・self-heal・CRC 検証）。
 * getDictionary / fetchDictionaryBytes の共有経路。
 */
const fetchVerifiedBuffer = async (opts: GetDictionaryOptions): Promise<ArrayBuffer> => {
  const version = opts.version ?? VERSION;
  const requestUrl = (opts.url ?? DEFAULT_URL).replace(/\{version\}/g, version);
  const cacheName = opts.cacheName ?? DEFAULT_CACHE_NAME;
  const hasCacheApi = typeof caches !== "undefined";

  if (hasCacheApi) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(requestUrl);
    if (cached) {
      const buffer = await cached.arrayBuffer();
      try {
        verifyJtd(new Uint8Array(buffer));
        return buffer;
      } catch {
        // 破損キャッシュ。真実源（network）から取り直すため evict してフォールスルー（self-heal）。
        await cache.delete(requestUrl);
      }
    }
  }

  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error(`辞書取得失敗: HTTP ${response.status} ${response.statusText} (${requestUrl})`);
  }
  const buffer = await response.arrayBuffer();
  verifyJtd(new Uint8Array(buffer)); // 保存前に検証（破損は throw＝壊れたものはキャッシュしない）。

  if (hasCacheApi) {
    const cache = await caches.open(cacheName);
    await cache.put(requestUrl, new Response(buffer)); // 検証済みバイト列を保存。
  }
  return buffer;
};

/**
 * 辞書を取得して `JtdDictionary` を返す（1呼び出しで完結）。
 * 引数なしで呼ぶと、このパッケージ自身の版に対応する辞書を Hugging Face から取得する。
 * バージョン固定＝不変なので Cache API 優先（ヒットすれば network なし）。キャッシュが破損していた場合は
 * evict して network から取り直す（self-heal）。取得・キャッシュいずれの経路でも magic + CRC を検証し、
 * 破損は throw する（fail loud）。検証済みなので `JtdDictionary.load` の再 CRC は省く。
 *
 * NOTE: Cache API は https / localhost の Secure Context でのみ利用可能。非対応環境では
 *       fetch のみで取得し、キャッシュはスキップする。
 */
export const getDictionary = async (opts: GetDictionaryOptions = {}): Promise<JtdDictionary> => {
  const buffer = await fetchVerifiedBuffer(opts);
  return JtdDictionary.load(buffer, { verifyChecksums: false });
};

/**
 * 検証済みの JTD1 バイト列を取得する（`getDictionary` の下位版）。返り値は `JtdDictionary.load` に
 * そのまま渡せる。Worker への転送や独自キャッシュなど、バイト列を直接扱いたい場合に使う。
 * 取得・キャッシュ・self-heal・CRC 検証は `getDictionary` と同一。
 */
export const fetchDictionaryBytes = async (
  opts: GetDictionaryOptions = {},
): Promise<Uint8Array> => new Uint8Array(await fetchVerifiedBuffer(opts));
