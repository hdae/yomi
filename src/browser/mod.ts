/**
 * `@hdae/yomi/browser` — ブラウザ用の辞書キャッシュローダ（純ブラウザ API・依存ゼロ）。
 *
 * 辞書 JTD1（~19MB）はパッケージに同梱せず、versioned なリリースアセットとして実行時に取得する。
 * `loadDictionary()` は既定で「このパッケージ自身の版」に対応する辞書を取得し（コードと辞書の版が
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
import { VERSION } from "../constants.ts";

export { VERSION };

/**
 * 既定の取得元。@hdae/yomi の GitHub Release（`{version}` は取得時に解決）。tag は v プレフィックス、
 * アセット名は bare version。mirror / fork / 自ホストは `url` で上書きできる。
 */
const DEFAULT_URL =
  "https://github.com/hdae/yomi/releases/download/v{version}/naist-jdic-{version}.jtd";

const DEFAULT_CACHE_NAME = "yomi-dict";

/** 辞書取得の指定。すべて任意で、既定は「このパッケージ自身の版をリリースアセットから取得」。 */
export type LoadDictionaryOptions = {
  /** 取得元 URL テンプレ（`{version}` を含む）または完成 URL。既定 = @hdae/yomi の GitHub Release。 */
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
 * 辞書を取得して返す（整合性検証済みの JTD1 バイト列。`JtdDictionary.load` にそのまま渡せる）。
 * 引数なしで呼ぶと、このパッケージ自身の版に対応する辞書を GitHub Release から取得する。
 * バージョン固定＝不変なので Cache API 優先（ヒットすれば network なし）。キャッシュが破損していた場合は
 * それを evict して network から取り直す（self-heal）。取得・キャッシュいずれの経路でも magic + CRC を
 * 検証し、破損は throw する（fail loud）。
 *
 * NOTE: Cache API は https / localhost の Secure Context でのみ利用可能。非対応環境では
 *       fetch のみで取得し、キャッシュはスキップする。
 */
export const loadDictionary = async (opts: LoadDictionaryOptions = {}): Promise<Uint8Array> => {
  const version = opts.version ?? VERSION;
  const requestUrl = (opts.url ?? DEFAULT_URL).replace(/\{version\}/g, version);
  const cacheName = opts.cacheName ?? DEFAULT_CACHE_NAME;
  const hasCacheApi = typeof caches !== "undefined";

  if (hasCacheApi) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(requestUrl);
    if (cached) {
      const bytes = new Uint8Array(await cached.arrayBuffer());
      try {
        verifyJtd(bytes);
        return bytes;
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
  const bytes = new Uint8Array(await response.arrayBuffer());
  verifyJtd(bytes); // 保存前に検証（破損は throw＝壊れたものはキャッシュしない・黙って劣化させない）。

  if (hasCacheApi) {
    const cache = await caches.open(cacheName);
    await cache.put(requestUrl, new Response(bytes)); // 検証済みバイト列を保存。
  }
  return bytes;
};
