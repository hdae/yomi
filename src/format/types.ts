// JTD1 コーデック層の型定義（値・実装から分離）。
// レイアウト定数（*_LAYOUT）や実装は layout.ts / reader.ts / louds.ts / constants.ts 側。

import type { SECTION_NAMES } from "./constants.ts";

/** SECTION_NAMES の要素型（有効なセクション名のユニオン）。 */
export type SectionName = (typeof SECTION_NAMES)[number];

/** セクション内のスカラ・配列要素が取り得る型（バイト幅の元）。 */
export type FieldType = "u32" | "u16" | "i16" | "u8";

/** セクション内の型付き配列1本の宣言（名前・要素型・要素数の導出方法）。 */
export type ArrayField = {
  /** 配列名（DecodedSection.arrays のキーになる）。 */
  name: string;
  /** 要素型。 */
  type: FieldType;
  /** スカラヘッダ値から要素数を導出する。 */
  length: (h: Record<string, number>) => number;
};

/** 1セクションの構造宣言（先頭の u32 スカラヘッダ列 + 後続の型付き配列列）。 */
export type SectionLayout = {
  /** u32 スカラの名前列（ペイロード先頭に順に並ぶ）。 */
  header: readonly string[];
  /** ヘッダに続く型付き配列列（宣言順にパディングを挟んで配置される）。 */
  arrays: readonly ArrayField[];
};

/** computeLayout が確定した、配列1本の実際の配置。 */
export type FieldPlacement = {
  /** 配列名。 */
  name: string;
  /** 要素型。 */
  type: FieldType;
  /** セクションペイロード先頭からのバイトオフセット。 */
  byteOffset: number;
  /** 要素数。 */
  elemCount: number;
};

/** computeLayout の戻り値: 全配列の配置とセクションペイロードの総バイト長。 */
export type LayoutPlan = {
  /** 各配列の配置一覧（layout.arrays と同じ順）。 */
  fields: FieldPlacement[];
  /** ヘッダと全配列を含むセクションペイロードの総バイト長。 */
  totalBytes: number;
};

/** decodeSection の戻り値: ヘッダのスカラ値と、配列のゼロコピービューの組。 */
export type DecodedSection = {
  /** ヘッダ由来のスカラ値（名前→値）。 */
  scalars: Record<string, number>;
  /** name → ゼロコピー TypedArray ビュー。 */
  arrays: Record<string, Uint32Array | Uint16Array | Int16Array | Uint8Array>;
};

/** JTD1 セクションテーブルの1エントリ（バッファ内の位置とエンコード種別）。 */
export type SectionView = {
  /** セクションのエンコーダ ID（0 = v1 素朴）。 */
  encoding: number;
  /** buf 先頭からのバイトオフセット（8 の倍数を保証）。 */
  offset: number;
  /** パディングを含まない実長（バイト）。 */
  length: number;
};

/** commonPrefixSearch が1件のヒットごとにコールバックへ渡す情報。 */
export type PrefixHit = {
  /** ヒットした表層形の surfaceId。 */
  surfaceId: number;
  /** 検索開始位置からではなく、文字列先頭からの終端 index（排他）。 */
  end: number;
};
