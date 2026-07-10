// njd_set_digit の移植: 助数詞による数字読みの変化と日付の特殊読み。
// - 小数点（数字．数字）→「テン」ノード化と 0/2/5/6 の読み調整
// - class1: 助数詞に応じた数字側の読み置換（一分 → イッ）
// - class2: 数字に応じた助数詞側の連濁/半濁（分 → プン）
// - numeral: 位取り語（百+六→ロッ等）の連声と位取り語自体の連濁
// - class3/others: 特殊読み（棟→ムネ、一人→ヒトリ、一日→ツイタチ）
// - 日付: 十四日→ジューヨッカ、二十日→ハツカ、二十四日→ニジュー・ヨッカ

import {
  CLASS1_CONVERSION,
  CLASS2_CONVERSION,
  CLASS3_CONVERSION,
  CLASS3_KEYS,
  type DigitType,
  NUMERAL_DIGIT_CONVERSION,
  NUMERAL_LIST4,
  NUMERAL_LIST5,
  NUMERAL_NUMERATIVE_CONVERSION,
  OTHERS_CONVERSION,
  type PronSpec,
  SEMIVOICED_MORA,
  VOICED_MORA,
} from "./digit_lut.ts";
import { makeMoras } from "./node.ts";
import type { NjdNode } from "./types.ts";
import { isKazu, isKigou } from "./pos.ts";
import { makeRuleNode, resetNode, setPron } from "./rule_node.ts";
import { splitMorasWithRanges } from "../text/mora_table.ts";

const isPeriod = (s: string) => s === "．" || s === "・";
const isFukushiKanou = (n: NjdNode) => n.pos[0] === "名詞" && n.pos[1] === "副詞可能";
const isJosuushi = (n: NjdNode) =>
  n.pos[0] === "名詞" && n.pos[1] === "接尾" && n.pos[2] === "助数詞";
const isCounterContext = (n: NjdNode) => isFukushiKanou(n) || isJosuushi(n);

/** find_pron_conv_set 互換: 集合ヒットした最初の組で table.get して打ち切り。 */
const findConv = <V>(
  table: { keys: Set<string>; table: Map<string, V> }[],
  key1: string,
  key2: string,
): V | undefined => {
  for (const { keys, table: t } of table) {
    if (keys.has(key1)) return t.get(key2);
  }
  return undefined;
};

const applyPron = (node: NjdNode, spec: PronSpec): void => setPron(node, spec.kana, spec.accent);

/** 先頭モーラの清音を濁音/半濁音に変換する（Mora::convert_to_(semi)voiced_sound）。 */
const voiceFirstMora = (node: NjdNode, type: DigitType): void => {
  const first = node.moras[0];
  if (first === undefined || first.spec.pseudo) return;
  const map = type === "voiced" ? VOICED_MORA : SEMIVOICED_MORA;
  const converted = map.get(first.spec.kana);
  if (converted === undefined) return;
  const segs = splitMorasWithRanges(converted);
  if (segs.length !== 1 || segs[0].moras.length !== 1) {
    throw new Error(`内部エラー: 濁音化結果 ${converted} が1モーラでない`);
  }
  node.moras[0] = makeMoras(segs[0].moras, first.voiced ? [] : [0])[0];
};

const TEN_FEATURE = "．,名詞,接尾,助数詞,*,*,*,．,テン,テン,0/2,*,-1";
const TSUITACHI = "一日,名詞,副詞可能,*,*,*,*,一日,ツイタチ,ツイタチ,4/4,*";
const JUYOKKA = "十四日,名詞,副詞可能,*,*,*,*,十四日,ジュウヨッカ,ジューヨッカ,1/5,*";
const JUYOKKAKAN =
  "十四日間,名詞,副詞可能,*,*,*,*,十四日間,ジュウヨッカカン,ジューヨッカカン,5/7,*";
const NIJU = "二十,名詞,副詞可能,*,*,*,*,二十,ニジュウ,ニジュー,1/3,*";
const YOKKA = "四日,名詞,副詞可能,*,*,*,*,四日,ヨッカ,ヨッカ,0/3,*,0";
const YOKKAKAN = "四日間,名詞,副詞可能,*,*,*,*,四日間,ヨッカカン,ヨッカカン,3/5,*,0";
const HATSUKA = "二十日,名詞,副詞可能,*,*,*,*,二十日,ハツカ,ハツカ,0/3,*";
const HATSUKAKAN = "二十日間,名詞,副詞可能,*,*,*,*,二十日間,ハツカカン,ハツカカン,3/5,*";

/** 助数詞による数字読みの変化・日付の特殊読みを適用する（njd_set_digit 移植）。 */
export const njdSetDigit = (nodes: NjdNode[]): NjdNode[] => {
  // ---- 小数点（prev=数, node=．・, next=数）----
  {
    type SkipState = "disabled" | "ifMeishi" | "skipping";
    // NOTE: 遷移と continue/フォールスルーの別は本家 jpreprocess 0.15.0 digit/mod.rs:37-50 と
    // 腕単位で対応（連続セパレータ「1・2・3」で2つ目が脱落するのも本家同挙動）。
    let skip: SkipState = "disabled";
    for (let i = 1; i + 1 < nodes.length; i++) {
      const [prev, node, next] = [nodes[i - 1], nodes[i], nodes[i + 1]];
      if (skip === "ifMeishi") {
        skip = "skipping";
        continue;
      }
      if (skip === "skipping") {
        if (node.pos[0] === "名詞") continue;
        skip = "disabled";
        continue;
      }
      if (
        node.surface !== "" &&
        prev.surface !== "" &&
        isPeriod(node.surface) &&
        isKazu(prev.pos) &&
        isKazu(next.pos)
      ) {
        nodes[i] = makeRuleNode(TEN_FEATURE);
        nodes[i].chainFlag = true;
        switch (prev.surface) {
          case "〇":
          case "０":
            setPron(prev, "レー", 1);
            break;
          case "二":
            setPron(prev, "ニー", 1);
            break;
          case "五":
            setPron(prev, "ゴー", 1);
            break;
          case "六":
            setPron(prev, "ロク", 1);
            break;
        }
        skip = "ifMeishi";
      }
    }
  }

  // ---- class1 / class2（数字 + 助数詞）----
  for (let i = 1; i < nodes.length; i++) {
    const [prev, node] = [nodes[i - 1], nodes[i]];
    if (!isKazu(prev.pos) || !isCounterContext(node)) continue;
    const conv1 = findConv(CLASS1_CONVERSION, node.surface, prev.surface);
    if (conv1 !== undefined) applyPron(prev, conv1);
    const conv2 = findConv(CLASS2_CONVERSION, node.surface, prev.surface);
    if (conv2 !== undefined) voiceFirstMora(node, conv2);
    prev.chainFlag = false;
    node.chainFlag = true;
  }

  // ---- numeral（位取り語の連声・連濁）----
  for (let i = 1; i < nodes.length; i++) {
    const [prev, node] = [nodes[i - 1], nodes[i]];
    if (!isKazu(prev.pos)) continue;
    if (isKazu(node.pos) && node.surface !== "") {
      if (NUMERAL_LIST4.has(prev.surface) && NUMERAL_LIST5.has(node.surface)) {
        prev.chainFlag = false;
        node.chainFlag = true;
      } else if (NUMERAL_LIST5.has(prev.surface) && NUMERAL_LIST4.has(node.surface)) {
        node.chainFlag = false;
      }
    }
    const conv1 = findConv(NUMERAL_DIGIT_CONVERSION, node.surface, prev.surface);
    if (conv1 !== undefined) applyPron(prev, conv1);
    const conv2 = findConv(NUMERAL_NUMERATIVE_CONVERSION, node.surface, prev.surface);
    if (conv2 !== undefined) voiceFirstMora(node, conv2);
  }

  // ---- class3 / others（特殊読み・人数・日付単体）----
  for (let i = 0; i + 1 < nodes.length; i++) {
    const prev = i > 0 ? nodes[i - 1] : undefined;
    const [node, next] = [nodes[i], nodes[i + 1]];
    if (next.surface === "") continue;
    if (!isKazu(node.pos)) continue;
    if (prev !== undefined && !isKigou(prev.pos) && isKazu(prev.pos)) continue;
    if (!isCounterContext(next)) continue;

    // class3: 助数詞の（表層, 発音）が一致するとき数字の読みを置換。
    // NOTE: Rust は読み(col12)キーだが、本辞書は発音(col13)のみ保持するため
    // ビルド時に発音へ焼き直したキー集合（CLASS3_KEYS）で照合する。
    const c3 = CLASS3_KEYS.find((k) => k.surface === next.surface && k.prons.has(next.pronOrig));
    if (c3 !== undefined) {
      const conv = CLASS3_CONVERSION.get(node.surface);
      if (conv !== undefined) applyPron(node, conv);
    }

    // others: 数字+助数詞の丸ごと置換（一人→ヒトリ等）。「N月一日」はツイタチ。
    const line = findConv(OTHERS_CONVERSION, next.surface, node.surface);
    if (line !== undefined) {
      if (
        prev !== undefined &&
        prev.surface.includes("月") &&
        node.surface === "一" &&
        next.surface === "日"
      ) {
        nodes[i] = makeRuleNode(TSUITACHI);
      } else {
        nodes[i] = makeRuleNode(line);
      }
      resetNode(next);
    }
  }

  // ---- 日付の複合（十四日・二十日・二十四日）----
  if (nodes.length > 2) {
    for (let i = 0; i + 2 < nodes.length; i++) {
      const prev = i > 0 ? nodes[i - 1] : undefined;
      if (prev !== undefined && isKazu(prev.pos)) continue;
      const [node, nx1, nx2] = [nodes[i], nodes[i + 1], nodes[i + 2]];
      const nx3 = nodes[i + 3];

      const s = [node.surface, nx1.surface, nx2.surface, nx3?.surface] as const;
      if (s[0] === "十" && s[1] === "四" && s[2] === "日") {
        nodes[i] = makeRuleNode(JUYOKKA);
        resetNode(nx1);
        resetNode(nx2);
      } else if (s[0] === "十" && s[1] === "四" && s[2] === "日間") {
        nodes[i] = makeRuleNode(JUYOKKAKAN);
        resetNode(nx1);
        resetNode(nx2);
      } else if (s[0] === "二" && s[1] === "十" && s[2] === "四" && s[3] === "日") {
        nodes[i] = makeRuleNode(NIJU);
        nodes[i + 1] = makeRuleNode(YOKKA);
        resetNode(nx2);
        resetNode(nx3!);
      } else if (s[0] === "二" && s[1] === "十" && s[2] === "四" && s[3] === "日間") {
        nodes[i] = makeRuleNode(NIJU);
        nodes[i + 1] = makeRuleNode(YOKKAKAN);
        resetNode(nx2);
        resetNode(nx3!);
      } else if (s[0] === "二" && s[1] === "十" && s[2] === "日") {
        nodes[i] = makeRuleNode(HATSUKA);
        resetNode(nx1);
        resetNode(nx2);
      } else if (s[0] === "二" && s[1] === "十" && s[2] === "日間") {
        nodes[i] = makeRuleNode(HATSUKAKAN);
        resetNode(nx1);
        resetNode(nx2);
      }
    }
  }

  return nodes.filter((n) => n.moras.length > 0);
};
