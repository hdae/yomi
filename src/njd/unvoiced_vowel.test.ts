// njd_set_unvoiced_vowel（unvoiced_vowel.ts）の単体テスト。
//
// 既存 njd.test.ts が R2（語頭「し」）/ R3（連続無声化しない）/ R4（アクセント核）を
// カバーするため、本ファイルはそれと重複しない R1（です・ますの「す」先読み）/
// R0（フィラーは無声化しない）/ R5 例外ペア（s→s/sh・f/h→f/h/hy で無声化回避）に絞る。
//
// モーラは手書きリテラルで構成し mora_table に依存しない（njd.test.ts と同方針）。
// 期待値は unvoiced_vowel.ts のロジックを手組みノードで実行して観測し確定した。

import type { MoraSpec } from "../text/types.ts";
import type { NjdNode } from "./types.ts";
import { njdSetUnvoicedVowel } from "./unvoiced_vowel.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const m = (kana: string, consonant: string | null, vowel: string): MoraSpec => ({
  kana,
  consonant,
  vowel,
});

const TOUTEN: MoraSpec = { kana: "、", consonant: null, vowel: "", pseudo: "touten" };
const QUESTION: MoraSpec = { kana: "？", consonant: null, vowel: "", pseudo: "question" };

const node = (surface: string, pos: string[], moras: MoraSpec[], accent: number): NjdNode => ({
  surface,
  pos,
  moras: moras.map((spec) => ({ spec, voiced: true })),
  pronOrig: moras.map((s) => s.kana).join(""),
  accent,
  chainRule: null,
  chainFlag: undefined,
  isUnknown: false,
});

Deno.test("unvoiced_vowel R1: です の「す」は後続の擬似モーラで無声/有声が分岐する", () => {
  // R1 は「す」の次モーラ（次ノード先頭）を先読みし、疑問符 or 長音なら有声のまま残す。
  const desuTouten = [
    node("です", ["助動詞", "*", "*", "*", "特殊・デス", "基本形"], [
      m("デ", "d", "e"),
      m("ス", "s", "u"),
    ], 1),
    node("。", ["記号", "句点", "*", "*", "*", "*"], [TOUTEN], 0),
  ];
  njdSetUnvoicedVowel(desuTouten);
  assert(desuTouten[0].moras[1].voiced === false, "です。 の「す」は無声（読点前）");

  const desuQuestion = [
    node("です", ["助動詞", "*", "*", "*", "特殊・デス", "基本形"], [
      m("デ", "d", "e"),
      m("ス", "s", "u"),
    ], 1),
    node("？", ["記号", "一般", "*", "*", "*", "*"], [QUESTION], 0),
  ];
  njdSetUnvoicedVowel(desuQuestion);
  assert(desuQuestion[0].moras[1].voiced === true, "です？ の「す」は有声（疑問符前・上昇調）");
});

Deno.test("unvoiced_vowel R0: フィラーの母音は無声化しない（同じ音韻でも非フィラーは無声化）", () => {
  // [キ,ク] は無声子音 k に挟まれた i で R5 なら無声化するが、フィラーなら R0 が優先し有声。
  const filler = node("キク", ["フィラー", "*", "*", "*", "*", "*"], [
    m("キ", "k", "i"),
    m("ク", "k", "u"),
  ], 0);
  njdSetUnvoicedVowel([filler]);
  assert(filler.moras[0].voiced === true, "フィラーの「キ」は R0 で無声化しない");

  const meishi = node("キク", ["名詞", "一般", "*", "*", "*", "*"], [
    m("キ", "k", "i"),
    m("ク", "k", "u"),
  ], 0);
  njdSetUnvoicedVowel([meishi]);
  assert(meishi.moras[0].voiced === false, "同音韻でも名詞なら R5 で「キ」が無声化する");
});

Deno.test("unvoiced_vowel R5 例外ペア: s→s/sh・f/h→f/h/hy の連続では無声化が回避される", () => {
  // 2モーラ語（名詞・平板）の先頭 i/u が、後続子音との組で無声化するかを見る。
  const firstVoiced = (moras: MoraSpec[]): boolean => {
    const n = node("x", ["名詞", "一般", "*", "*", "*", "*"], moras, 0);
    njdSetUnvoicedVowel([n]);
    return n.moras[0].voiced;
  };

  // 例外ペア（無声化しない = 有声のまま）。
  assert(firstVoiced([m("ス", "s", "u"), m("ス", "s", "u")]) === true, "s→s は無声化回避");
  assert(firstVoiced([m("ス", "s", "u"), m("シ", "sh", "i")]) === true, "s→sh は無声化回避");
  assert(firstVoiced([m("フ", "f", "u"), m("ヒ", "h", "i")]) === true, "f→h は無声化回避");

  // 例外に当たらない無声子音ペアは無声化する（対照）。
  assert(firstVoiced([m("ク", "k", "u"), m("ク", "k", "u")]) === false, "k→k は無声化する");
  assert(firstVoiced([m("ス", "s", "u"), m("ク", "k", "u")]) === false, "s→k は例外外で無声化する");
});
