// テキスト → NJD ノード列（jpreprocess run_frontend / pyopenjtalk run_frontend 相当）。
// パイプライン順は jpreprocess NJD::preprocess と同一:
//   tokenize → from_tokens → pronunciation → digit_sequence → digit
//   → accent_phrase → accent_type → unvoiced_vowel

import type { JtdDictionary } from "../dict/dictionary.ts";
import type { OverlayDictionary } from "../dict/overlay.ts";
import { tokenize } from "../tokenizer/tokenizer.ts";
import { nodesFromTokens } from "./from_tokens.ts";
import { njdSetPronunciation } from "./pronunciation.ts";
import { njdDigitSequence } from "./digit_sequence.ts";
import { njdSetDigit } from "./digit.ts";
import { njdSetAccentPhrase } from "./accent_phrase.ts";
import { njdSetAccentType } from "./accent_type.ts";
import { njdSetUnvoicedVowel } from "./unvoiced_vowel.ts";
import type { NjdNode } from "./types.ts";

/**
 * テキスト → NJD ノード列（読み・アクセント確定済みの後処理単位）。
 * jpreprocess `run_frontend` / pyopenjtalk `run_frontend` に相当する低レベル API。
 * FrontendResult へまとめる前の生ノードが要る評価・デバッグや、語アライメント
 * （wordPhoneAlignment）と結果構築（buildResult）で同一解析を使い回す用途に使う。
 */
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
