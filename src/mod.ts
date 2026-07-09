/**
 * `@hdae/yomi` — 日本語テキストフロントエンド（テキスト → 読み＋アクセント＋句境界）の中立コア。
 *
 * モデル非依存の G2P。特定モデル向けの音素・トーン梱包は持たず、中立の建材
 * （`moraToPhones` / `moraTones` / `pausePunct`）を提供して呼び出し側で組む
 * （docs/decisions/0001）。JTD1 辞書の低レベルコーデックは `@hdae/yomi/format`、
 * ブラウザ辞書ローダは `@hdae/yomi/browser` に分離してある。
 *
 * 実行時依存ゼロ（MUST）。ブラウザ / Node / Deno / Workers で同一動作。
 *
 * @module
 */

// 単一の真実源は src/constants.ts（deno.jsonc の焼き込みコピー）。ここで literal を書かない
// （手書きコピーは deno task bump で同期されず drift する。scripts/version_sync.test.ts が公開 VERSION を検証）。
export { VERSION } from "./constants.ts";

export { type CharCategoryInfo, type DictMeta, JtdDictionary } from "./dictionary.ts";
export { analyze } from "./analyze.ts";
export {
  loadOverlay,
  OverlayDictionary,
  type OverlayEntry,
  type ResolvedOverlayEntry,
} from "./overlay.ts";
export { type AccentPhrase, type FrontendResult, type Mora } from "./njd/result.ts";
export { moraToPhones } from "./phonemes.ts";
export { moraTones } from "./tones.ts";
export { pausePunct } from "./word_alignment.ts";
