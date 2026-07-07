// njd_set_unvoiced_vowel の移植: 母音無声化フラグの確定。
// 規則（jpreprocess unvoiced_vowel.rs の doc より）:
//   R0 フィラーは無声化しない / R1 です・ますの「す」 / R2 動詞・助動詞・助詞の「し」 /
//   R3 連続無声化しない / R4 アクセント核では無声化しない /
//   R5 無声子音 k ky s sh t ty ch ts h f hy p py に挟まれた i/u（例外ペアあり）
//
// tri-state: undefined=未定, true=有声確定, false=無声確定（Rust の Option<bool>）。

import { isDoushi, isFiller, isJodoushi, isJoshi } from "./pos.ts";
import type { NjdMora, NjdNode } from "./node.ts";

type MoraState = {
  mora: NjdMora;
  nodeIndex: number;
  pos: readonly string[];
  flag: boolean | undefined;
  /** アクセント句先頭からのモーラ位置（0-origin）。 */
  midx: number;
  /** 句のアクセント核（句先頭ノードの accent）。 */
  atype: number;
};

const UNVOICED_CONSONANTS = new Set([
  "k",
  "ky",
  "s",
  "sh",
  "t",
  "ty",
  "ch",
  "ts",
  "h",
  "f",
  "hy",
  "p",
  "py",
]);

export const njdSetUnvoicedVowel = (nodes: NjdNode[]): void => {
  const states: MoraState[] = [];
  let midx = 0;
  let acc = 0;
  nodes.forEach((node, nodeIndex) => {
    if (node.chainFlag !== true) {
      midx = 0;
      acc = node.accent;
    }
    for (const mora of node.moras) {
      states.push({
        mora,
        nodeIndex,
        pos: node.pos,
        flag: mora.voiced ? undefined : false, // dict の ’ 由来は無声確定
        midx,
        atype: acc,
      });
      midx++;
    }
  });

  for (let i = 0; i < states.length; i++) {
    const curr = states[i];
    const next = states[i + 1];
    const nextnext = states[i + 2];

    /* R1: です・ます の「す」（先読み）。次が文末側で ？/ー が続くなら有声のまま */
    if (next !== undefined && nextnext !== undefined) {
      const indexOk = curr.nodeIndex === next.nodeIndex &&
        next.nodeIndex !== nextnext.nodeIndex;
      const posOk = isDoushi(next.pos as string[]) || isJodoushi(next.pos as string[]) ||
        next.pos[0] === "感動詞";
      const moraOk = (curr.mora.spec.kana === "マ" || curr.mora.spec.kana === "デ") &&
        next.mora.spec.kana === "ス" && !next.mora.spec.pseudo && !curr.mora.spec.pseudo;
      if (indexOk && posOk && moraOk) {
        next.flag = nextnext.mora.spec.pseudo === "question" ||
          nextnext.mora.spec.vowel === "long";
      }
    }

    /* R2: 語頭の「し」（動詞・助動詞・助詞）の先読み */
    if (next !== undefined) {
      const voicedOk = curr.flag !== false &&
        next.flag === undefined &&
        (nextnext === undefined || nextnext.flag !== false);
      const posOk = isDoushi(next.pos as string[]) || isJodoushi(next.pos as string[]) ||
        isJoshi(next.pos as string[]);
      const moraOk = next.mora.spec.kana === "シ" && !next.mora.spec.pseudo &&
        curr.nodeIndex !== next.nodeIndex &&
        (nextnext === undefined || nextnext.nodeIndex !== next.nodeIndex);
      if (voicedOk && posOk && moraOk) {
        if (next.atype === next.midx + 1) {
          /* R4: アクセント核 */
          next.flag = true;
        } else {
          /* R5 */
          next.flag = applyUnvoiceRule(next.mora, nextnext?.mora);
        }
        if (next.flag === false) {
          curr.flag ??= true;
          if (nextnext !== undefined) nextnext.flag ??= true;
        }
      }
    }

    /* 本体の判定 */
    if (curr.flag === undefined) {
      if (
        /* R0 */ isFiller(curr.pos as string[]) ||
          /* R3 */ next?.flag === false ||
          /* R4 */ curr.atype === curr.midx + 1
      ) {
        curr.flag = true;
      } else {
        /* R5 */
        curr.flag = applyUnvoiceRule(curr.mora, next?.mora);
      }
    }

    if (curr.flag === false && next !== undefined) {
      next.flag ??= true;
    }

    curr.mora.voiced = curr.flag ?? true;
  }
};

/**
 * R5: 無声子音に挟まれた i/u を無声化する（返り値 false = 無声化）。
 * undefined = 判定持ち越し（Rust の None）。
 * 例外ペア（s→s/sh、f/h→f/h/hy）は**無声化しない**（有声のまま true）。
 */
const applyUnvoiceRule = (curr: NjdMora, next: NjdMora | undefined): boolean | undefined => {
  if (next === undefined) return true;

  const currConsonant = curr.spec.consonant;
  const currVowel = curr.spec.vowel;
  const nextConsonant = next.spec.consonant;

  if (currVowel !== "i" && currVowel !== "u") return undefined;

  if (currConsonant === "s" && (nextConsonant === "s" || nextConsonant === "sh")) return true;
  if (
    (currConsonant === "f" || currConsonant === "h") &&
    (nextConsonant === "f" || nextConsonant === "h" || nextConsonant === "hy")
  ) {
    return true;
  }
  if (
    currConsonant !== null &&
    nextConsonant !== null &&
    UNVOICED_CONSONANTS.has(currConsonant) &&
    UNVOICED_CONSONANTS.has(nextConsonant)
  ) {
    return false;
  }
  return true;
};
