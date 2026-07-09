// 語（NJD ノード）単位の音素アライメント（モデル非依存）。
//
// 各要素は「1 NJD ノード = 1 語」または「句読点1個」に対応し、surface（表層）と
// phones（その語が生む音素列）を持つ。モデル側（例: BERT の word2ph 構築）が各語の
// 文字数と音素数を対応づけるための、中立な語境界＋音素情報を提供する。
//
// 不変条件: phones の生成はコア結果（buildResult）と同じ共有ヘルパ
// （nodeToMoras / moraToPhones / pausePunct）を使い、句読点の位置も同じ規則
// （記号ノード→pauseAfter、文末は必ず long）に従う。よって
// wordPhoneAlignment(...).flatMap(w => w.phones) は analyze(...).accentPhrases から
// 素直に組んだ音素列と完全一致する（word_alignment.test.ts の表明テストで検証）。
//
// モデル固有の番兵（PAD 等）は「語」ではないので、ここには含めない（docs/decisions/0001）。

import { moraSize, type NjdNode } from "./njd/node.ts";
import { symbolPause } from "./njd/result.ts";
import { moraToPhones, nodeToMoras } from "./phonemes.ts";

/**
 * pauseAfter を句読点記号へ落とす（中立）。読点由来 short→","、句点由来 long→"."。
 * none は記号なし。
 */
export const pausePunct = (pauseAfter: "none" | "short" | "long"): string | undefined => {
  if (pauseAfter === "short") return ",";
  if (pauseAfter === "long") return ".";
  return undefined;
};

/** 語アライメントの1要素（1 NJD ノード、または句読点1個）。 */
export type WordPhones = {
  /** 語の表層（NJD ノード表層）、または句読点記号（","/"."）。 */
  surface: string;
  /** その語が生む SBV2 音素列（両端 "_" は含まない）。 */
  phones: string[];
};

/**
 * NJD ノード列を語単位の音素アライメントへ落とす（buildResult と同じ走査）。
 * - 実モーラを持つノード → 1 語（surface=ノード表層, phones=モーラ由来音素）。
 * - 記号ノード（実モーラ0）→ 句を作らず、直前の句の pauseAfter を決める。
 * - pauseAfter が生む句読点 ","/"." → 独立した語要素（surface=記号, phones=[","]/["."]）。
 * - 文末の句は必ず long なので末尾に "." 要素が出る。
 *
 * 縮退（句が無い）ケースは空配列を返す。
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
