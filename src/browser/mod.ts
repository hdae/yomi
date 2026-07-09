/**
 * `@hdae/yomi/browser` — ブラウザ用の辞書ローダ（純ブラウザ API・依存ゼロ）。
 *
 * 辞書 JTD1（~19MB、gzip で ~6.4MB）はパッケージに同梱せず、実行時に取得する。既定の取得元は
 * **Hugging Face**（`hdae/yomi-dict` dataset。GitHub の CORS 制約を避ける）で、**gzip 版**を取得して
 * `DecompressionStream('gzip')` で解凍する（先頭バイトで gzip を自動判定するので生 .jtd を指す URL でも動く）。
 * 辞書はパッケージ版と独立に更新されるため、既定の取得は**辞書リポのコミット SHA**（`DEFAULT_REVISION`）で
 * 固定する＝immutable・reproducible。`getDictionary()` は取得結果を Cache API に保存し（次回以降 network なし）、
 * 解凍後のバイト列を JTD1 magic とセクション CRC で検証してから `JtdDictionary` を返す（破損は throw＝fail loud）。
 * 破損・解凍失敗キャッシュは真実源から取り直す（self-heal）。
 *
 * MUST: ここは実行時依存ゼロ。Cache API / fetch / DecompressionStream / TextDecoder などブラウザ標準のみを使う。
 *
 * @module
 */

import { JtdContainer } from "../format/reader.ts";
import { crc32Hex } from "../format/crc32.ts";
import { JtdDictionary } from "../dict/dictionary.ts";
import { VERSION } from "../constants.ts";

export { VERSION };

/**
 * 既定辞書の HF リビジョン（辞書リポ `hdae/yomi-dict` のコミット SHA）。
 * 辞書はパッケージ版と独立に更新されるため、パッケージ版ではなくこのコミットで固定する
 * （resolve/{sha}/… は immutable）。辞書を差し替えたら HF へ上げ直し、この SHA を更新する。
 * DECIDED: 版依存をやめ辞書リポのコミットで固定する（docs/decisions/0003）。
 */
const DEFAULT_REVISION = "ab847217c833593c3aec9875b9bfa6ff9789dc29";

/**
 * 既定の取得元。HF dataset `hdae/yomi-dict` の resolve（gzip 版）。`{revision}` を取得時に解決する。
 * gzip 優先だが loader は先頭バイトで自動判定するので、生 `.jtd` を指す URL でも透過的に動く。
 * mirror / fork / 自ホストは `url` で上書きできる。
 */
const DEFAULT_URL =
  "https://huggingface.co/datasets/hdae/yomi-dict/resolve/{revision}/naist-jdic.jtd.gz";

const DEFAULT_CACHE_NAME = "yomi-dict";

/** 辞書取得の指定。すべて任意で、既定は「焼き込んだ revision の辞書を Hugging Face から gzip 取得」。 */
export type GetDictionaryOptions = {
  /** 取得元 URL テンプレ（`{revision}` を含む）または完成 URL。既定 = @hdae/yomi の HF dataset（gzip）。 */
  url?: string;
  /** 辞書リビジョン（HF コミット SHA 等）。既定 = パッケージに焼き込んだ `DEFAULT_REVISION`。 */
  revision?: string;
  /** Cache Storage の名前空間。既定 "yomi-dict"。 */
  cacheName?: string;
};

/**
 * JTD1 バイト列の整合性を検証する（magic + 全セクション CRC）。
 * 破損していれば throw（fail loud）。JtdDictionary.load と同じ検証を、辞書オブジェクトを
 * 構築せず軽量に行う。入力は解凍済みの生 JTD1（gzip ではない）。
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

/** gzip マジック（0x1f 0x8b）で始まるか。 */
const isGzip = (b: Uint8Array): boolean => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;

/** gzip バイト列を `DecompressionStream('gzip')` で解凍する（破損 gzip は throw）。 */
const gunzip = async (gz: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
  const body = new Response(gz).body;
  if (body === null) throw new Error("辞書解凍失敗: gzip ストリームが空");
  const out = body.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(out).arrayBuffer());
};

/**
 * 取得アーティファクト（gzip または生 JTD1）を検証済み JTD1 の ArrayBuffer にする。
 * 先頭バイトで gzip を自動判定し、gzip なら解凍してから CRC 検証する。破損・解凍失敗は throw。
 */
const materialize = async (raw: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> => {
  const jtd = isGzip(raw) ? await gunzip(raw) : raw;
  verifyJtd(jtd);
  return jtd.buffer;
};

/**
 * 検証済み JTD1 の ArrayBuffer を取得する（キャッシュ優先・gzip 自動解凍・CRC 検証・self-heal）。
 * getDictionary / fetchDictionaryBytes の共有経路。キャッシュには取得物（gzip）をそのまま保存する
 * （小さい＝storage を節約）。
 */
const fetchVerifiedBuffer = async (opts: GetDictionaryOptions): Promise<ArrayBuffer> => {
  const revision = opts.revision ?? DEFAULT_REVISION;
  const requestUrl = (opts.url ?? DEFAULT_URL).replace(/\{revision\}/g, revision);
  const cacheName = opts.cacheName ?? DEFAULT_CACHE_NAME;
  const hasCacheApi = typeof caches !== "undefined";

  if (hasCacheApi) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(requestUrl);
    if (cached) {
      const raw = new Uint8Array(await cached.arrayBuffer());
      try {
        return await materialize(raw);
      } catch {
        // 破損キャッシュ・解凍失敗。真実源から取り直すため evict してフォールスルー（self-heal）。
        await cache.delete(requestUrl);
      }
    }
  }

  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error(`辞書取得失敗: HTTP ${response.status} ${response.statusText} (${requestUrl})`);
  }
  const raw = new Uint8Array(await response.arrayBuffer());
  const buffer = await materialize(raw); // 解凍+検証（破損は throw＝壊れたものはキャッシュしない）。

  if (hasCacheApi) {
    const cache = await caches.open(cacheName);
    await cache.put(requestUrl, new Response(raw)); // 取得物（gzip）を保存。
  }
  return buffer;
};

/**
 * 辞書を取得して `JtdDictionary` を返す（1呼び出しで完結）。
 * 引数なしで呼ぶと、パッケージに焼き込んだ既定 revision の辞書を Hugging Face から gzip で取得し、
 * 解凍・検証して返す。revision 固定＝不変なので Cache API 優先（ヒットすれば network なし）。キャッシュが
 * 破損・解凍不能なら evict して network から取り直す（self-heal）。取得・キャッシュいずれの経路でも
 * magic + CRC を検証し、破損は throw する（fail loud）。検証済みなので `JtdDictionary.load` の再 CRC は省く。
 *
 * NOTE: Cache API は https / localhost の Secure Context でのみ利用可能。非対応環境では
 *       fetch のみで取得し、キャッシュはスキップする。DecompressionStream はブラウザ / Deno / Node 18+ /
 *       Workers で利用可能。
 */
export const getDictionary = async (opts: GetDictionaryOptions = {}): Promise<JtdDictionary> => {
  const buffer = await fetchVerifiedBuffer(opts);
  return JtdDictionary.load(buffer, { verifyChecksums: false });
};

/**
 * 検証済みの生 JTD1 バイト列（解凍済み）を取得する（`getDictionary` の下位版）。返り値は
 * `JtdDictionary.load` にそのまま渡せる。Worker への転送や独自キャッシュなど、バイト列を直接扱いたい
 * 場合に使う。取得・キャッシュ・gzip 解凍・self-heal・CRC 検証は `getDictionary` と同一。
 */
export const fetchDictionaryBytes = async (
  opts: GetDictionaryOptions = {},
): Promise<Uint8Array> => new Uint8Array(await fetchVerifiedBuffer(opts));
