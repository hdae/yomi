// JTD1 各セクションの宣言的レイアウト定義と、オフセット計算の共有実装。
//
// MUST: 書き手(dict-builder)と読み手(frontend)は必ずこの1定義・この1つの
// computeLayout() を通す。オフセット計算を各自で書くと黙って乖離する。
//
// セクション = [u32 スカラヘッダ列][型付き配列列]。各配列の先頭は要素サイズ境界に
// パディングされる。配列長はスカラヘッダから導出する（自己記述）。

import type {
  DecodedSection,
  FieldPlacement,
  FieldType,
  LayoutPlan,
  SectionLayout,
} from "./types.ts";

/** 各 FieldType のバイト幅（アラインメント・オフセット計算に使う）。 */
export const FIELD_BYTES: Record<FieldType, number> = {
  u32: 4,
  u16: 2,
  i16: 2,
  u8: 1,
};

/** スカラ値からレイアウト全体の配置を確定する（書き手・読み手の共有経路）。 */
export const computeLayout = (
  layout: SectionLayout,
  scalars: Record<string, number>,
): LayoutPlan => {
  for (const name of layout.header) {
    if (!(name in scalars)) throw new Error(`スカラ ${name} が未指定`);
  }
  let cursor = layout.header.length * 4;
  const fields: FieldPlacement[] = [];
  for (const f of layout.arrays) {
    const size = FIELD_BYTES[f.type];
    cursor = Math.ceil(cursor / size) * size;
    const elemCount = f.length(scalars);
    if (!Number.isInteger(elemCount) || elemCount < 0) {
      throw new Error(`配列 ${f.name} の要素数が不正: ${elemCount}`);
    }
    fields.push({ name: f.name, type: f.type, byteOffset: cursor, elemCount });
    cursor += elemCount * size;
  }
  return { fields, totalBytes: cursor };
};

// ---- 各セクションのレイアウト定義（docs/jtd1-format.md v1） ----

/** TRIE セクション（LOUDS トライ: 表層形 → surfaceId）のレイアウト定義。 */
export const TRIE_LAYOUT: SectionLayout = {
  header: [
    "nodeCount",
    "surfaceCount",
    "lbsBitLength",
    "lbsWordCount",
    "terminalBitLength",
    "terminalWordCount",
  ],
  arrays: [
    { name: "lbsWords", type: "u32", length: (h) => h.lbsWordCount },
    { name: "terminalWords", type: "u32", length: (h) => h.terminalWordCount },
    { name: "labels", type: "u16", length: (h) => h.nodeCount },
  ],
};

/** LEXI セクション（表層形→エントリ→ユニットの索引と各種属性）のレイアウト定義。 */
export const LEXI_LAYOUT: SectionLayout = {
  header: ["surfaceCount", "entryCount", "unitCount"],
  arrays: [
    { name: "entryIndex", type: "u32", length: (h) => h.surfaceCount + 1 },
    { name: "unitIndex", type: "u32", length: (h) => h.entryCount + 1 },
    { name: "unitPronOffset", type: "u32", length: (h) => h.unitCount },
    { name: "leftId", type: "u16", length: (h) => h.entryCount },
    { name: "rightId", type: "u16", length: (h) => h.entryCount },
    { name: "cost", type: "i16", length: (h) => h.entryCount },
    { name: "posId", type: "u16", length: (h) => h.entryCount },
    { name: "chainRuleId", type: "u8", length: (h) => h.entryCount },
    { name: "unitAccType", type: "u8", length: (h) => h.unitCount },
    { name: "unitSurfLen", type: "u8", length: (h) => h.unitCount },
    { name: "unitPronLen", type: "u8", length: (h) => h.unitCount },
  ],
};

/** READ セクション（発音のコードポイントを格納する共有プール）のレイアウト定義。 */
export const READ_LAYOUT: SectionLayout = {
  header: ["poolLength"],
  arrays: [{ name: "pool", type: "u16", length: (h) => h.poolLength }],
};

/** CONN セクション（左右文脈IDの連接コスト行列）のレイアウト定義。 */
export const CONN_LAYOUT: SectionLayout = {
  header: ["rightSize", "leftSize"],
  arrays: [
    // cost = data[prevRightId * leftSize + nextLeftId]
    { name: "data", type: "i16", length: (h) => h.rightSize * h.leftSize },
  ],
};

/** CHAR セクション（文字カテゴリ定義とコードポイント→カテゴリ写像）のレイアウト定義。 */
export const CHAR_LAYOUT: SectionLayout = {
  header: ["catCount"],
  arrays: [
    // {invoke, group, length, pad} × catCount。カテゴリ名は META.charCategories。
    { name: "catTable", type: "u8", length: (h) => h.catCount * 4 },
    // BMP コードポイント → 順序付きカテゴリ列（nibble×4、値は catId+1、0=終端）。
    // lindera の lookup_categories は「char.def の範囲行の出現順」でカテゴリを
    // 列挙し、その序数(category_ord)が未知語グルーピングの同一性判定に使われる
    // ため、ビットマスクではなく順序を保存する。
    { name: "catsPacked", type: "u16", length: () => 0x10000 },
  ],
};

/** UNKD セクション（未知語の文字カテゴリ別生成規則）のレイアウト定義。 */
export const UNKD_LAYOUT: SectionLayout = {
  header: ["catCount", "recordCount"],
  arrays: [
    { name: "catIndex", type: "u32", length: (h) => h.catCount + 1 },
    { name: "leftId", type: "u16", length: (h) => h.recordCount },
    { name: "rightId", type: "u16", length: (h) => h.recordCount },
    { name: "cost", type: "i16", length: (h) => h.recordCount },
    { name: "posId", type: "u16", length: (h) => h.recordCount },
  ],
};

// ---- 読み手側の汎用デコード ----

/**
 * セクションペイロード（buffer 内の [offset, offset+length)）をレイアウト定義に
 * 従ってゼロコピーで分解する。offset は 8B 境界（reader.ts が検証済み）なので、
 * 各配列は要素サイズ境界に乗ることが computeLayout により保証される。
 */
export const decodeSection = (
  buffer: ArrayBuffer,
  offset: number,
  length: number,
  layout: SectionLayout,
): DecodedSection => {
  // ヘッダ列を読む前に、ヘッダ自体が収まる長さかを明示メッセージで検証する（生 RangeError 防止）。
  if (length < layout.header.length * 4) {
    throw new Error(`セクション実長 ${length} がヘッダ ${layout.header.length * 4}B より短い`);
  }
  const dv = new DataView(buffer, offset, length);
  const scalars: Record<string, number> = {};
  layout.header.forEach((name, i) => {
    scalars[name] = dv.getUint32(i * 4, true);
  });

  const plan = computeLayout(layout, scalars);
  // 正常な書き手は totalBytes 丁度を書く。短い（切り詰め）だけでなく長い（length 誤計算・
  // 混線）も破損として扱い、厳密一致以外は fail loudly。
  if (plan.totalBytes !== length) {
    throw new Error(`セクション実長 ${length} がレイアウト要求 ${plan.totalBytes} と一致しない`);
  }

  const arrays: DecodedSection["arrays"] = {};
  for (const f of plan.fields) {
    const at = offset + f.byteOffset;
    switch (f.type) {
      case "u32":
        arrays[f.name] = new Uint32Array(buffer, at, f.elemCount);
        break;
      case "u16":
        arrays[f.name] = new Uint16Array(buffer, at, f.elemCount);
        break;
      case "i16":
        arrays[f.name] = new Int16Array(buffer, at, f.elemCount);
        break;
      case "u8":
        arrays[f.name] = new Uint8Array(buffer, at, f.elemCount);
        break;
    }
  }
  return { scalars, arrays };
};
