// njd_digit_sequence（digit_sequence.ts）の単体テスト。
//
// 数字列を順読み（イチニーサン式）／桁読み（ヒャクニジューサン式）に振り分ける文脈スコア判定と、
// 桁読みの位取り語挿入・順読みの特殊音・カンマ整合・電話番号風・巨大数の早期returnを、
// 手組みの数字ノード列（辞書非依存）で縛る。
//
// 期待値の接地: pronunciation 通過後のノード列（＝この pass の入力）を実辞書で観測し、
// njdDigitSequence を通した結果を観測して確定した（想像で決めていない）。数字ノードは
// pronunciation 直後の実状態（名詞,数・全角表層・素の発音）を makeRuleNode で再現する。

import type { NjdNode } from "./types.ts";
import { njdDigitSequence } from "./digit_sequence.ts";
import { makeRuleNode } from "./rule_node.ts";
import { JtdDictionary } from "../dict/dictionary.ts";
import { analyze } from "../analyze.ts";
import { dictAvailable, dictPath } from "../_dict_path.ts";

const assertEquals = (actual: unknown, expected: unknown, msg: string) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
};

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const kanaOf = (node: NjdNode): string => node.moras.map((m) => m.spec.kana).join("");
const surfaces = (nodes: NjdNode[]): string => nodes.map((n) => n.surface).join("");
const kanas = (nodes: NjdNode[]): string => nodes.map((n) => kanaOf(n)).join("");

/** pronunciation 直後の1桁数字ノード（名詞,数・全角表層・素の発音）。 */
const digit = (surface: string, pron: string, acc: string): NjdNode =>
  makeRuleNode(`${surface},名詞,数,*,*,*,*,${surface},${pron},${pron},${acc},C3`);
const d0 = () => digit("０", "ゼロ", "1/2");
const d1 = () => digit("１", "イチ", "2/2");
const d2 = () => digit("２", "ニ", "1/1");
const d3 = () => digit("３", "サン", "0/2");
const d4 = () => digit("４", "ヨン", "1/2");
const d5 = () => digit("５", "ゴ", "1/1");
const d6 = () => digit("６", "ロク", "2/2");
const d7 = () => digit("７", "ナナ", "1/2");
const d8 = () => digit("８", "ハチ", "2/2");
/** 3桁区切りカンマ（pronunciation で 記号,数 の Touten 擬似モーラになる）。 */
const comma = () => makeRuleNode("，,記号,数,*,*,*,*,，,、,、,*,*");
/** ハイフン（U+FF0D）。HAIHUNS に属し score を負に振って順読みへ倒す。 */
const haihun = () => makeRuleNode("－,記号,一般,*,*,*,*,－,、,、,*,*");

Deno.test("digit_sequence: 桁読み — 1234 は位取り語(千/百/十)を挿入して千二百三十四になる", () => {
  const out = njdDigitSequence([d1(), d2(), d3(), d4()]);
  assertEquals(surfaces(out), "千二百三十四", "位取り語が桁位置に挿入される");
  assertEquals(kanas(out), "センニヒャクサンジューヨン", "桁読みの発音");
});

Deno.test("digit_sequence: 桁読み — 12345678 は万境界に位取り語「万」を挿入する", () => {
  const out = njdDigitSequence([d1(), d2(), d3(), d4(), d5(), d6(), d7(), d8()]);
  assertEquals(surfaces(out), "千二百三十四万五千六百七十八", "4桁ブロック境界に万が入る");
  assertEquals(
    kanas(out),
    "センニヒャクサンジューヨンマンゴセンロクヒャクナナジューハチ",
    "万境界桁読みの発音",
  );
});

Deno.test("digit_sequence: 先頭ゼロは順読みを強制する（桁読み文脈でも順読み）", () => {
  // 先頭ゼロ無しの 25 は桁読み（二十五）だが、先頭に 0 を足すと順読みへ倒れる。
  assertEquals(surfaces(njdDigitSequence([d2(), d5()])), "二十五", "25 は桁読み(位取り十)");
  assertEquals(kanas(njdDigitSequence([d2(), d5()])), "ニジューゴ", "25 桁読み発音");
  const out = njdDigitSequence([d0(), d2(), d5()]);
  assertEquals(surfaces(out), "０二五", "先頭ゼロで順読み（位取り語は入らない）");
  assertEquals(kanas(out), "ゼロニーゴー", "順読み特殊音 0=ゼロ・2=ニー・5=ゴー");
});

Deno.test("digit_sequence: 先頭ゼロの順読みは 2桁ごとに句を切る（chainFlag/accent パターン）", () => {
  const out = njdDigitSequence([d0(), d1(), d2(), d3()]);
  assertEquals(surfaces(out), "０一二三", "0123 順読み");
  assertEquals(kanas(out), "ゼロイチニーサン", "順読み発音（0=ゼロ・2=ニー）");
  // 偶数 index は句頭(chainFlag=false)、奇数 index は句内(chainFlag=true)。
  assertEquals(out.map((n) => n.chainFlag), [false, true, false, true], "2桁ごとの句切り");
  // 句頭かつ末尾でない位置は accent=3。
  assertEquals(out[0].accent, 3, "先頭 0 は句頭で accent3");
  assertEquals(out[2].accent, 3, "3桁目 2 も句頭で accent3");
});

Deno.test("digit_sequence: カンマが3桁区切りとして整合していれば桁読み（カンマ除去）", () => {
  const out = njdDigitSequence([d1(), comma(), d2(), d3(), d4(), comma(), d5(), d6(), d7()]);
  assertEquals(surfaces(out), "百二十三万四千五百六十七", "1,234,567 は桁読み・カンマは消える");
  assertEquals(kanas(out), "ヒャクニジューサンマンヨンセンゴヒャクロクジューナナ", "桁読み発音");
  assert(!out.some((n) => n.surface === "，"), "範囲内のカンマは除去される");
});

Deno.test("digit_sequence: カンマが3桁区切りとして不整合なら分割し、カンマは残す", () => {
  // 1,23 は「,」の後が2桁で不整合 → [1] と [23] に分割。単独桁の 1 は変換されず、
  // 23 だけ桁読み（二十三）。境界のカンマは数字列に含まれないため残る。
  const out = njdDigitSequence([d1(), comma(), d2(), d3()]);
  assertEquals(surfaces(out), "一，二十三", "不整合で分割・カンマは残存");
  assertEquals(kanas(out), "イチ、ニジューサン", "1 は素のイチ、23 は桁読み");
  assertEquals(out[1].surface, "，", "境界カンマが残る");
});

Deno.test("digit_sequence: ハイフン文脈（電話番号風）は score が負になり順読みへ倒れる", () => {
  // 23-45 は各列がハイフンに隣接 → score-2 で順読み（ニーサン / ヨンゴー）。
  const out = njdDigitSequence([d2(), d3(), haihun(), d4(), d5()]);
  assertEquals(surfaces(out), "二三－四五", "位取り語は入らない（順読み）");
  assertEquals(kanas(out), "ニーサン、ヨンゴー", "順読み特殊音 2=ニー・5=ゴー");
});

Deno.test("digit_sequence: 73桁以上は桁読みを早期returnし読み下す（位取り語を入れない）", () => {
  // NUMERAL_LIST3.length*4 = 72 桁が桁読みの上限。73桁は convertNumerical が早期 return し、
  // 位取り語を一切挿入しないまま元の数字ノードを読み下す。
  const many = Array.from({ length: 73 }, () => d1());
  const out = njdDigitSequence(many);
  assertEquals(out.length, 73, "ノード数は73のまま（位取り挿入なし）");
  assert(out.every((n) => n.surface === "一"), "全ノードが元の数字（正規化後の一）");
  assert(!out.some((n) => ["千", "百", "十", "万"].includes(n.surface)), "位取り語が入らない");
  assertEquals(kanaOf(out[0]), "イチ", "読み下し（素の発音イチ）");
});

// ---- 実辞書統合テスト（辞書が無い環境では skip。src/_dict_path.ts） ----

const dictExists = dictAvailable();

const loadDict = (() => {
  let cached: JtdDictionary | undefined;
  return () => {
    if (!cached) {
      const bytes = Deno.readFileSync(dictPath());
      cached = JtdDictionary.load(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        { verifyChecksums: false },
      );
    }
    return cached;
  };
})();

const reading = (text: string): string =>
  analyze(loadDict(), text).accentPhrases.flatMap((p) => p.moras.map((m) => m.kana)).join("");

Deno.test({
  name: "digit_sequence(実辞書): 1234 → 桁読み、1,234,567円 → カンマ整合桁読みがコア結果に伝播",
  ignore: !dictExists,
  fn() {
    assertEquals(reading("1234"), "センニヒャクサンジューヨン", "1234 桁読み");
    assertEquals(
      reading("1,234,567円"),
      "ヒャクニジューサンマンヨンセンゴヒャクロクジューナナエン",
      "1,234,567円 カンマ整合桁読み",
    );
    assertEquals(
      analyze(loadDict(), "1,234,567円").accentPhrases.length,
      7,
      "1,234,567円 は7アクセント句",
    );
  },
});

Deno.test({
  name: "digit_sequence(実辞書): 0.5秒 → 小数点テン込みでレーテンゴビョー",
  ignore: !dictExists,
  fn() {
    assertEquals(reading("0.5秒"), "レーテンゴビョー", "0.5秒 の読み");
  },
});
