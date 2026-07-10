// 記号 → 正規形句読点の写像（モデル非依存の中立集合）。
//
// 正規形の字母は "!" "?" "…" "," "." "'" "-" の7種。Style-Bert-VITS2 / AivisSpeech 系が
// 音素として受ける句読点集合と同一だが、特定モデルの規約としてではなく事実上の中立集合
// として採用した（docs/decisions/0005）。
//
// MUST: 写像は normalizeForDict 後の表層を「文字単位」で引く。ASCII ", " のように
// naist-jdic に無い記号は後続文字と併合された未知語1ノード（表層 "，"+全角空白）に
// なるため、ノード表層の完全一致では取りこぼす。
// 表に無い記号（括弧・空白・"‥" 等）は写像されず落ちる。ポーズ導出（pauseAfter）は
// 品詞ベース（symbolPause）のままで、この写像とは独立。

import type { PunctuationMark } from "./types.ts";

/**
 * 正規化後の記号1文字 → 正規形句読点。キーは normalizeForDict の出力で現れる形
 * （ASCII 記号は全角化されて届く）。
 */
const PUNCT_BY_CHAR: ReadonlyMap<string, string> = new Map([
  ["、", ","],
  ["，", ","], // ASCII "," の全角化先（U+FF0C）
  ["。", "."],
  ["．", "."], // ASCII "." の全角化先（U+FF0E）
  ["！", "!"], // ASCII "!" の全角化先（U+FF01）
  ["？", "?"], // ASCII "?" の全角化先（U+FF1F）
  ["…", "…"], // U+2026（正規化で不変）
  ["’", "'"], // ASCII "'" の全角化先（U+2019）
  ["−", "-"], // ASCII "-" の全角化先（U+2212 MINUS SIGN）
  ["－", "-"], // 全角ハイフンマイナス（U+FF0D、直接入力）
]);

/**
 * 表層文字列から実在記号の正規形対を抽出する（文字単位・出現順）。
 *
 * 正規形の字母は "!" "?" "…" "," "." "'" "-" の7種で、対象は
 * `、 ， 。 ． ！ ？ … ’ − －`（normalizeForDict 後の形）。表に無い文字
 * （括弧・空白・かな漢字など）は結果に含まれない。
 *
 * @param surface 正規化後の表層文字列（記号以外が混ざっていてもよい）。
 * @returns 実在記号の {surface: 生の1文字, punct: 正規形} 対の列。
 */
export const punctuationMarks = (surface: string): PunctuationMark[] => {
  const marks: PunctuationMark[] = [];
  for (const ch of surface) {
    const punct = PUNCT_BY_CHAR.get(ch);
    if (punct !== undefined) marks.push({ surface: ch, punct });
  }
  return marks;
};
