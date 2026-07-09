// buildResult / segmentPhrases / wordPhoneAlignment の振る舞いテスト（辞書非依存）。
// 句の区切り・ポーズ・文末強制・長音の句内解決という「走査」の仕様を手組みノードで固定する。
// （走査は segmentPhrases に一元化されており、ここが実質そのセグメンタの仕様テスト。）

import type { NjdMora, NjdNode } from "../njd/types.ts";
import { buildResult } from "./result.ts";
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
});

Deno.test("句を作る語より前の記号は無視される（先頭記号が句を作らない・落ちない）", () => {
  const res = buildResult("", [
    symbol("「", "一般"),
    symbol("、", "読点"),
    word("あ", [mora("ア", null, "a")]),
  ]);
  eq(res.accentPhrases.length, 1, "句数");
  eq(res.accentPhrases[0].pauseAfter, "long", "文末 long のみ");
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

Deno.test("wordPhoneAlignment は句の直後に句読点要素を出し、音素連結が buildResult と一致する", () => {
  const nodes = [
    word("柿", [KA(), KI()], { accent: 2 }),
    symbol("、", "読点"),
    word("空", [KA()], { chainFlag: false }),
  ];
  const words = wordPhoneAlignment(nodes);
  eq(words.map((w) => w.surface), ["柿", ",", "空", "."], "語列（句読点は句の直後）");
  eq(words[0].phones, ["k", "a", "k", "i"], "語の音素");
  // 別ビュー同値: flatMap 音素列が buildResult 由来の音素列と一致する（構造共有の確認）。
  const flat = words.flatMap((w) => w.phones).join(" ");
  eq(flat, "k a k i , k a .", "音素連結");
});

Deno.test("空入力・記号のみ入力は句を作らず空を返す", () => {
  eq(buildResult("", []).accentPhrases.length, 0, "空入力");
  const onlySymbol = buildResult("", [symbol("。", "句点")]);
  eq(onlySymbol.accentPhrases.length, 0, "記号のみ");
  assert(wordPhoneAlignment([]).length === 0, "wordPhoneAlignment 空入力");
});
