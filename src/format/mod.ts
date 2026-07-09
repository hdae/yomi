/**
 * `@hdae/yomi/format` — JTD1 辞書バイナリの低レベルコーデック層。
 *
 * 読み手（frontend の辞書ローダ）と書き手（dict-builder）が同一のレイアウト定義・
 * オフセット計算・チェックサムを共有し、フォーマットの二重定義による乖離を構造的に防ぐ。
 * G2P を使うだけなら不要で、辞書をビルド・検査するツール向けの公開面（詳細は docs/jtd1-format.md）。
 *
 * @module
 */

export { BitVector, BitWriter, popcount32 } from "../bits.ts";
export { LoudsTrie, type PrefixHit } from "../louds.ts";
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
  type SectionName,
} from "./constants.ts";
export { JtdContainer, type SectionView } from "./reader.ts";
export { crc32, crc32Hex } from "./crc32.ts";
export {
  type ArrayField,
  CHAR_LAYOUT,
  computeLayout,
  CONN_LAYOUT,
  type DecodedSection,
  decodeSection,
  FIELD_BYTES,
  type FieldPlacement,
  type FieldType,
  type LayoutPlan,
  LEXI_LAYOUT,
  READ_LAYOUT,
  type SectionLayout,
  TRIE_LAYOUT,
  UNKD_LAYOUT,
} from "./layout.ts";
