// NJD ノード列 → 中間表現 FrontendResult（docs/japanese-tts-browser-handoff.md §5）。
// アクセント句のグルーピング規約は jp-oracle convert.rs と同一:
// - 実モーラを持つノードを chainFlag でグルーピング。句核 = 句先頭ノードの accent
// - 記号ノード（実モーラ0）は句を作らず、直前の句の pauseAfter を決める
//   （品詞細分類 読点=short / 句点=long）。文末の句は必ず long

import { moraSize, type NjdNode } from "./node.ts";
import { nodeToMoras } from "../phonemes.ts";

export type Mora = {
  /** カタカナ1モーラ（拗音は1モーラ）。 */
  kana: string;
  /** 音素（例 "ky"）。母音のみのモーラは undefined。 */
  consonant?: string;
  /** "a|i|u|e|o|N|cl" ほか。長音は直前モーラの母音を引き継ぐ。 */
  vowel: string;
  /** 母音無声化。 */
  devoiced?: boolean;
};

export type AccentPhrase = {
  moras: Mora[];
  /** 1-origin。0 = 平板（核なし）。 */
  accentNucleus: number;
  pauseAfter: "none" | "short" | "long";
};

export type FrontendResult = {
  normalizedText: string;
  accentPhrases: AccentPhrase[];
};

export const buildResult = (normalizedText: string, nodes: readonly NjdNode[]): FrontendResult => {
  const phrases: AccentPhrase[] = [];

  for (const node of nodes) {
    if (moraSize(node) === 0) {
      // 記号ノード: 直前の句のポーズを決める。
      const pause = symbolPause(node);
      if (pause !== undefined && phrases.length > 0) {
        phrases[phrases.length - 1].pauseAfter = pause;
      }
      continue;
    }

    if (node.chainFlag !== true || phrases.length === 0) {
      phrases.push({ moras: [], accentNucleus: node.accent, pauseAfter: "none" });
    }
    const phrase = phrases[phrases.length - 1];
    // 長音解決の直前母音は句内の直前モーラを参照する（句をまたがない）。
    for (const mora of nodeToMoras(node, phrase.moras.at(-1)?.vowel)) {
      phrase.moras.push(mora);
    }
  }

  if (phrases.length > 0) phrases[phrases.length - 1].pauseAfter = "long";
  return { normalizedText, accentPhrases: phrases };
};

export const symbolPause = (node: NjdNode): "short" | "long" | undefined => {
  if (node.pos[0] !== "記号") return undefined;
  if (node.pos[1] === "読点") return "short";
  if (node.pos[1] === "句点") return "long";
  return undefined;
};
