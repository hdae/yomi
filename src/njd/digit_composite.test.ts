// njd_set_digit（digit.ts）の日付複合と class3 前置数字ガードの単体テスト。
//
// digit_lut.test.ts が class1/class2/class3/numeral/others の各テーブル参照を縛るのに対し、
// 本ファイルは njdSetDigit の後段（日付の複合置換：十四日→ジューヨッカ / 二十日→ハツカ /
// 二十四日→ニジュー・ヨッカ、月一日→ツイタチ の特殊分岐）と、class3/others が「前が数字なら
// 適用しない」文脈判定（二人前）を縛る。
//
// 期待値の接地: 実辞書 analyze の観測（三月一日→…ツイタチ / 十四日→ジューヨッカ 等）と、
// njdSetDigit を手組みノードで実行した観測に基づく。入力ノードは naist-jdic の実表層/発音を
// makeRuleNode 形式（leftId/rightId/cost を除いた CSV 行）で再現する。

import type { NjdNode } from "./types.ts";
import { njdSetDigit } from "./digit.ts";
import { makeRuleNode } from "./rule_node.ts";
import { JtdDictionary } from "../dict/dictionary.ts";
import { analyze } from "../analyze.ts";
import { dictAvailable, dictPath } from "../_dict_path.ts";

const assertEquals = (actual: unknown, expected: unknown, msg: string) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
};

const kanaOf = (node: NjdNode): string => node.moras.map((m) => m.spec.kana).join("");
const surfaces = (nodes: NjdNode[]): string[] => nodes.map((n) => n.surface);

// naist-jdic 実データ（leftId/rightId/cost を除いた makeRuleNode 形式）。
const NI = () => makeRuleNode("二,名詞,数,*,*,*,*,二,ニ,ニ,1/1,C3");
const JU = () => makeRuleNode("十,名詞,数,*,*,*,*,十,ジュウ,ジュー,1/2,*");
const YON = () => makeRuleNode("四,名詞,数,*,*,*,*,四,ヨン,ヨン,1/2,C1");
const ICHI = () => makeRuleNode("一,名詞,数,*,*,*,*,一,イチ,イチ,2/2,C3");
const HI = () => makeRuleNode("日,名詞,接尾,助数詞,*,*,*,日,ヒ,ヒ,0/1,C3");
const SANGATSU = () => makeRuleNode("三月,名詞,副詞可能,*,*,*,*,三月,サンガツ,サンガツ,1/4,*");
const NINMAE = () => makeRuleNode("人前,名詞,接尾,助数詞,*,*,*,人前,ニンマエ,ニンマエ,0/4,C3");

Deno.test("digit(日付複合): 十 + 四 + 日 → 十四日（ジューヨッカ・核1）に丸ごと置換", () => {
  const out = njdSetDigit([JU(), YON(), HI()]);
  assertEquals(surfaces(out), ["十四日"], "3ノードが1ノードへ複合（四・日は無音化除去）");
  assertEquals(kanaOf(out[0]), "ジューヨッカ", "十四日の特殊読み");
  assertEquals(out[0].accent, 1, "核1（ジュウヨッカ 1/5）");
});

Deno.test("digit(日付複合): 二 + 十 + 日 → 二十日（ハツカ・核0）に丸ごと置換", () => {
  const out = njdSetDigit([NI(), JU(), HI()]);
  assertEquals(surfaces(out), ["二十日"], "3ノードが1ノードへ複合");
  assertEquals(kanaOf(out[0]), "ハツカ", "二十日の特殊読み");
  assertEquals(out[0].accent, 0, "核0");
});

Deno.test("digit(日付複合): 二 + 十 + 四 + 日 → 二十(ニジュー) + 四日(ヨッカ) の2ノードへ", () => {
  const out = njdSetDigit([NI(), JU(), YON(), HI()]);
  assertEquals(surfaces(out), ["二十", "四日"], "二十 と 四日 に分かれる（元の四・日は除去）");
  assertEquals(kanaOf(out[0]), "ニジュー", "二十の読み");
  assertEquals(kanaOf(out[1]), "ヨッカ", "四日の読み");
  assertEquals([out[0].accent, out[1].accent], [1, 0], "核は 1 と 0");
});

Deno.test("digit(others特殊分岐): 「月」を含む語 + 一 + 日 → 一日がツイタチ（イチニチでなく）", () => {
  // others CONV_TABLE5["一"] は通常イチニチだが、直前が「月」を含むとツイタチへ分岐する。
  const out = njdSetDigit([SANGATSU(), ICHI(), HI()]);
  assertEquals(surfaces(out), ["三月", "一日"], "三月 はそのまま・一日へ複合（元の日は除去）");
  assertEquals(kanaOf(out[0]), "サンガツ", "先行の三月は変換されず素通り");
  assertEquals(kanaOf(out[1]), "ツイタチ", "月直後の一日はツイタチ");
  assertEquals(out[1].accent, 4, "ツイタチは核4");
});

Deno.test("digit(class3ガード): 二 + 人前 → 二はニのまま（人前は class3 助数詞キーでない）", () => {
  // 人前は助数詞（counter context）だが class3/others の変換キーではないため、
  // 二→フタ（class3）も 二人→フタリ（others）も発火せず、二は素のニで残る。
  const out = njdSetDigit([NI(), NINMAE()]);
  assertEquals(surfaces(out), ["二", "人前"], "どちらのノードも複合・除去されない");
  assertEquals(kanaOf(out[0]), "ニ", "二はフタ化されずニのまま");
  assertEquals(kanaOf(out[1]), "ニンマエ", "人前はそのまま");
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
  name:
    "digit(実辞書): 三月一日→サンガツツイタチ / 十四日→ジューヨッカ / 二十日→ハツカ / 二十四日→ニジューヨッカ",
  ignore: !dictExists,
  fn() {
    assertEquals(reading("三月一日"), "サンガツツイタチ", "三月一日");
    assertEquals(reading("十四日"), "ジューヨッカ", "十四日");
    assertEquals(reading("二十日"), "ハツカ", "二十日");
    assertEquals(reading("二十四日"), "ニジューヨッカ", "二十四日");
  },
});
