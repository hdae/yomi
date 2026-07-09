// @hdae/yomi — 日本語テキストフロントエンド（テキスト → 読み＋アクセント＋句境界）。
// これは中立コア＝モデル非依存の G2P。モデル固有の音素・トーン梱包は yomi に持たず、
// 中立の建材（moraToPhones / moraTones / pausePunct / wordPhoneAlignment）を export し
// 呼び出し側で組む（docs/decisions/0001）。
// MUST: このパッケージは実行時依存ゼロを維持する（ブラウザ/Node/Deno/Workers で同一動作）。

// 単一の真実源は src/constants.ts（deno.jsonc の焼き込みコピー）。ここで literal を書かない
// （手書きコピーは deno task bump で同期されず drift する。scripts/version_sync.test.ts が公開 VERSION を検証）。
export { VERSION } from "./constants.ts";

export { BitVector, BitWriter, popcount32 } from "./bits.ts";
export { LoudsTrie, type PrefixHit } from "./louds.ts";
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
} from "./format/constants.ts";
export { JtdContainer, type SectionView } from "./format/reader.ts";
export { crc32, crc32Hex } from "./format/crc32.ts";
export { type CharCategoryInfo, type DictMeta, JtdDictionary } from "./dictionary.ts";
export { type LatticeNode, tokenizeToNodes } from "./lattice.ts";
export { type Token, tokenize } from "./tokenizer.ts";
export { normalizeForDict, splitFragments } from "./normalize.ts";
export { analyze, analyzeToNodes } from "./analyze.ts";
export {
  loadOverlay,
  OverlayDictionary,
  type OverlayEntry,
  type ResolvedOverlayEntry,
} from "./overlay.ts";
export { type AccentPhrase, buildResult, type FrontendResult, type Mora } from "./njd/result.ts";
export { moraToPhones, nodeToMoras } from "./phonemes.ts";
export { moraTones } from "./tones.ts";
export { pausePunct, wordPhoneAlignment, type WordPhones } from "./word_alignment.ts";
export { isTouten, moraSize, type NjdMora, type NjdNode } from "./njd/node.ts";
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
} from "./format/layout.ts";
