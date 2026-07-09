// フロントエンドの最上位 API: テキスト → 中間表現（読み＋アクセント＋句境界）。
// njd（NJD ノード生成）と g2p（結果組み立て・語アライメント）を合成する薄いパス。

import type { JtdDictionary } from "./dict/dictionary.ts";
import type { OverlayDictionary } from "./dict/overlay.ts";
import { normalizeForDict } from "./text/normalize.ts";
import { analyzeToNodes } from "./njd/frontend.ts";
import { buildResult } from "./g2p/result.ts";
import { wordPhoneAlignment } from "./g2p/word_alignment.ts";
import type { FrontendResult, WordPhones } from "./g2p/types.ts";

/** テキスト → FrontendResult（読み・アクセント核・句境界を持つ中間表現）。 */
export const analyze = (
  dict: JtdDictionary,
  text: string,
  overlay?: OverlayDictionary,
): FrontendResult => {
  return buildResult(normalizeForDict(text), analyzeToNodes(dict, text, overlay));
};

/** analyzeWithWords の戻り値: 1解析で得た FrontendResult と語アライメント。 */
export type WordAlignedResult = {
  /** 読み・アクセント核・句境界の中間表現。 */
  result: FrontendResult;
  /** 語（NJD ノード）単位の音素アライメント（BERT word2ph 等の構築用）。 */
  words: WordPhones[];
};

/**
 * テキストを1回だけ解析し、FrontendResult と語アライメント（wordPhoneAlignment）を
 * まとめて返すシュガー。二重解析を避けつつ result（音素・トーン用）と words（word2ph 用）を
 * 同一解析から使い回したい合成用途向け。NjdNode を露出せずに両出力を得られる。
 */
export const analyzeWithWords = (
  dict: JtdDictionary,
  text: string,
  overlay?: OverlayDictionary,
): WordAlignedResult => {
  const nodes = analyzeToNodes(dict, text, overlay);
  return {
    result: buildResult(normalizeForDict(text), nodes),
    words: wordPhoneAlignment(nodes),
  };
};
