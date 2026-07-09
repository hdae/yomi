/**
 * `@hdae/yomi` — 日本語テキストフロントエンド（テキスト → 読み＋アクセント＋句境界）の中立コア。
 *
 * モデル非依存の G2P。特定モデル向けの音素・トーン梱包は持たず、中立の建材
 * （`moraToPhones` / `moraTones` / `pausePunct` / `wordPhoneAlignment`）を提供して
 * 呼び出し側で組む（docs/decisions/0001）。JTD1 辞書の低レベルコーデックは
 * `@hdae/yomi/format`、ブラウザ辞書ローダは `@hdae/yomi/browser` に分離してある。
 *
 * 実行時依存ゼロ（MUST）。ブラウザ / Node / Deno / Workers で同一動作。
 *
 * @module
 */

// 単一の真実源は src/constants.ts（deno.jsonc の焼き込みコピー）。ここで literal を書かない
// （手書きコピーは deno task bump で同期されず drift する。scripts/version_sync.test.ts が公開 VERSION を検証）。
export { VERSION } from "./constants.ts";

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
export {
  type AccentType,
  type ChainRule,
  type ChainRules,
  isTouten,
  moraSize,
  type MoraSpec,
  type NjdMora,
  type NjdNode,
  type PosFeatures,
} from "./njd/node.ts";
