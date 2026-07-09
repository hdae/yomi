/**
 * `@hdae/yomi/browser` — ブラウザ用の辞書ローダ（純ブラウザ API・依存ゼロ）。
 *
 * 辞書 JTD1（~19MB、gzip で ~6.4MB）はパッケージに同梱せず、実行時に取得する。既定の取得元は
 * **Hugging Face**（`hdae/yomi-dict` dataset。GitHub の CORS 制約を避ける）で、**gzip 版**を取得して
 * `DecompressionStream('gzip')` で解凍する（先頭バイトで gzip を自動判定するので生 .jtd を指す URL でも動く）。
 * 辞書はパッケージ版と独立に更新されるため、既定の取得は**辞書リポのコミット SHA**（constants の `DICT_REVISION`）で
 * 固定する＝immutable・reproducible。`getDictionary()` は取得結果を Cache API に保存し（次回以降 network なし）、
 * 解凍後のバイト列を JTD1 magic とセクション CRC で検証してから `JtdDictionary` を返す（破損は throw＝fail loud）。
 * 破損・解凍失敗キャッシュは真実源から取り直す（self-heal）。
 * 常に最新の辞書が要る場合は `revision: "main"` 等の可変 ref を渡す＝毎回 network から取得する（キャッシュしない）。
 *
 * MUST: ここは実行時依存ゼロ。Cache API / fetch / DecompressionStream / TextDecoder などブラウザ標準のみを使う。
 *
 * @module
 */

import { JtdContainer } from "../format/reader.ts";
import { crc32Hex } from "../format/crc32.ts";
import { JtdDictionary } from "../dict/dictionary.ts";
import { DICT_REVISION, DICT_URL, VERSION } from "../constants.ts";

export { VERSION };

const DEFAULT_CACHE_NAME = "yomi-dict";

/** 辞書取得の指定。すべて任意で、既定は「焼き込んだ revision の辞書を Hugging Face から gzip 取得」。 */
export type GetDictionaryOptions = {
  /** 取得元 URL テンプレ（`{revision}` を含む）または完成 URL。既定 = @hdae/yomi の HF dataset（gzip）。 */
  url?: string;
  /**
   * 辞書リビジョン（HF コミット SHA / ブランチ / タグ）。既定 = 焼き込んだ `DICT_REVISION`（不変 SHA）。
   * 40桁 hex の SHA はキャッシュする（不変）。`"main"` 等の可変 ref は毎回 network から最新を取得する。
   */
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

/** 不変（キャッシュ可能）な revision か＝40桁 hex のコミット SHA。ブランチ/タグ/短縮 SHA は可変扱い。 */
const isImmutableRevision = (rev: string): boolean => /^[0-9a-f]{40}$/.test(rev);

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
 * 検証済み JTD1 の ArrayBuffer を取得する（gzip 自動解凍・CRC 検証・self-heal）。
 * 不変 SHA の revision のみ Cache API を使う（可変 ref は毎回 network＝常に最新）。キャッシュには
 * 取得物（gzip）をそのまま保存する（小さい＝storage を節約）。getDictionary / fetchDictionaryBytes の共有経路。
 */
const fetchVerifiedBuffer = async (opts: GetDictionaryOptions): Promise<ArrayBuffer> => {
  const revision = opts.revision ?? DICT_REVISION;
  const requestUrl = (opts.url ?? DICT_URL).replace(/\{revision\}/g, revision);
  const cacheName = opts.cacheName ?? DEFAULT_CACHE_NAME;
  // 不変 SHA のみキャッシュ。可変 ref（"main" 等）は毎回最新を取得＝「常に最新」ニーズに対応。
  const useCache = typeof caches !== "undefined" && isImmutableRevision(revision);

  if (useCache) {
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

  if (useCache) {
    const cache = await caches.open(cacheName);
    await cache.put(requestUrl, new Response(raw)); // 取得物（gzip）を保存。
  }
  return buffer;
};

/**
 * 辞書を取得して `JtdDictionary` を返す（1呼び出しで完結）。
 * 引数なしで呼ぶと、constants に焼き込んだ既定 revision の辞書を Hugging Face から gzip で取得し、
 * 解凍・検証して返す。不変 SHA 固定なので Cache API 優先（ヒットすれば network なし）。キャッシュが
 * 破損・解凍不能なら evict して network から取り直す（self-heal）。`revision: "main"` 等の可変 ref を渡すと
 * キャッシュせず毎回最新を取得する。取得・キャッシュいずれの経路でも magic + CRC を検証し、破損は throw
 * する（fail loud）。検証済みなので `JtdDictionary.load` の再 CRC は省く。
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
