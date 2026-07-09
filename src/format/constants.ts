// JTD1 コンテナのフォーマット定数（docs/jtd1-format.md v1）。
// dict-builder(書き手) と frontend(読み手) の両方がこの1定義を参照する
// MUST: 2実装で定数を重複定義しない（片方だけ直して黙って乖離する事故を防ぐ）。

/** 4cc 文字列 → LE u32。ビルド時・ロード時の両方で使う。 */
export const fourCC = (name: string): number => {
  if (name.length !== 4) throw new Error(`4cc は4文字: ${name}`);
  return (
    (name.charCodeAt(0) | (name.charCodeAt(1) << 8) | (name.charCodeAt(2) << 16) |
      (name.charCodeAt(3) << 24)) >>> 0
  );
};

/** コンテナ先頭のマジックナンバー（4cc "JTD1" の LE u32）。 */
export const MAGIC: number = fourCC("JTD1");
/** コンテナフォーマットのバージョン番号。不一致は fail loud（マイグレーションしない）。 */
export const FORMAT_VERSION = 1;

/** ヘッダは 16 バイト固定。 */
export const HEADER_BYTES = 16;
/** セクションテーブルは 1 エントリ 16 バイト。 */
export const SECTION_ENTRY_BYTES = 16;
/** 全セクションのペイロード先頭は 8 バイト境界（MUST、ゼロコピー参照の前提）。 */
export const SECTION_ALIGN = 8;

/** コンテナが持つセクション名の一覧（4cc、宣言順）。 */
export const SECTION_NAMES = [
  "META",
  "TRIE",
  "LEXI",
  "READ",
  "CONN",
  "CHAR",
  "UNKD",
] as const;
// SectionName 型は types.ts（値・実装から型を分離）。

/** encoding ID。0 = v1 素朴エンコード。代替エンコーダを足すときに増える。 */
export const ENCODING_NAIVE = 0;

/** 連接行列・文脈IDの次元（0 = BOS/EOS を含む）。naist-jdic v0.1.3 で固定。 */
export const CONTEXT_ID_DIMENSION = 1377;
