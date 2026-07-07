// FrontendResult → Style-Bert-VITS2 の given_phone / given_tone への変換ブリッジ。
// 仕様の唯一の出典は docs/sbv2-g2p-interface.md（§1〜§4, §9）。
//
// SBV2 の音素・トーン規約（要点）:
// - 音素列は先頭・末尾に PAD "_"（tone 0）を必ず含む完全な列（§2, §9-5）。
// - 促音は "q" 1個・撥音は "N" 1個に潰す（子音は出さない。§3, §9-1/2）。
// - 長音は result.ts が直前母音に解決済みなので母音1個として出す（":" は使わない。§9-3）。
// - トーンは 0/1 の2値。各アクセント句で独立に 0 から立ち上がる（§4）。
// - 句境界そのものを表す記号は phone 列に無く、トーンの 0 戻りとして暗黙符号化される（§4, §9-6a）。

import type { FrontendResult } from "./njd/result.ts";
import { moraToPhones } from "./phonemes.ts";

export type Sbv2PhoneTone = { phones: string[]; tones: number[] };

/**
 * アクセント句内の各モーラのトーン（0/1）を核位置から決める（§4, §9-7）。
 * - 平板(k=0): 1モーラ目 0、以降 1
 * - 頭高(k=1): 1モーラ目 1、以降 0
 * - 中高/尾高(k>1): 1モーラ目 0、2..k 1、k+1 以降 0
 * 防御: 範囲外の核は尾高扱いにクランプ（k = min(nucleus, len)）。
 */
const moraTones = (accentNucleus: number, moraCount: number): number[] => {
  if (accentNucleus === 0) {
    // 平板: 句頭のみ低く、2モーラ目以降は高いまま下降しない。
    return Array.from({ length: moraCount }, (_, i) => (i === 0 ? 0 : 1));
  }
  // 範囲外核（辞書差・オーバーレイ由来）を尾高相当にクランプして fail loudly を避ける。
  const k = Math.min(accentNucleus, moraCount);
  if (k === 1) {
    // 頭高: 1モーラ目が高く、直後に下降。
    return Array.from({ length: moraCount }, (_, i) => (i === 0 ? 1 : 0));
  }
  // 中高/尾高: 句頭で立ち上がり、核モーラ k の後で下降。
  return Array.from({ length: moraCount }, (_, i) => (i >= 1 && i + 1 <= k ? 1 : 0));
};

/**
 * pauseAfter を SBV2 の punctuation 記号へ落とす（§9-6, リーダー決定）。
 * 読点由来 short→","、句点由来 long→"."。none は記号なし（句境界はトーンの0戻りのみ）。
 * 文末句も pauseAfter==="long"（result.ts で必ず long）なので末尾 "_" 直前に "." が出る。
 */
export const pausePunct = (pauseAfter: "none" | "short" | "long"): string | undefined => {
  if (pauseAfter === "short") return ",";
  if (pauseAfter === "long") return ".";
  return undefined;
};

/**
 * FrontendResult を SBV2 の given_phone / given_tone 形式へ変換する。
 * phones と tones は同じ長さで、位置ごとに対応する（tone は音素単位）。
 */
export const toSbv2PhoneTone = (result: FrontendResult): Sbv2PhoneTone => {
  // 縮退: 句が無ければ両端 PAD のみ（§9-5）。
  if (result.accentPhrases.length === 0) {
    return { phones: ["_", "_"], tones: [0, 0] };
  }

  // 先頭 PAD（§2, §9-5）。
  const phones: string[] = ["_"];
  const tones: number[] = [0];

  for (const phrase of result.accentPhrases) {
    const perMoraTone = moraTones(phrase.accentNucleus, phrase.moras.length);
    for (let i = 0; i < phrase.moras.length; i++) {
      const tone = perMoraTone[i];
      // NOTE: 1モーラを [consonant, vowel] に展開したとき、子音・母音とも同一トーンを振る（§9-7）。
      // 頭高型でモーラ1の子音が内蔵G2Pで tone 1/0 どちらになるかは docs §9 で「実測必要」とされる。
      // ここではモーラ単位で同一トーン（子音も 1）とし、実測検証は比較ハーネスで行う(Phase 4a)。
      for (const phone of moraToPhones(phrase.moras[i])) {
        phones.push(phone);
        tones.push(tone);
      }
    }
    // 句直後の punctuation（ポーズ）。none は句境界をトーンの0戻りだけで表す（§4, §9-6a）。
    const punct = pausePunct(phrase.pauseAfter);
    if (punct !== undefined) {
      phones.push(punct);
      tones.push(0);
    }
  }

  // 末尾 PAD（§2, §9-5）。
  phones.push("_");
  tones.push(0);

  // 不変条件: phone と tone は位置対応するので長さ一致必須（§6 の検証と同じ要請）。fail loudly。
  if (phones.length !== tones.length) {
    throw new Error(
      `sbv2_bridge invariant broken: phones.length(${phones.length}) !== tones.length(${tones.length})`,
    );
  }
  return { phones, tones };
};
