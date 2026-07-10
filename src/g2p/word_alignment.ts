// 語（NJD ノード）単位の音素アライメント（モデル非依存）。
//
// 各要素は「1 NJD ノード = 1 語」または「実在記号1文字」に対応し、surface（表層）と
// phones（その語が生む音素列）を持つ。モデル側（例: BERT の word2ph 構築）が各語の
// 文字数と音素数を対応づけるための、中立な語境界＋音素情報を提供する。
// 記号要素は surface が正規化後テキスト上の生の1文字、phones がその正規形1個
// （punctuationMarks）。pauseAfter からの合成はしない — テキストに実在しない記号
// （文末 long 強制）は要素にならない（docs/decisions/0005）。
//
// 不変条件: 句の区切り・ポーズ・実在記号・モーラ生成は buildResult と同一の
// segmentPhrases / leadingPunctuationMarks（result.ts）に一元化されており、本モジュール
// はその別ビューに過ぎない。よって wordPhoneAlignment(...).flatMap(w => w.phones) は
// analyze(...) の leadingPunctuations ＋ 各句の（モーラ音素 ＋ punctuations）を並べた
// 音素列と構造的に一致する（word_alignment.test.ts が確認として表明）。
//
// モデル固有の番兵（PAD 等）は「語」ではないので、ここには含めない（docs/decisions/0001）。

import type { NjdNode } from "../njd/types.ts";
import { leadingPunctuationMarks, segmentPhrases } from "./result.ts";
import { moraToPhones } from "./phonemes.ts";
import type { PunctuationMark, WordPhones } from "./types.ts";

/**
 * NJD ノード列を語単位の音素アライメントへ落とす（segmentPhrases の語ビュー）。
 * - 実モーラを持つノード → 1 語（surface=ノード表層, phones=モーラ由来音素）。
 * - 実在記号1文字 → 1 要素（surface=生の1文字, phones=[正規形]）。句開始前の記号は
 *   先頭に、句開始後の記号はその句の語群の直後に、いずれも出現順で出る。
 * - pauseAfter からの合成はしない（実在しない文末 "." は出ない）。
 *
 * 縮退（ノードなし）ケースは空配列を返す。
 */
export const wordPhoneAlignment = (nodes: readonly NjdNode[]): WordPhones[] => {
  const words: WordPhones[] = [];
  const pushMark = (m: PunctuationMark) => words.push({ surface: m.surface, phones: [m.punct] });

  for (const m of leadingPunctuationMarks(nodes)) pushMark(m);
  for (const phrase of segmentPhrases(nodes)) {
    for (const w of phrase.words) {
      words.push({ surface: w.node.surface, phones: w.moras.flatMap(moraToPhones) });
    }
    for (const m of phrase.punctuations) pushMark(m);
  }
  return words;
};
