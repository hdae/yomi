// moraToPhones / nodeToMoras（phonemes.ts）の振る舞いテスト。辞書に依存せず、
// 手組みの Mora / NjdNode リテラルで音素展開規則を固定する。期待値はベタ書きし、
// 実装の写経ではなく仕様の表明とする。

import { moraToPhones, nodeToMoras } from "./phonemes.ts";
import type { Mora } from "./types.ts";
import type { NjdMora, NjdNode } from "../njd/types.ts";

const eqPhones = (got: string[], want: string[]) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) throw new Error(`got ${g} want ${w}`);
};

const eqMoras = (got: Mora[], want: Mora[]) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) throw new Error(`got ${g} want ${w}`);
};

// 手組みの NjdMora / NjdNode（辞書不要）。nodeToMoras は node.moras しか見ないが、
// 型を満たすため他フィールドは中立値で埋める。
const njdMora = (
  kana: string,
  consonant: string | null,
  vowel: string,
  opts: { voiced?: boolean; pseudo?: "touten" | "question" } = {},
): NjdMora => ({
  spec: { kana, consonant, vowel, pseudo: opts.pseudo },
  voiced: opts.voiced ?? true,
});

const njdNode = (moras: NjdMora[]): NjdNode => ({
  surface: "",
  pos: [],
  moras,
  pronOrig: "",
  accent: 0,
  chainRule: null,
  chainFlag: undefined,
  isUnknown: false,
});

// --- moraToPhones ---

Deno.test("moraToPhones: 促音(vowel=cl)は子音を無視して[q]になる", () => {
  eqPhones(moraToPhones({ kana: "ッ", consonant: "cl", vowel: "cl" }), ["q"]);
});

Deno.test("moraToPhones: 撥音(vowel=N)は子音を無視して[N]になる", () => {
  eqPhones(moraToPhones({ kana: "ン", consonant: "N", vowel: "N" }), ["N"]);
});

Deno.test("moraToPhones: 子音あり(拗音 ky+a)は[子音,母音]に展開する", () => {
  eqPhones(moraToPhones({ kana: "キャ", consonant: "ky", vowel: "a" }), ["ky", "a"]);
});

Deno.test("moraToPhones: 子音なし(母音のみ)は[母音]だけになる", () => {
  eqPhones(moraToPhones({ kana: "ア", vowel: "a" }), ["a"]);
});

Deno.test("moraToPhones: devoicedフラグは音素列に影響しない（透過）", () => {
  eqPhones(moraToPhones({ kana: "ス", consonant: "s", vowel: "u", devoiced: true }), ["s", "u"]);
});

// --- nodeToMoras ---

Deno.test("nodeToMoras: 擬似モーラ(pseudo)はスキップされ音素モーラに残らない", () => {
  const node = njdNode([
    njdMora("カ", "k", "a"),
    njdMora("、", null, "", { pseudo: "touten" }),
    njdMora("キ", "k", "i"),
  ]);
  eqMoras(nodeToMoras(node, undefined), [
    { kana: "カ", consonant: "k", vowel: "a" },
    { kana: "キ", consonant: "k", vowel: "i" },
  ]);
});

Deno.test("nodeToMoras: 長音(vowel=long)は直前モーラの母音を引き継ぐ", () => {
  const node = njdNode([
    njdMora("カ", "k", "a"),
    njdMora("ー", "-", "long"),
  ]);
  eqMoras(nodeToMoras(node, undefined), [
    { kana: "カ", consonant: "k", vowel: "a" },
    { kana: "ー", vowel: "a" },
  ]);
});

Deno.test("nodeToMoras: 句頭長音(直前母音なし)は o に縮退する（フォールバック）", () => {
  const node = njdNode([njdMora("ー", "-", "long")]);
  eqMoras(nodeToMoras(node, undefined), [{ kana: "ー", vowel: "o" }]);
});

Deno.test("nodeToMoras: consonant '-'（長音の内部マーカー）は音素でないので落とされる", () => {
  const node = njdNode([njdMora("ー", "-", "long")]);
  // 直前母音 e を引き継ぎつつ、consonant キーは付かない。
  eqMoras(nodeToMoras(node, "e"), [{ kana: "ー", vowel: "e" }]);
});

Deno.test("nodeToMoras: 無声化(voiced=false)はdevoiced=true、有声はdevoicedを付けない", () => {
  const node = njdNode([
    njdMora("ス", "s", "u", { voiced: false }),
    njdMora("キ", "k", "i", { voiced: true }),
  ]);
  eqMoras(nodeToMoras(node, undefined), [
    { kana: "ス", consonant: "s", vowel: "u", devoiced: true },
    { kana: "キ", consonant: "k", vowel: "i" },
  ]);
});
