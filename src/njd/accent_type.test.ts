// njdSetAccentType（njd_set_accent_type 移植）の振る舞いテスト。
// chainFlag で連結された句の核位置が、結合型（F/C/P）・数詞規則・特例に沿って
// 句先頭ノードの accent へ書き込まれることを検証する。
//
// 期待値の導出（タウトロジー回避）:
//  - 結合型 F/C/P は UniDic マニュアル 6.7「アクセント結合型」の意味から具体値を手計算する
//    （topAcc=句先頭核 / nodeAcc=当該語核 / moraAcc=句先頭〜直前語の累積モーラ数）。
//  - 数詞（calcDigitAcc）と特例は、実辞書 fixtures/naist-jdic.jtd を analyze した観測値で接地する
//    （末尾の dict-gated テスト参照）。手組みノード列はその観測核を再現するよう構成している。
//
// 2ノード連結列 [prev, cur]（cur.chainFlag=true）の場合、句先頭 = prev で
// moraAcc = moraSize(prev)、topNode = prev。njd_set_accent_type は topNodeAcc を先に、
// 数詞なら prevAcc を後に書くため、2数詞連結では最終核 = calcDigitAcc(prev, cur) になる。

import type { MoraSpec } from "../text/types.ts";
import type { NjdNode } from "./types.ts";
import { njdSetAccentType } from "./accent_type.ts";
import { parseChainRules } from "./chain_rules.ts";
import { makeRuleNode } from "./rule_node.ts";
import { analyze } from "../mod.ts";
import { JtdDictionary } from "../dict/dictionary.ts";
import { dictAvailable, dictPath } from "../_dict_path.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const m = (kana: string, consonant: string | null, vowel: string): MoraSpec => ({
  kana,
  consonant,
  vowel,
});

const node = (
  surface: string,
  pos: string[],
  moras: MoraSpec[],
  accent: number,
  chainRule: string,
  chainFlag: boolean | undefined,
): NjdNode => ({
  surface,
  pos,
  moras: moras.map((spec) => ({ spec, voiced: true })),
  pronOrig: moras.map((s) => s.kana).join(""),
  accent,
  chainRule: parseChainRules(chainRule),
  chainFlag,
  isUnknown: false,
});

const MEISHI = ["名詞", "一般", "*", "*", "*", "*"];
// 句先頭ノード「さくら」= 3モーラ（moraAcc=3 の起点）、後続ノード「むら」= 2モーラ。
const saKuRa = () => [m("サ", "s", "a"), m("ク", "k", "u"), m("ラ", "r", "a")];
const muRa = () => [m("ム", "m", "u"), m("ラ", "r", "a")];

/**
 * [先頭(3モーラ, accent=topAcc), 後続(2モーラ, accent=nodeAcc, chainRule, 連結)] を解析し、
 * 句先頭に書き込まれた核（= calcTopNodeAcc の結果）を返す。prev は名詞なので数詞規則は不発。
 */
const topNodeAccAfter = (chainRule: string, nodeAcc: number, topAcc: number): number => {
  const nodes = [
    node("さくら", MEISHI, saKuRa(), topAcc, "*", undefined),
    node("むら", MEISHI, muRa(), nodeAcc, chainRule, true),
  ];
  njdSetAccentType(nodes);
  return nodes[0].accent;
};

Deno.test("calcTopNodeAcc F1: 句先頭の核をそのまま維持", () => {
  // F1 = 前部要素の核を保持。topAcc=2 → 2。
  assert(topNodeAccAfter("F1", 1, 2) === 2, "F1 は topAcc を維持すべき");
});

Deno.test("calcTopNodeAcc F2: 平板時のみ moraAcc+addType、有核時は topAcc 維持", () => {
  // F2 topAcc=0 → addRule = max(0, moraAcc(3) + add(2)) = 5。
  assert(topNodeAccAfter("F2@2", 1, 0) === 5, "F2 平板時は moraAcc+add=5 になるべき");
  // F2 topAcc=2(有核) → topAcc 維持。
  assert(topNodeAccAfter("F2@2", 1, 2) === 2, "F2 有核時は topAcc=2 を維持すべき");
});

Deno.test("calcTopNodeAcc F3: 有核時のみ moraAcc+addType、平板時は topAcc(=0)維持", () => {
  // F3 topAcc=2(有核) → addRule = max(0, 3 + 1) = 4。
  assert(topNodeAccAfter("F3@1", 1, 2) === 4, "F3 有核時は moraAcc+add=4 になるべき");
  // F3 topAcc=0(平板) → topAcc 維持=0。
  assert(topNodeAccAfter("F3@1", 1, 0) === 0, "F3 平板時は 0 を維持すべき");
});

Deno.test("calcTopNodeAcc F5: 常に平板化（0）", () => {
  assert(topNodeAccAfter("F5", 1, 2) === 0, "F5 は常に 0 にすべき");
});

Deno.test("calcTopNodeAcc C1: moraAcc + 当該語核（後続語の核を句先頭からの位置へ）", () => {
  // C1 = moraAcc(3) + nodeAcc(1) = 4。
  assert(topNodeAccAfter("C1", 1, 2) === 4, "C1 は moraAcc+nodeAcc=4 になるべき");
});

Deno.test("calcTopNodeAcc C3: moraAcc（後続語の直前位置に核）", () => {
  // C3 = moraAcc(3)。後続語核 nodeAcc は無視される。
  assert(topNodeAccAfter("C3", 1, 2) === 3, "C3 は moraAcc=3 になるべき");
});

Deno.test("calcTopNodeAcc C4: 常に平板化（0）", () => {
  assert(topNodeAccAfter("C4", 1, 2) === 0, "C4 は常に 0 にすべき");
});

Deno.test("calcTopNodeAcc C5: 句先頭の核を維持", () => {
  assert(topNodeAccAfter("C5", 1, 2) === 2, "C5 は topAcc=2 を維持すべき");
});

Deno.test("calcTopNodeAcc P1: 平板時は0、有核時は moraAcc+当該語核", () => {
  assert(topNodeAccAfter("P1", 1, 0) === 0, "P1 平板時は 0 にすべき");
  assert(topNodeAccAfter("P1", 1, 2) === 4, "P1 有核時は moraAcc+nodeAcc=4 になるべき");
});

Deno.test("calcTopNodeAcc P6: 常に平板化（0）", () => {
  assert(topNodeAccAfter("P6", 1, 2) === 0, "P6 は常に 0 にすべき");
});

Deno.test("calcTopNodeAcc P14: 有核時は moraAcc+当該語核、平板時は topAcc(=0)維持", () => {
  assert(topNodeAccAfter("P14", 1, 2) === 4, "P14 有核時は moraAcc+nodeAcc=4 になるべき");
  assert(topNodeAccAfter("P14", 1, 0) === 0, "P14 平板時は 0 を維持すべき");
});

Deno.test("負値クランプ: moraAcc+addType が負なら核は 0（Rust の usize wrap を採らない意図的逸脱）", () => {
  // 先頭1モーラ（moraAcc=1）+ F4@-3 → 生値 1-3 = -2。クランプで 0（docs/limitations.md）。
  const nodes = [
    node("き", MEISHI, [m("キ", "k", "i")], 1, "*", undefined),
    node("むら", MEISHI, muRa(), 1, "F4@-3", true),
  ];
  njdSetAccentType(nodes);
  assert(nodes[0].accent === 0, "負値は 0 にクランプされるべき（wrap した巨大値にしない）");
});

// --- 数詞（calcDigitAcc）: 数詞+位取り の2ノード連結。核 = calcDigitAcc(prev, cur, 次) ---
// 発音は fixtures を analyze した後段（連濁後）カナに合わせる。核・モーラ数フィールドは
// C3・実モーラ数で埋める（下位フィールドの核は prevAcc 上書きで最終核に影響しない）。
const dnode = (surface: string, pron: string, chained: boolean): NjdNode =>
  makeRuleNode(
    `${surface},名詞,数,*,*,*,*,${surface},${pron},${pron},0/${pron.length},C3${
      chained ? ",1" : ""
    }`,
  );

/** [prev数詞, cur数詞(連結)] の句先頭核（2数詞連結では calcDigitAcc(prev, cur) と一致）。 */
const digitNucleus = (
  prevSurface: string,
  prevPron: string,
  curSurface: string,
  curPron: string,
): number => {
  const nodes = [dnode(prevSurface, prevPron, false), dnode(curSurface, curPron, true)];
  njdSetAccentType(nodes);
  return nodes[0].accent;
};

Deno.test("calcDigitAcc 十: 七百=2 / 二百=3 / 三百=1（七→2, 二→桁和, 三→1の分岐）", () => {
  // 百: prev=七 → 2 / prev∈{三,四,九,何} → 1 / それ以外 → moraSize(prev)+moraSize(cur)。
  assert(digitNucleus("七", "ナナ", "百", "ヒャク") === 2, "七百 は 2");
  assert(digitNucleus("二", "ニ", "百", "ヒャク") === 3, "二百 は moraSize和 1+2=3");
  assert(digitNucleus("三", "サン", "百", "ビャク") === 1, "三百 は 1");
});

Deno.test("calcDigitAcc 千: moraSize(prev)+1（三千=3）", () => {
  assert(digitNucleus("三", "サン", "千", "ゼン") === 3, "三千 は moraSize(三)+1=3");
});

Deno.test("calcDigitAcc 億: prev∈{一,六,七,八,幾}→2 それ以外→1（一億=2 / 五億=1）", () => {
  assert(digitNucleus("一", "イチ", "億", "オク") === 2, "一億 は 2");
  assert(digitNucleus("五", "ゴ", "億", "オク") === 1, "五億 は 1");
});

Deno.test("calcDigitAcc 兆: prev∈{六,七}→2 それ以外→1（六兆=2）", () => {
  assert(digitNucleus("六", "ロク", "兆", "チョー") === 2, "六兆 は 2");
});

Deno.test("calcDigitAcc 十: 後続数詞が無ければ 1（二十=1 / 五十=1）", () => {
  // 十: prev∈{五,六,八} かつ 次が数詞 のとき 0、そうでなければ 1。
  // 2ノード列は next=undefined なので、五十 でも 1 になる（五十三 と対比）。
  assert(digitNucleus("二", "ニ", "十", "ジュー") === 1, "二十 は 1");
  assert(digitNucleus("五", "ゴ", "十", "ジュー") === 1, "五十（後続なし）は 1");
});

Deno.test("十＋数詞→平板 特例: 十一 は 十=平板(0)・一=そのまま(2) の別句", () => {
  // 特例は句先頭処理側（i===0 || chainFlag!==true）で next が数詞のとき current(十)=0 にする。
  // 実辞書では「一」は別アクセント句（chainFlag=false）なので、[十, 一(切断)] で再現。
  const nodes = [
    makeRuleNode("十,名詞,数,*,*,*,*,十,ジュー,ジュー,1/2,C3"),
    makeRuleNode("一,名詞,数,*,*,*,*,一,イチ,イチ,2/2,C3,0"), // chainFlag=false（別句）
  ];
  njdSetAccentType(nodes);
  assert(nodes[0].accent === 0, "十は後続数詞で平板(0)になるべき（辞書核1を上書き）");
  assert(nodes[1].accent === 2, "一は別句なので辞書核2のまま");
});

Deno.test("calcDigitAcc 五/六/八+十+数詞→0: 五十三 は 五十=平板(0)・三=平板(0)", () => {
  // 五十三: 五(切断)+十(連結)+三(切断)。calcDigitAcc(五,十,次=三) は
  // prev∈{五,六,八} かつ 次が数詞 → 0。句先頭「五」の核が 0 になる（二十=1 と対比）。
  const nodes = [
    makeRuleNode("五,名詞,数,*,*,*,*,五,ゴ,ゴ,1/1,C3"),
    makeRuleNode("十,名詞,数,*,*,*,*,十,ジュー,ジュー,1/2,C3,1"), // 連結
    makeRuleNode("三,名詞,数,*,*,*,*,三,サン,サン,0/2,C3,0"), // 別句
  ];
  njdSetAccentType(nodes);
  assert(nodes[0].accent === 0, "五（句先頭）は 五+十+数詞 の特例で 0 になるべき");
  assert(nodes[2].accent === 0, "三は別句・辞書核0のまま");
});

// --- dict-gated: 手組み核の接地。実辞書で全パイプラインを通した観測核と一致すること ---
const available = dictAvailable();

Deno.test({
  name: "実辞書接地: 五十三 → ゴジュー[核0] / サン[核0]・一億 → イチオク[核2]",
  ignore: !available,
  fn() {
    const bytes = Deno.readFileSync(dictPath());
    const dict = JtdDictionary.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const gojusan = analyze(dict, "五十三").accentPhrases;
    assert(gojusan.length === 2, `五十三 は2句のはず: ${gojusan.length}`);
    assert(gojusan[0].moras.map((x) => x.kana).join("") === "ゴジュー", "第1句は ゴジュー");
    assert(gojusan[0].accentNucleus === 0, `五十 の核は0: ${gojusan[0].accentNucleus}`);
    assert(gojusan[1].accentNucleus === 0, `三 の核は0: ${gojusan[1].accentNucleus}`);

    const ichioku = analyze(dict, "一億").accentPhrases;
    assert(ichioku.length === 1, `一億 は1句のはず: ${ichioku.length}`);
    assert(ichioku[0].moras.map((x) => x.kana).join("") === "イチオク", "句は イチオク");
    assert(ichioku[0].accentNucleus === 2, `一億 の核は2: ${ichioku[0].accentNucleus}`);
  },
});
