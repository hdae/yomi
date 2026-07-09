/**
 * `@hdae/yomi/format` — JTD1 辞書バイナリの低レベルコーデック層。
 *
 * 読み手（frontend の辞書ローダ）と書き手（dict-builder）が同一のレイアウト定義・
 * オフセット計算・チェックサムを共有し、フォーマットの二重定義による乖離を構造的に防ぐ。
 * G2P を使うだけなら不要で、辞書をビルド・検査するツール向けの公開面（詳細は docs/jtd1-format.md）。
 *
 * @module
 */

export { BitVector, BitWriter, popcount32 } from "./bits.ts";
export { LoudsTrie } from "./louds.ts";
export {
  CONTEXT_ID_DIMENSION,
  ENCODING_NAIVE,
  FORMAT_VERSION,
  fourCC,
  HEADER_BYTES,
  MAGIC,
  SECTION_ALIGN,
  SECTION_ENTRY_BYTES,
  SECTION_NAMES,
} from "./constants.ts";
export { JtdContainer } from "./reader.ts";
export { crc32, crc32Hex } from "./crc32.ts";
export {
  CHAR_LAYOUT,
  computeLayout,
  CONN_LAYOUT,
  decodeSection,
  FIELD_BYTES,
  LEXI_LAYOUT,
  READ_LAYOUT,
  TRIE_LAYOUT,
  UNKD_LAYOUT,
} from "./layout.ts";
export type {
  ArrayField,
  DecodedSection,
  FieldPlacement,
  FieldType,
  LayoutPlan,
  PrefixHit,
  SectionLayout,
  SectionName,
  SectionView,
} from "./types.ts";
