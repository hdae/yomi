// njd_digit_sequence の移植（jpreprocess 独自: 元 OpenJTalk に無い数字列前処理）。
// 数字列を「順読み」（123=イチニーサン）か「桁読み」（123=ヒャクニジューサン）かを
// 文脈スコアで判別し、桁読みなら 十/百/千/万… のノードを挿入して表層を書き換える。

import { DIGIT_NORMALIZE, NUMERAL_LIST2, NUMERAL_LIST3, UNKNOWN_DICT_DIGITS } from "./digit_lut.ts";
import { isTouten } from "./node.ts";
import type { NjdNode } from "./types.ts";
import { isKazu } from "./pos.ts";
import { makeRuleNode, resetNode, setPron } from "./rule_node.ts";

// ---- 文脈スコア（digit_sequence/score.rs）----

const HAIHUNS = new Set(["―", "−", "‐", "—", "－"]);
const isPeriod = (s: string) => s === "．" || s === "・";

const isSuuSetsuzoku = (n: NjdNode) => n.pos[0] === "接頭詞" && n.pos[1] === "数接続";
const isFukushiKanou = (n: NjdNode) => n.pos[0] === "名詞" && n.pos[1] === "副詞可能";
const isJosuushi = (n: NjdNode) =>
  n.pos[0] === "名詞" && n.pos[1] === "接尾" && n.pos[2] === "助数詞";

const score = (nodes: NjdNode[], start: number, end: number): number => {
  let s = 0;
  if (start > 0) {
    const p1 = nodes[start - 1];
    if (isSuuSetsuzoku(p1)) s += 2;
    else if (isFukushiKanou(p1)) s += 1;
    else if (isJosuushi(p1)) s += 1;

    const p2 = start > 1 ? nodes[start - 2] : undefined;
    const p2IsKazu = p2 !== undefined && isKazu(p2.pos);
    if (isPeriod(p1.surface)) {
      if (p2IsKazu) s -= 5;
    } else if (HAIHUNS.has(p1.surface)) s -= 2;
    else if (p1.surface === "（" && p2IsKazu) s -= 2;
    else if (p1.surface === "）") s -= 2;
    else if (p1.surface === "番号") s -= 2;
    if (p2 !== undefined && p2.surface === "番号") s -= 2;
  }
  if (end + 1 < nodes.length) {
    const n1 = nodes[end + 1];
    if (isFukushiKanou(n1)) s += 2;
    else if (isJosuushi(n1)) s += 2;
    if (HAIHUNS.has(n1.surface)) s -= 2;
    else if (n1.surface === "（") s -= 2;
    else if (n1.surface === "）") {
      const n2 = nodes[end + 2];
      if (n2 !== undefined && isKazu(n2.pos)) s -= 2;
    } else if (n1.surface === "番号") s -= 2;
    else if (isPeriod(n1.surface)) s += 4;
  }
  return s;
};

// ---- 数字列の検出（digit_sequence/builder.rs）----

type Digit = { kind: "digit"; value: number } | { kind: "comma" };

const digitOf = (s: string): Digit | undefined => {
  switch (s) {
    case "一":
      return { kind: "digit", value: 1 };
    case "二":
      return { kind: "digit", value: 2 };
    case "三":
      return { kind: "digit", value: 3 };
    case "四":
      return { kind: "digit", value: 4 };
    case "五":
      return { kind: "digit", value: 5 };
    case "六":
      return { kind: "digit", value: 6 };
    case "七":
      return { kind: "digit", value: 7 };
    case "八":
      return { kind: "digit", value: 8 };
    case "九":
      return { kind: "digit", value: 9 };
    case "〇":
    case "０":
      return { kind: "digit", value: 0 };
    case "，":
      return { kind: "comma" };
    default:
      return undefined;
  }
};

type Sequence = {
  start: number;
  end: number;
  digits: number[];
  isNumericalReading: boolean | undefined;
};

const buildSequences = (nodes: NjdNode[]): Sequence[] => {
  const result: Sequence[] = [];
  let start = 0;
  let digits: Digit[] = [];
  let inSeq = false;

  const flush = () => {
    // 末尾のカンマを落とす（trim_digits）。
    while (digits.length > 0 && digits[digits.length - 1].kind !== "digit") digits.pop();
    if (digits.length > 0) result.push(...fromParsedDigits(start, digits));
    digits = [];
  };

  nodes.forEach((node, i) => {
    if (!inSeq && digits.length > 0) flush();
    const d = digitOf(node.surface);
    if (d === undefined) {
      inSeq = false;
      return;
    }
    if (!inSeq) {
      if (d.kind === "digit") {
        start = i;
        inSeq = true;
      } else {
        return; // 先頭のカンマは列を開始しない
      }
    }
    digits.push(d);
  });
  flush();

  for (const seq of result) {
    if (seq.isNumericalReading === undefined) {
      seq.isNumericalReading = score(nodes, seq.start, seq.end) >= 0;
    }
  }
  return result;
};

const zeroStart = (digits: Digit[]): boolean =>
  digits.length > 0 && digits[0].kind === "digit" && digits[0].value === 0;

/** カンマが3桁区切りとして完全に整合しているか（1つ以上あること）。 */
const isCommaSequence = (digits: Digit[]): boolean => {
  let commas = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = digits[digits.length - 1 - i];
    const isCommaPlace = i % 4 === 3;
    if (d.kind === "digit" && isCommaPlace) return false;
    if (d.kind === "comma") {
      if (!isCommaPlace) return false;
      commas++;
    }
  }
  return commas > 0;
};

const fromParsedDigits = (start: number, digits: Digit[]): Sequence[] => {
  const makeSeq = (
    s: number,
    chunk: Digit[],
    isNumerical: boolean | undefined,
  ): Sequence | undefined => {
    if (chunk.length <= 1) return undefined;
    return {
      start: s,
      end: s + chunk.length - 1,
      digits: chunk.flatMap((d) => (d.kind === "digit" ? [d.value] : [])),
      isNumericalReading: zeroStart(chunk) ? false : isNumerical,
    };
  };

  if (!zeroStart(digits) && isCommaSequence(digits)) {
    const seq = makeSeq(start, digits, true);
    return seq ? [seq] : [];
  }
  // カンマで分割し、各チャンクを独立の列にする。
  const out: Sequence[] = [];
  let s = start;
  let chunk: Digit[] = [];
  for (const d of digits.concat([{ kind: "comma" }])) {
    if (d.kind === "comma") {
      const seq = makeSeq(s, chunk, undefined);
      if (seq) out.push(seq);
      s += chunk.length + 1;
      chunk = [];
    } else {
      chunk.push(d);
    }
  }
  return out;
};

// ---- 変換 ----

/** 順読み（イチニーサン式）: 2桁ごとにアクセント句を切る。 */
const convertNonNumerical = (nodes: NjdNode[], seq: Sequence): void => {
  for (let i = 0; i < seq.digits.length; i++) {
    const node = nodes[seq.start + i];
    switch (seq.digits[i]) {
      case 0:
        setPron(node, "ゼロ", 1);
        break;
      case 2:
        setPron(node, "ニー", 1);
        break;
      case 5:
        setPron(node, "ゴー", 1);
        break;
    }
    node.chainRule = null;
    if (i % 2 === 0) {
      node.chainFlag = false;
      if (i !== seq.digits.length - 1) node.accent = 3;
    } else {
      node.chainFlag = true;
    }
  }
};

/** 桁読み（ヒャクニジューサン式）: 位取りノードを挿入。ノード数の増減を返す。 */
const convertNumerical = (nodes: NjdNode[], seq: Sequence): number => {
  // まず範囲内のカンマを除去。
  let offsetComma = 0;
  for (let i = seq.end; i >= seq.start; i--) {
    if (nodes[i].surface === "，") {
      nodes.splice(i, 1);
      offsetComma++;
    }
  }

  if (seq.digits.length > NUMERAL_LIST3.length * 4) return -offsetComma; // 大きすぎる数

  let haveDigitInBlock = false;
  let offset = 0;
  for (let i = 0; i < seq.digits.length; i++) {
    const digit = seq.digits[i];
    const nodesIndex = seq.start + i + offset;
    const revIndex = seq.digits.length - i - 1;

    if (digit === 0) resetNode(nodes[nodesIndex]);
    else haveDigitInBlock = true;

    if (revIndex % 4 === 0) {
      if (haveDigitInBlock && revIndex > 0) {
        nodes.splice(nodesIndex + 1, 0, makeRuleNode(NUMERAL_LIST3[revIndex / 4]));
        offset++;
      }
      haveDigitInBlock = false;
    } else if (digit === 1) {
      nodes[nodesIndex] = makeRuleNode(NUMERAL_LIST2[revIndex % 4]);
    } else if (digit !== 0) {
      nodes.splice(nodesIndex + 1, 0, makeRuleNode(NUMERAL_LIST2[revIndex % 4]));
      offset++;
    }
  }
  return offset - offsetComma;
};

// ---- 本体 ----

export const njdDigitSequence = (nodes: NjdNode[]): NjdNode[] => {
  // 1. 未知語の複数桁数字ノード（読点擬似モーラ1個 + 名詞,数）を1桁ずつに展開する。
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isTouten(node) || !isKazu(node.pos)) continue;
    const converted: NjdNode[] = [];
    let ok = true;
    for (const c of node.surface) {
      const line = UNKNOWN_DICT_DIGITS.get(c);
      if (line === undefined) {
        ok = false;
        break;
      }
      converted.push(makeRuleNode(line));
    }
    if (ok && converted.length > 0) {
      nodes.splice(i, 1, ...converted);
      i += converted.length - 1;
    }
  }

  // 2. 数字表層の正規化（１→一 等）。
  for (const node of nodes) {
    if (node.surface !== "*" && isKazu(node.pos)) {
      const replace = DIGIT_NORMALIZE.get(node.surface);
      if (replace !== undefined) node.surface = replace;
    }
  }

  // 3. 数字列の検出と変換（挿入・削除に伴う index ずれを offset で追う）。
  const sequences = buildSequences(nodes);
  let offset = 0;
  for (const seq of sequences) {
    seq.start += offset;
    seq.end += offset;
    if (seq.isNumericalReading === true) {
      offset += convertNumerical(nodes, seq);
    } else {
      convertNonNumerical(nodes, seq);
    }
  }

  // remove_silent_node: 発音が空（擬似モーラも無い）のノードを除去。
  return nodes.filter((n) => n.moras.length > 0);
};
