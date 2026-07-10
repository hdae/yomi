// buildResult / segmentPhrases / wordPhoneAlignment の振る舞いテスト（辞書非依存）。
// 句の区切り・ポーズ・文末強制・長音の句内解決という「走査」の仕様を手組みノードで固定する。
// （走査は segmentPhrases に一元化されており、ここが実質そのセグメンタの仕様テスト。）

import type { NjdMora, NjdNode } from "../njd/types.ts";
import { buildResult } from "./result.ts";
import { moraToPhones } from "./phonemes.ts";
import { wordPhoneAlignment } from "./word_alignment.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const eq = (got: unknown, want: unknown, msg: string) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) throw new Error(`${msg}: got ${g} want ${w}`);
};

const mora = (kana: string, consonant: string | null, vowel: string): NjdMora => ({
  spec: { kana, consonant, vowel, pseudo: undefined },
  voiced: true,
});

/** 実モーラを持つ語ノード。 */
const word = (
  surface: string,
  moras: NjdMora[],
  opts: { accent?: number; chainFlag?: boolean } = {},
): NjdNode => ({
  surface,
  pos: ["名詞"],
  moras,
  pronOrig: "",
  accent: opts.accent ?? 0,
  chainRule: null,
  chainFlag: opts.chainFlag,
  isUnknown: false,
});

/** 記号ノード（実モーラ0）。 */
const symbol = (surface: string, pos1: "読点" | "句点" | "一般"): NjdNode => ({
  surface,
  pos: ["記号", pos1],
  moras: [{ spec: { kana: surface, consonant: null, vowel: "", pseudo: "touten" }, voiced: true }],
  pronOrig: "",
  accent: 0,
  chainRule: null,
  chainFlag: undefined,
  isUnknown: false,
});

const KA = () => mora("カ", "k", "a");
const KI = () => mora("キ", "k", "i");

Deno.test("chainFlag=true の語は直前の句へ連結され、句核は句先頭ノードの accent になる", () => {
  const res = buildResult("", [
    word("柿", [KA(), KI()], { accent: 2 }),
    word("木", [KI()], { accent: 1, chainFlag: true }),
    word("空", [KA()], { accent: 1, chainFlag: false }),
  ]);
  eq(res.accentPhrases.map((p) => p.moras.map((m) => m.kana).join("")), ["カキキ", "カ"], "句分割");
  eq(
    res.accentPhrases.map((p) => p.accentNucleus),
    [2, 1],
    "句核は句先頭の accent（連結語で不変）",
  );
});

Deno.test("読点は直前の句を short にし、句点は long にする（文末の句は必ず long に上書き）", () => {
  const res = buildResult("", [
    word("あ", [mora("ア", null, "a")]),
    symbol("、", "読点"),
    word("い", [mora("イ", null, "i")], { chainFlag: false }),
    symbol("。", "句点"),
    word("う", [mora("ウ", null, "u")], { chainFlag: false }),
    symbol("、", "読点"), // 文末: 読点でも long に強制される
  ]);
  eq(res.accentPhrases.map((p) => p.pauseAfter), ["short", "long", "long"], "pauseAfter");
  // punctuations は実在記号を保持する: 文末 long 強制でも実在したのは読点（","）。
  eq(res.accentPhrases.map((p) => p.punctuations), [[","], ["."], [","]], "punctuations");
});

Deno.test("句を作る語より前の記号は句に付かず leadingPunctuations に入る（未対応記号は落ちる）", () => {
  const res = buildResult("", [
    symbol("「", "一般"), // 括弧は正規形写像の対象外
    symbol("、", "読点"),
    word("あ", [mora("ア", null, "a")]),
  ]);
  eq(res.accentPhrases.length, 1, "句数");
  eq(res.accentPhrases[0].pauseAfter, "long", "文末 long のみ");
  eq(res.accentPhrases[0].punctuations, [], "先頭記号は句に付かない");
  eq(res.leadingPunctuations, [","], "先頭記号の正規形（「 は落ち 、 が残る）");
});

Deno.test("記号ノードは pauseAfter（品詞）と punctuations（表層）を独立に決める", () => {
  // ！？ は品詞 記号,一般（pauseAfter に影響しない）が、表層は正規形に写る。
  const res = buildResult("", [
    word("あ", [mora("ア", null, "a")]),
    symbol("！", "一般"),
    symbol("？", "一般"),
    word("い", [mora("イ", null, "i")], { chainFlag: false }),
  ]);
  eq(res.accentPhrases[0].pauseAfter, "none", "記号,一般 はポーズを作らない");
  eq(res.accentPhrases[0].punctuations, ["!", "?"], "実在記号は出現順で正規形に写る");
  eq(res.leadingPunctuations, [], "先頭記号なし");
});

Deno.test("記号ノードの複数文字表層は文字単位で写像される（未知語の記号連結）", () => {
  // ASCII ", " は naist-jdic に無く、全角空白と併合された1ノードになる。
  const res = buildResult("", [
    word("あ", [mora("ア", null, "a")]),
    symbol("，　", "一般"),
  ]);
  eq(res.accentPhrases[0].punctuations, [","], "， は写り 全角空白は落ちる");
});

Deno.test("連続する記号は最後が勝つ（読点→句点なら long）", () => {
  const res = buildResult("", [
    word("あ", [mora("ア", null, "a")]),
    symbol("、", "読点"),
    symbol("。", "句点"),
    word("い", [mora("イ", null, "i")], { chainFlag: false }),
  ]);
  eq(res.accentPhrases[0].pauseAfter, "long", "last-wins");
});

Deno.test("長音の直前母音は句内で解決され、句をまたぐと引き継がれず 'o' に縮退する", () => {
  const res = buildResult("", [
    word("カー", [KA(), mora("ー", "-", "long")]),
    // 新しい句の先頭が長音: 直前句の母音 a を引き継がず "o" に縮退する（句をまたがない）。
    word("ー", [mora("ー", "-", "long")], { chainFlag: false }),
  ]);
  eq(res.accentPhrases[0].moras.map((m) => m.vowel), ["a", "a"], "句内の長音は直前母音");
  eq(res.accentPhrases[1].moras.map((m) => m.vowel), ["o"], "句頭長音の縮退");
});

Deno.test("wordPhoneAlignment は実在記号を要素として出し、音素連結が buildResult と一致する", () => {
  const nodes = [
    symbol("…", "一般"), // 先頭記号 → 先頭要素
    word("柿", [KA(), KI()], { accent: 2 }),
    symbol("、", "読点"),
    word("空", [KA()], { chainFlag: false }),
    // 文末に実在記号なし → 合成 "." は出ない（pauseAfter=long は buildResult 側にだけ残る）。
  ];
  const words = wordPhoneAlignment(nodes);
  eq(words.map((w) => w.surface), ["…", "柿", "、", "空"], "語列（記号は生表層・出現順）");
  eq(words[0].phones, ["…"], "記号要素の phones は正規形1個");
  eq(words[1].phones, ["k", "a", "k", "i"], "語の音素");
  eq(words.flatMap((w) => w.phones).join(" "), "… k a k i , k a", "音素連結（文末合成 '.' なし）");
  // 別ビュー同値: flatMap 音素列が buildResult 由来（leading + 句毎の モーラ音素+punctuations）
  // と一致する（構造共有の確認）。
  const res = buildResult("", nodes);
  const fromResult = [
    ...res.leadingPunctuations,
    ...res.accentPhrases.flatMap((p) => [...p.moras.flatMap(moraToPhones), ...p.punctuations]),
  ];
  eq(words.flatMap((w) => w.phones), fromResult, "別ビュー同値");
});

Deno.test("空入力・記号のみ入力は句を作らず、記号は leading とアライメントに残る", () => {
  eq(buildResult("", []).accentPhrases.length, 0, "空入力");
  eq(buildResult("", []).leadingPunctuations, [], "空入力の leading");
  const onlySymbol = buildResult("", [symbol("。", "句点")]);
  eq(onlySymbol.accentPhrases.length, 0, "記号のみ: 句なし");
  eq(onlySymbol.leadingPunctuations, ["."], "記号のみ: 全記号が leading に入る");
  assert(wordPhoneAlignment([]).length === 0, "wordPhoneAlignment 空入力");
  eq(
    wordPhoneAlignment([symbol("。", "句点")]),
    [{ surface: "。", phones: ["."] }],
    "記号のみ: アライメントは記号要素1個",
  );
});
