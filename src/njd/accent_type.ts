// njd_set_accent_type の移植: chain_flag で連結された句の核位置を、
// 句先頭ノード(top_node)の accent へ書き込む。数詞連続には専用規則がある。
// 出典: jpreprocess accent_type.rs（規則の原典は UniDic マニュアル 6.7 アクセント結合型）。

import { getRule } from "./chain_rules.ts";
import { isKazu } from "./pos.ts";
import { moraSize } from "./node.ts";
import type { NjdNode } from "./types.ts";

/** chain_flag で連結された句の核位置を句先頭ノードの accent に書き込む（njd_set_accent_type 移植）。 */
export const njdSetAccentType = (nodes: NjdNode[]): void => {
  if (nodes.length === 0) return;
  let topNodeI = 0;
  let moraAcc = 0; // 句先頭からの累積モーラ数（current の直前まで）

  for (let i = 0; i < nodes.length; i++) {
    const current = nodes[i];
    const prev = i > 0 ? nodes[i - 1] : undefined;
    const next = i + 1 < nodes.length ? nodes[i + 1] : undefined;

    let topNodeAcc: number | undefined;
    let prevAcc: number | undefined;
    let currentAcc: number | undefined;

    if (i === 0 || current.chainFlag !== true) {
      topNodeI = i;
      moraAcc = 0;
      // 「十」の後に数詞が続くとき、十は平板になる（十一 ジュウイチ 等）。
      if (current.surface === "十" && next !== undefined && isKazu(next.pos)) {
        currentAcc = 0;
      }
    } else if (prev !== undefined) {
      topNodeAcc = calcTopNodeAcc(current, prev, nodes[topNodeI], moraAcc);
      if (isKazu(prev.pos) && isKazu(current.pos)) {
        prevAcc = calcDigitAcc(prev, current, next);
      }
    }

    moraAcc += moraSize(current);

    if (topNodeAcc !== undefined) nodes[topNodeI].accent = topNodeAcc;
    if (prevAcc !== undefined) nodes[i - 1].accent = prevAcc;
    if (currentAcc !== undefined) current.accent = currentAcc;
  }
};

/**
 * 結合型に応じた新しい句核位置。moraAcc = 句先頭から current 直前までの累積モーラ数。
 * 結合型の意味: F=動詞・形容詞など前部要素支配 / C=名詞的結合 / P=助詞・助動詞。
 */
const calcTopNodeAcc = (
  current: NjdNode,
  prev: NjdNode,
  topNode: NjdNode,
  moraAcc: number,
): number => {
  const nodeAcc = current.accent;
  const topAcc = topNode.accent;

  const rule = current.chainRule !== null ? getRule(current.chainRule, prev.pos) : undefined;
  if (rule === undefined) return topAcc;

  // NOTE: Rust は (mora_size as isize + add_type) as usize で負値が wrap する。負になる組は
  // 実データで発生する（browser-tts の golden 実測で 100k 文中 2 件）。wrap の再現は無意味な
  // 巨大値になるだけなので採らず 0 に丸める＝意図的な既知逸脱で、golden 照合側はこの 2 件を
  // 既知逸脱（allowlist）として扱う。docs/limitations.md 参照。
  const addRule = () => Math.max(0, moraAcc + rule.addType);

  switch (rule.accentType) {
    case "F1":
      return topAcc;
    case "F2":
      return topAcc === 0 ? addRule() : topAcc;
    case "F3":
      return topAcc !== 0 ? addRule() : topAcc;
    case "F4":
      return addRule();
    case "F5":
      return 0;
    case "C1":
      return moraAcc + nodeAcc;
    case "C2":
      return moraAcc + 1;
    case "C3":
      return moraAcc;
    case "C4":
      return 0;
    case "C5":
      return topAcc;
    // NOTE: P1 と P2 が同一式なのは本家準拠（jpreprocess 0.15.0 accent_type.rs:115-118 も
    // 同一。両者は結合規則の文字列表現が違うだけで計算に差はない）。
    case "P1":
      return topAcc === 0 ? 0 : moraAcc + nodeAcc;
    case "P2":
      return topAcc === 0 ? 0 : moraAcc + nodeAcc;
    case "P6":
      return 0;
    case "P14":
      return topAcc !== 0 ? moraAcc + nodeAcc : topAcc;
    default:
      return topAcc; // AccentType none / 未知の結合型はフォールバック（Rust の _ arm）
  }
};

/** 数詞連続（十・百・千・万・億・兆）のアクセント（accent_type.rs calc_digit_acc）。 */
const calcDigitAcc = (
  prev: NjdNode,
  current: NjdNode,
  next: NjdNode | undefined,
): number | undefined => {
  const p = prev.surface;
  const c = current.surface;
  const n = next?.surface;

  const DIGITS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

  if (c === "十") {
    if (["五", "六", "八"].includes(p) && n !== undefined && DIGITS.includes(n)) return 0;
    return 1;
  }
  if (c === "百") {
    if (p === "七") return 2;
    if (["三", "四", "九", "何"].includes(p)) return 1;
    return moraSize(prev) + moraSize(current);
  }
  if (c === "千") return moraSize(prev) + 1;
  if (c === "万") return moraSize(prev) + 1;
  if (c === "億") {
    if (["一", "六", "七", "八", "幾"].includes(p)) return 2;
    return 1;
  }
  if (c === "兆") {
    if (["六", "七"].includes(p)) return 2;
    return 1;
  }
  return undefined;
};
