// フロントエンドの最上位 API: テキスト → 中間表現（読み＋アクセント＋句境界）。
// パイプライン順は jpreprocess NJD::preprocess と同一:
//   tokenize → from_tokens → pronunciation → digit_sequence → digit
//   → accent_phrase → accent_type → unvoiced_vowel

import type { JtdDictionary } from "./dictionary.ts";
import type { OverlayDictionary } from "./overlay.ts";
import { normalizeForDict } from "./normalize.ts";
import { tokenize } from "./tokenizer.ts";
import { nodesFromTokens } from "./njd/from_tokens.ts";
import { njdSetPronunciation } from "./njd/pronunciation.ts";
import { njdDigitSequence } from "./njd/digit_sequence.ts";
import { njdSetDigit } from "./njd/digit.ts";
import { njdSetAccentPhrase } from "./njd/accent_phrase.ts";
import { njdSetAccentType } from "./njd/accent_type.ts";
import { njdSetUnvoicedVowel } from "./njd/unvoiced_vowel.ts";
import { buildResult, type FrontendResult } from "./njd/result.ts";
import type { NjdNode } from "./njd/node.ts";

/** NJD ノード列を返す低レベル API（評価・デバッグ用）。 */
export const analyzeToNodes = (
  dict: JtdDictionary,
  text: string,
  overlay?: OverlayDictionary,
): NjdNode[] => {
  const tokens = tokenize(dict, text, overlay);
  let nodes = njdSetPronunciation(nodesFromTokens(tokens));
  nodes = njdDigitSequence(nodes);
  nodes = njdSetDigit(nodes);
  njdSetAccentPhrase(nodes);
  njdSetAccentType(nodes);
  njdSetUnvoicedVowel(nodes);
  return nodes;
};

/** テキスト → FrontendResult（docs/japanese-tts-browser-handoff.md §5 の中間表現）。 */
export const analyze = (
  dict: JtdDictionary,
  text: string,
  overlay?: OverlayDictionary,
): FrontendResult => {
  return buildResult(normalizeForDict(text), analyzeToNodes(dict, text, overlay));
};
