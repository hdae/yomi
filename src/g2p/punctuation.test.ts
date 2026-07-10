// punctuationMarks（記号→正規形写像）の単体仕様と、実辞書での punctuations /
// leadingPunctuations の統合検証（フィードバック元の実例を固定する）。

import { punctuationMarks } from "./punctuation.ts";
import { JtdDictionary } from "../dict/dictionary.ts";
import { analyze } from "../analyze.ts";
import { analyzeToNodes } from "../njd/frontend.ts";
import { leadingPunctuationMarks, segmentPhrases } from "./result.ts";
import { moraSize } from "../njd/node.ts";
import { dictAvailable, dictPath } from "../_dict_path.ts";

const assertEq = <T>(actual: T, expected: T, label: string) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: got ${a}, want ${e}`);
};

Deno.test("punctuationMarks: 正規形の全対象（normalizeForDict 後の形）を写す", () => {
  assertEq(
    punctuationMarks("、，。．！？…’−－"),
    [
      { surface: "、", punct: "," },
      { surface: "，", punct: "," },
      { surface: "。", punct: "." },
      { surface: "．", punct: "." },
      { surface: "！", punct: "!" },
      { surface: "？", punct: "?" },
      { surface: "…", punct: "…" },
      { surface: "’", punct: "'" },
      { surface: "−", punct: "-" },
      { surface: "－", punct: "-" },
    ],
    "全対象の写像",
  );
});

Deno.test("punctuationMarks: 表に無い文字は落ち、混在文字列は出現順を保つ", () => {
  assertEq(punctuationMarks("「‥　・』"), [], "括弧・二点リーダ・空白・中黒は対象外");
  assertEq(
    punctuationMarks("あ！い？"),
    [{ surface: "！", punct: "!" }, { surface: "？", punct: "?" }],
    "非記号文字はスキップし出現順",
  );
  assertEq(punctuationMarks(""), [], "空文字列");
});

// --- 実辞書統合テスト（辞書が無い環境では skip。src/_dict_path.ts） ---

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

Deno.test({
  name: "punctuations(実辞書): 句直後の実在記号が正規形で出る（そう…？ → […, ?]）",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    const r = analyze(dict, "そう…？");
    assertEq(r.accentPhrases.length, 1, "句数");
    assertEq(r.accentPhrases[0].punctuations, ["…", "?"], "実在記号の正規形列");
    assertEq(r.leadingPunctuations, [], "先頭記号なし");
    // pauseAfter は従来互換の導出値のまま（記号,一般 はポーズを作らず、文末で long）。
    assertEq(r.accentPhrases[0].pauseAfter, "long", "pauseAfter 互換");
  },
});

Deno.test({
  name: "punctuations(実辞書): 文頭の記号は leadingPunctuations に入る（…こんにちは）",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    const r = analyze(dict, "…こんにちは");
    assertEq(r.leadingPunctuations, ["…"], "文頭記号");
    assertEq(r.accentPhrases.map((p) => p.punctuations), [[]], "句側には付かない");
  },
});

Deno.test({
  name: "punctuations(実辞書): 実在句点の有無を文末で区別できる（要望②）",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    // どちらも最終句の pauseAfter は long（文末強制）だが、punctuations で区別できる。
    const withPeriod = analyze(dict, "そうだね。");
    const without = analyze(dict, "そうだね");
    assertEq(withPeriod.accentPhrases.at(-1)!.pauseAfter, "long", "句点あり: long");
    assertEq(without.accentPhrases.at(-1)!.pauseAfter, "long", "句点なし: long（文末強制）");
    assertEq(withPeriod.accentPhrases.at(-1)!.punctuations, ["."], "句点あり: '.' が実在");
    assertEq(without.accentPhrases.at(-1)!.punctuations, [], "句点なし: 実在記号なし");
  },
});

Deno.test({
  name: "punctuations(実辞書): ASCII 記号は全角化を経て写像される（a, b / 1-2 / it's）",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    // ", " は未知語1ノード（"，"+全角空白）に併合される → 文字単位写像で "," だけ残る。
    const r1 = analyze(dict, "a, b");
    assertEq(r1.accentPhrases.map((p) => p.punctuations), [[","], []], "ASCII カンマ");
    // "-" は −(U+2212) の 記号,一般 ノード → "-"（数詞に挟まれても読みを持たない）。
    const r2 = analyze(dict, "1-2");
    assertEq(r2.accentPhrases.map((p) => p.punctuations), [["-"], []], "ASCII ハイフン");
    // "'" は ’(U+2019) の 記号,括弧閉 ノード → "'"（品詞ではなく表層で写す）。
    const r3 = analyze(dict, "it's");
    assertEq(r3.accentPhrases.map((p) => p.punctuations), [[], ["'"], []], "アポストロフィ");
  },
});

Deno.test({
  name: "punctuations(実辞書): leading + 句別 punctuations = 全記号ノードの写像（漏れなし二分）",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    const CORPUS = [
      "そう…？",
      "…こんにちは",
      "え、そうなの！？",
      "…。",
      "「かっこ」と（まるかっこ）。",
      "a, b. c",
      "１−２＝−１",
    ];
    for (const text of CORPUS) {
      const nodes = analyzeToNodes(dict, text);
      // 参照: 全記号ノード（実モーラ0）の表層を出現順に写像したもの。
      const all = nodes.filter((n) => moraSize(n) === 0)
        .flatMap((n) => punctuationMarks(n.surface).map((m) => m.punct));
      const leading = leadingPunctuationMarks(nodes).map((m) => m.punct);
      const byPhrase = segmentPhrases(nodes).flatMap((p) => p.punctuations.map((m) => m.punct));
      assertEq([...leading, ...byPhrase], all, `[${text}] 二分の完全性`);
    }
  },
});
