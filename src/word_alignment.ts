// 語（NJD ノード）単位の音素アライメント。
//
// 各要素は「1 NJD ノード = SBV2 の sep_text 相当の語」または「句読点1個」に対応し、
// surface（表層）と phones（その語が生む SBV2 音素列）を持つ。BERT の word2ph
// （各文字に音素を何個割り当てるか）を synth 側アダプタが組み立てるための、
// モデル非依存な語境界＋音素情報を提供する（ADR-0008 決定2）。
//
// MUST（ADR-0008 決定3）: phones の生成は sbv2_bridge.ts（toSbv2PhoneTone）と
// 同じ共有ヘルパ（nodeToMoras / moraToPhones / pausePunct）を使い、句読点の位置も
// buildResult / toSbv2PhoneTone と同じ規則（記号ノード→pauseAfter、文末は必ず long）に
// 従う。wordPhoneAlignment(...).flatMap(w => w.phones) は toSbv2PhoneTone(...).phones の
// 両端 "_" を除いた中身と完全一致する（word_alignment_test.ts の表明テストで検証）。
//
// 両端 PAD "_" は「語」ではなくモデルアダプタの番兵なので、ここには含めない。

import { moraSize, type NjdNode } from "./njd/node.ts";
import { symbolPause } from "./njd/result.ts";
import { moraToPhones, nodeToMoras } from "./phonemes.ts";
import { pausePunct } from "./sbv2_bridge.ts";

/** 語アライメントの1要素（1 NJD ノード、または句読点1個）。 */
export type WordPhones = {
  /** 語の表層（NJD ノード表層）、または句読点記号（","/"."）。 */
  surface: string;
  /** その語が生む SBV2 音素列（両端 "_" は含まない）。 */
  phones: string[];
};

/**
 * NJD ノード列を語単位の音素アライメントへ落とす。
 *
 * toSbv2PhoneTone と同じ走査:
 * - 実モーラを持つノード → 1 語（surface=ノード表層, phones=モーラ由来音素）。
 * - 記号ノード（実モーラ0）→ 句を作らず、直前の句の pauseAfter を決める。
 * - pauseAfter が生む句読点 ","/"." → 独立した語要素（surface=記号, phones=[","]/["."]）。
 * - 文末の句は必ず long なので末尾に "." 要素が出る（toSbv2PhoneTone と一致）。
 *
 * 縮退（句が無い）ケースは空配列を返す（toSbv2PhoneTone の両端 PAD のみに対応）。
 */
export const wordPhoneAlignment = (nodes: readonly NjdNode[]): WordPhones[] => {
  const words: WordPhones[] = [];
  // 句の区切り情報を語走査と同時に追う。pausePunct は句直後に1個だけ出るので、
  // 「直前の実モーラ語のインデックス」を覚えておき、その句が閉じるとき punct を挿入する。
  let pendingPause: "none" | "short" | "long" = "none";
  let hasOpenPhrase = false;
  // 長音解決の直前母音（句をまたがない）。新しい句の先頭でリセットする。
  let prevVowel: string | undefined;

  const flushPause = () => {
    const punct = pausePunct(pendingPause);
    if (punct !== undefined) words.push({ surface: punct, phones: [punct] });
    pendingPause = "none";
  };

  for (const node of nodes) {
    if (moraSize(node) === 0) {
      // 記号ノード: 直前の句の pause を更新する（buildResult と同じ）。
      const pause = symbolPause(node);
      if (pause !== undefined && hasOpenPhrase) pendingPause = pause;
      continue;
    }

    // 新しい句の開始（chainFlag!==true または最初の句）で、直前の句の pause を確定させる。
    if (node.chainFlag !== true || !hasOpenPhrase) {
      if (hasOpenPhrase) flushPause();
      hasOpenPhrase = true;
      prevVowel = undefined;
    }

    const moras = nodeToMoras(node, prevVowel);
    words.push({ surface: node.surface, phones: moras.flatMap(moraToPhones) });
    prevVowel = moras.at(-1)?.vowel ?? prevVowel;
  }

  // 文末の句は必ず long（buildResult と同じ）。開いている句があれば long で閉じる。
  if (hasOpenPhrase) {
    pendingPause = "long";
    flushPause();
  }

  return words;
};
