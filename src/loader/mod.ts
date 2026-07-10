/**
 * `@hdae/yomi/loader` — 辞書ローダ（取得・キャッシュ・検証。ブラウザ / Deno / Node / Workers）。
 *
 * 辞書 JTD1（~19MB、gzip で ~6.4MB）はパッケージに同梱せず、実行時に取得する。既定の取得元は
 * **Hugging Face**（`hdae/yomi-dict` dataset。GitHub の CORS 制約を避ける）で、**gzip 版**を取得して
 * `DecompressionStream('gzip')` で解凍する（先頭バイトで gzip を自動判定するので生 .jtd を指す URL でも動く）。
 * 辞書はパッケージ版と独立に更新されるため、既定の取得は**辞書リポのコミット SHA**（constants の `DICT_REVISION`）で
 * 固定する＝immutable・reproducible。`getDictionary()` は取得結果を Cache API に保存し（次回以降 network なし）、
 * 解凍後のバイト列を JTD1 magic とセクション CRC で検証してから `JtdDictionary` を返す（破損は throw＝fail loud）。
 * 破損・解凍失敗キャッシュは真実源から取り直す（self-heal）。
 * 常に最新の辞書が要る場合は `revision: "main"` 等の可変 ref を渡す＝既定ホストでは現在の SHA を解決してから
 * 取得するので、SHA が変わらなければキャッシュから返す（辞書本体の再 DL を省く）。
 *
 * 取得・キャッシュのオーケストレーション（Cache API・self-heal・quota 等の cache I/O 失敗時の
 * network 縮退・進捗通知）は同一オーナーの `@hdae/fetch-cache`（実行時依存ゼロ）に委譲し、
 * ここには辞書固有の層（gzip 自動解凍・JTD1 magic+CRC 検証・既定 URL/revision）だけを置く
 * （docs/decisions/0006）。`caches` が無いランタイム（Node.js 等）では素の fetch に自動縮退する。
 *
 * @module
 */

import { fetchBytes, type FetchProgress } from "@hdae/fetch-cache";
import { isCommitSha, resolveHfRevision } from "@hdae/fetch-cache/hf";
import { JtdContainer } from "../format/reader.ts";
import { crc32Hex } from "../format/crc32.ts";
import { JtdDictionary } from "../dict/dictionary.ts";
import { DICT_REPO, DICT_REVISION, DICT_URL, VERSION } from "../constants.ts";

export { VERSION };
export type { FetchProgress };

const DEFAULT_CACHE_NAME = "yomi-dict";

/** 辞書取得の指定。すべて任意で、既定は「焼き込んだ revision の辞書を Hugging Face から gzip 取得」。 */
export type GetDictionaryOptions = {
  /** 取得元 URL テンプレ（`{revision}` を含む）または完成 URL。既定 = @hdae/yomi の HF dataset（gzip）。 */
  url?: string;
  /**
   * 辞書リビジョン（HF コミット SHA / ブランチ / タグ）。既定 = 焼き込んだ `DICT_REVISION`（不変 SHA）。
   * 40桁 hex の SHA はそのまま取得・キャッシュする（不変）。`"main"` 等の可変 ref は既定ホストでは
   * 現在の SHA に解決してから取得するので、SHA が変わらなければキャッシュから返る（毎回の DL を避ける）。
   */
  revision?: string;
  /** Cache Storage の名前空間。既定 "yomi-dict"。 */
  cacheName?: string;
  /** ダウンロード進捗（チャンク毎）。キャッシュヒット時は呼ばれない。 */
  onProgress?: (progress: FetchProgress) => void;
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
const gunzip = async (gz: Uint8Array): Promise<Uint8Array<ArrayBuffer>> => {
  // コピーで ArrayBuffer 裏付けを保証する（fetch-cache から届く view の型を吸収）。
  const body = new Response(new Uint8Array(gz)).body;
  if (body === null) throw new Error("辞書解凍失敗: gzip ストリームが空");
  const out = body.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(out).arrayBuffer());
};

/**
 * `fetchBytes` の decode フック: 取得アーティファクト（gzip または生 JTD1）を検証済み JTD1 に
 * 変換する。先頭バイトで gzip を自動判定し、gzip なら解凍してから CRC 検証する。throw は
 * fetch-cache 側で「破損」として扱われる（キャッシュ由来は evict → 真実源から取り直す self-heal、
 * network 由来はそのまま throw・キャッシュしない）。cache に入るのは常に保存形（gzip のまま＝小さい）。
 */
const decodeJtd = async (raw: Uint8Array): Promise<Uint8Array<ArrayBuffer>> => {
  const jtd = isGzip(raw) ? await gunzip(raw) : new Uint8Array(raw);
  verifyJtd(jtd);
  return jtd;
};

/**
 * 検証済み JTD1 の ArrayBuffer を取得する（gzip 自動解凍・CRC 検証・self-heal）。
 * 既定ホストで可変 ref（"main" 等）を渡されたら、まず HF API で現在の SHA に解決してから SHA 固定で
 * 取得する（無駄 DL 回避）。不変 SHA の revision のみ Cache API を使う。キャッシュには取得物（gzip）を
 * そのまま保存する（小さい＝storage を節約）。getDictionary / fetchDictionaryBytes の共有経路。
 */
const fetchVerifiedBuffer = async (opts: GetDictionaryOptions): Promise<ArrayBuffer> => {
  const rawRevision = opts.revision ?? DICT_REVISION;
  // 既定ホストで可変 ref を渡されたら現在の SHA に解決する（SHA 固定＝キャッシュ可＝無駄 DL 回避）。
  // url を上書きした場合は解決経路（HF API）が使えないので、可変 ref のまま毎回取得する。
  // resolveHfRevision は SHA を渡せばネットワークに出ずそのまま返す。
  const revision = opts.url === undefined
    ? await resolveHfRevision({ repo: DICT_REPO, kind: "dataset", revision: rawRevision })
    : rawRevision;
  const requestUrl = (opts.url ?? DICT_URL).replace(/\{revision\}/g, revision);

  // 不変 SHA のみキャッシュ（url 上書き＋可変 ref のときだけ非キャッシュ）。解凍と CRC 検証は
  // decode に一本化され、キャッシュ・network の両経路で 1 回だけ走る。解凍不能・CRC 不一致は
  // 「破損」としてキャッシュなら evict → 真実源から再取得、network ならそのまま throw・
  // キャッシュしない（fetch-cache 側の契約）。
  const jtd = await fetchBytes(requestUrl, {
    cacheName: opts.cacheName ?? DEFAULT_CACHE_NAME,
    cache: isCommitSha(revision),
    decode: decodeJtd,
    onProgress: opts.onProgress,
  });
  // decodeJtd は全長・専有の ArrayBuffer 背面を返すが、fetchBytes の戻り型ではそれが消える。
  // instanceof で背面型を復元する（偽側はコピーで総称的に安全 — 実行時には到達しない）。
  return jtd.buffer instanceof ArrayBuffer ? jtd.buffer : new Uint8Array(jtd).buffer;
};

/**
 * 辞書を取得して `JtdDictionary` を返す（1呼び出しで完結）。
 * 引数なしで呼ぶと、constants に焼き込んだ既定 revision の辞書を Hugging Face から gzip で取得し、
 * 解凍・検証して返す。不変 SHA 固定なので Cache API 優先（ヒットすれば network なし）。キャッシュが
 * 破損・解凍不能なら evict して network から取り直す（self-heal）。`revision: "main"` 等の可変 ref を渡すと
 * 現在の SHA を解決してから取得するので、変わっていなければキャッシュから返る。取得・キャッシュいずれの
 * 経路でも magic + CRC を検証し、破損は throw する（fail loud）。検証済みなので `JtdDictionary.load` の再 CRC は省く。
 *
 * NOTE: Cache API は https / localhost の Secure Context と Deno で利用可能。無いランタイム
 *       （Node.js 等）では素の fetch に自動縮退する。quota 超過等の cache I/O 失敗も取得を落とさず
 *       network 側へ縮退して続行する（console.warn で通知 — `@hdae/fetch-cache` の契約）。
 *       DecompressionStream はブラウザ / Deno / Node 18+ / Workers で利用可能。
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
