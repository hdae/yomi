// 語（NJD ノード）単位の音素アライメント（モデル非依存）。
//
// 各要素は「1 NJD ノード = 1 語」または「句読点1個」に対応し、surface（表層）と
// phones（その語が生む音素列）を持つ。モデル側（例: BERT の word2ph 構築）が各語の
// 文字数と音素数を対応づけるための、中立な語境界＋音素情報を提供する。
//
// 不変条件: 句の区切り・ポーズ・モーラ生成は buildResult と同一の segmentPhrases
// （result.ts）に一元化されており、本モジュールはその別ビューに過ぎない。よって
// wordPhoneAlignment(...).flatMap(w => w.phones) は analyze(...).accentPhrases から
// 素直に組んだ音素列と構造的に一致する（word_alignment.test.ts が確認として表明）。
//
// モデル固有の番兵（PAD 等）は「語」ではないので、ここには含めない（docs/decisions/0001）。

import type { NjdNode } from "../njd/types.ts";
import { segmentPhrases } from "./result.ts";
import { moraToPhones } from "./phonemes.ts";
import type { WordPhones } from "./types.ts";

/**
 * pauseAfter を句読点記号へ落とす（中立）。読点由来 short→","、句点由来 long→"."。
 * none は記号なし。
 */
export const pausePunct = (pauseAfter: "none" | "short" | "long"): string | undefined => {
  if (pauseAfter === "short") return ",";
  if (pauseAfter === "long") return ".";
  return undefined;
};

/**
 * NJD ノード列を語単位の音素アライメントへ落とす（segmentPhrases の語ビュー）。
 * - 実モーラを持つノード → 1 語（surface=ノード表層, phones=モーラ由来音素）。
 * - 句の pauseAfter が生む句読点 ","/"." → 句の直後に独立した語要素として出す。
 * - 文末の句は必ず long なので末尾に "." 要素が出る。
 *
 * 縮退（句が無い）ケースは空配列を返す。
 */
export const wordPhoneAlignment = (nodes: readonly NjdNode[]): WordPhones[] => {
  const words: WordPhones[] = [];
  for (const phrase of segmentPhrases(nodes)) {
    for (const w of phrase.words) {
      words.push({ surface: w.node.surface, phones: w.moras.flatMap(moraToPhones) });
    }
    const punct = pausePunct(phrase.pauseAfter);
    if (punct !== undefined) words.push({ surface: punct, phones: [punct] });
  }
  return words;
};
