// NJD ノード列 → 中間表現 FrontendResult（読み・モーラ・アクセント核・句境界・実在記号）。
// アクセント句のグルーピング規約は jp-oracle convert.rs と同一:
// - 実モーラを持つノードを chainFlag でグルーピング。句核 = 句先頭ノードの accent
// - 記号ノード（実モーラ0）は句を作らず、直前の句の pauseAfter を決める
//   （品詞細分類 読点=short / 句点=long）。文末の句は必ず long
// - 加えて記号ノードの表層は正規形句読点（punctuationMarks）に写して保持する
//   （句開始後 → その句の punctuations / 句開始前 → leadingPunctuationMarks）。
//
// MUST: 句の区切り・核・ポーズ・実在記号・長音の直前母音の決定は segmentPhrases
// （先頭記号のみ leadingPunctuationMarks）に一元化する。buildResult と
// wordPhoneAlignment は同一セグメンテーション結果の別ビューであり、走査を
// 二重実装しない（片側だけの改修で黙って乖離する事故を構造的に断つ）。

import { moraSize } from "../njd/node.ts";
import type { NjdNode } from "../njd/types.ts";
import { nodeToMoras } from "./phonemes.ts";
import { punctuationMarks } from "./punctuation.ts";
import type { AccentPhrase, FrontendResult, PhraseSegment, PunctuationMark } from "./types.ts";

/**
 * NJD ノード列をアクセント句へセグメントする（句の区切り・核・ポーズ・実在記号の単一実装）。
 * - 実モーラを持つノードを chainFlag でグルーピングし、句核 = 句先頭ノードの accent。
 * - 記号ノードは句を作らず、直前の句の pauseAfter（品詞ベース・複数記号は最後が勝つ）と
 *   punctuations（表層の正規形写像・出現順）を決める。文末の句は必ず long。
 * - 先頭（句がまだ無い位置）の記号はここでは捨てられる — leadingPunctuationMarks が拾う
 *   （両者で全記号ノードを漏れなく二分する）。
 * - 長音の直前母音は句内の直前モーラから解決する（句をまたがない）。
 */
export const segmentPhrases = (nodes: readonly NjdNode[]): PhraseSegment[] => {
  const phrases: PhraseSegment[] = [];

  for (const node of nodes) {
    if (moraSize(node) === 0) {
      // 記号ノード: 直前の句のポーズと実在記号を決める（句がまだ無ければ leading 側）。
      if (phrases.length === 0) continue;
      const phrase = phrases[phrases.length - 1];
      const pause = symbolPause(node);
      if (pause !== undefined) phrase.pauseAfter = pause;
      phrase.punctuations.push(...punctuationMarks(node.surface));
      continue;
    }

    if (node.chainFlag !== true || phrases.length === 0) {
      phrases.push({ words: [], accentNucleus: node.accent, pauseAfter: "none", punctuations: [] });
    }
    const phrase = phrases[phrases.length - 1];
    // 長音解決の直前母音は句内の直前モーラを参照する（句をまたがない）。
    const prevVowel = phrase.words.at(-1)?.moras.at(-1)?.vowel;
    phrase.words.push({ node, moras: nodeToMoras(node, prevVowel) });
  }

  if (phrases.length > 0) phrases[phrases.length - 1].pauseAfter = "long";
  return phrases;
};

/**
 * 先頭のアクセント句より前（最初の実モーラノードより前）にある記号ノードから
 * 実在記号の正規形対を抽出する。segmentPhrases と対をなす単一実装（そちらは
 * 句開始後の記号を各句の punctuations に付ける）。記号だけの入力では全記号が
 * ここに入る。
 */
export const leadingPunctuationMarks = (nodes: readonly NjdNode[]): PunctuationMark[] => {
  const marks: PunctuationMark[] = [];
  for (const node of nodes) {
    if (moraSize(node) > 0) break;
    marks.push(...punctuationMarks(node.surface));
  }
  return marks;
};

/** NJD ノード列をアクセント句にまとめ、FrontendResult を組む。 */
export const buildResult = (normalizedText: string, nodes: readonly NjdNode[]): FrontendResult => {
  const accentPhrases: AccentPhrase[] = segmentPhrases(nodes).map((p) => ({
    moras: p.words.flatMap((w) => w.moras),
    accentNucleus: p.accentNucleus,
    pauseAfter: p.pauseAfter,
    punctuations: p.punctuations.map((m) => m.punct),
  }));
  return {
    normalizedText,
    accentPhrases,
    leadingPunctuations: leadingPunctuationMarks(nodes).map((m) => m.punct),
  };
};

/** 記号ノード（読点/句点）が直前の句に与えるポーズ長を返す。記号でなければ undefined。 */
export const symbolPause = (node: NjdNode): "short" | "long" | undefined => {
  if (node.pos[0] !== "記号") return undefined;
  if (node.pos[1] === "読点") return "short";
  if (node.pos[1] === "句点") return "long";
  return undefined;
};
