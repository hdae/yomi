/**
 * `@hdae/yomi` — 日本語テキストフロントエンド（テキスト → 読み＋アクセント＋句境界）の中立コア。
 *
 * モデル非依存の G2P。特定モデル向けの音素・トーン梱包は持たず、中立の建材
 * （`moraToPhones` / `moraTones` / `punctuationMarks` / `wordPhoneAlignment`）を提供して
 * 呼び出し側で組む（docs/decisions/0001）。JTD1 辞書の低レベルコーデックは
 * `@hdae/yomi/format`、辞書ローダは `@hdae/yomi/loader` に分離してある。
 *
 * 細粒度の言語モデル（NJD ノード・トークナイザ・辞書・モーラ表など）は、
 * リファレンス実装（jpreprocess / pyopenjtalk）に倣ってドメイン別サブパス
 * （`@hdae/yomi/njd` `/tokenizer` `/dict` `/text` `/g2p`）に公開する。
 *
 * コアは実行時依存ゼロ（MUST）。ブラウザ / Node / Deno / Workers で同一動作
 * （`/loader` のみ同一オーナーのゼロ依存 `@hdae/fetch-cache` を使う＝docs/decisions/0006）。
 *
 * @module
 */

// 単一の真実源は src/constants.ts（deno.jsonc の焼き込みコピー）。ここで literal を書かない
// （手書きコピーは deno task bump で同期されず drift する。scripts/version_sync.test.ts が公開 VERSION を検証）。
export { VERSION } from "./constants.ts";

export { JtdDictionary } from "./dict/dictionary.ts";
export { loadOverlay, OverlayDictionary } from "./dict/overlay.ts";
export type {
  CharCategoryInfo,
  DictMeta,
  OverlayEntry,
  ResolvedOverlayEntry,
} from "./dict/types.ts";

// テキスト → 結果。analyze（FrontendResult）/ analyzeWithWords（結果＋語アライメントを1解析で）/
// analyzeToNodes（NJD ノード列 = run_frontend 相当。細粒度は @hdae/yomi/njd）。
export { analyze, analyzeWithWords, type WordAlignedResult } from "./analyze.ts";
export { analyzeToNodes } from "./njd/frontend.ts";

// 中立の建材（モデル固有の梱包は呼び出し側で組む）。
export { moraToPhones } from "./g2p/phonemes.ts";
export { moraTones } from "./g2p/tones.ts";
export { punctuationMarks } from "./g2p/punctuation.ts";
export { wordPhoneAlignment } from "./g2p/word_alignment.ts";
export type {
  AccentPhrase,
  FrontendResult,
  Mora,
  PunctuationMark,
  WordPhones,
} from "./g2p/types.ts";
