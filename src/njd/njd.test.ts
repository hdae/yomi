// jpreprocess の Rust 単体テストの移植（accent_type.rs / unvoiced_vowel.rs の #[test]）。
// モーラは手書きリテラルで構成し、mora_table に依存せずコアロジックを検証する。

import type { MoraSpec } from "../mora_table.ts";
import type { NjdNode } from "./node.ts";
import { njdSetAccentType } from "./accent_type.ts";
import { njdSetUnvoicedVowel } from "./unvoiced_vowel.ts";
import { parseChainRules } from "./chain_rules.ts";

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

Deno.test("accent_type: 牛飼じゃありませんよ → 句核9（Rust cow test。助動詞は動詞%スロットにマッチ）", () => {
  const nodes = [
    node(
      "牛飼",
      ["名詞", "固有名詞", "地域", "一般", "*", "*"],
      [
        m("ウ", null, "u"),
        m("シ", "sh", "i"),
        m("カ", "k", "a"),
        m("イ", null, "i"),
      ],
      2,
      "C2",
      undefined,
    ),
    node("じゃ", ["助詞", "副助詞", "*", "*", "*", "*"], [m("ジャ", "j", "a")], 0, "名詞%F1", true),
    node(
      "あり",
      ["助動詞", "*", "*", "*", "五段・ラ行アル", "連用形"],
      [
        m("ア", null, "a"),
        m("リ", "r", "i"),
      ],
      2,
      "動詞%F1",
      true,
    ),
    node(
      "ませ",
      ["助動詞", "*", "*", "*", "特殊・マス", "未然形"],
      [
        m("マ", "m", "a"),
        m("セ", "s", "e"),
      ],
      1,
      "動詞%F4@1/助詞%F2@1",
      true,
    ),
    node(
      "ん",
      ["助動詞", "*", "*", "*", "不変化型", "基本形"],
      [m("ン", null, "N")],
      1,
      "動詞%F4",
      true,
    ),
    node(
      "よ",
      ["助詞", "終助詞", "*", "*", "*", "*"],
      [m("ヨ", "y", "o")],
      0,
      "動詞%F1/形容詞%F1/名詞%F1",
      true,
    ),
  ];
  njdSetAccentType(nodes);
  assert(nodes[0].accent === 9, `句核 ${nodes[0].accent} != 9`);
});

Deno.test("unvoiced_vowel: 解釈して → し は無声化、解釈のクは有声のまま（Rust interpretation test 前半）", () => {
  const nodes = [
    node(
      "解釈",
      ["名詞", "サ変接続", "*", "*", "*", "*"],
      [
        m("カ", "k", "a"),
        m("イ", null, "i"),
        m("シャ", "sh", "a"),
        m("ク", "k", "u"),
      ],
      1,
      "C1",
      undefined,
    ),
    node(
      "し",
      ["動詞", "自立", "*", "*", "サ変・スル", "連用形"],
      [m("シ", "sh", "i")],
      0,
      "*",
      undefined,
    ),
    node(
      "て",
      ["助詞", "接続助詞", "*", "*", "*", "*"],
      [m("テ", "t", "e")],
      0,
      "動詞%F1/形容詞%F1/名詞%F5",
      undefined,
    ),
  ];
  njdSetUnvoicedVowel(nodes);
  assert(nodes[1].moras[0].voiced === false, "し が無声化されていない");
  assert(
    nodes[0].moras[3].voiced === true,
    "解釈のクが無声化された（R2発火時は前モーラ有声固定のはず）",
  );
});

Deno.test("unvoiced_vowel: 解釈してやれば → してやれ の シ は有声（前のクが無声化するためR3で保護）", () => {
  const nodes = [
    node(
      "解釈",
      ["名詞", "サ変接続", "*", "*", "*", "*"],
      [
        m("カ", "k", "a"),
        m("イ", null, "i"),
        m("シャ", "sh", "a"),
        m("ク", "k", "u"),
      ],
      1,
      "C1",
      undefined,
    ),
    node(
      "してやれ",
      ["動詞", "自立", "*", "*", "五段・ラ行", "仮定形"],
      [
        m("シ", "sh", "i"),
        m("テ", "t", "e"),
        m("ヤ", "y", "a"),
        m("レ", "r", "e"),
      ],
      3,
      "*",
      undefined,
    ),
    node(
      "ば",
      ["助詞", "接続助詞", "*", "*", "*", "*"],
      [m("バ", "b", "a")],
      0,
      "動詞%F2/形容詞%F1",
      undefined,
    ),
  ];
  njdSetUnvoicedVowel(nodes);
  assert(nodes[1].moras[0].voiced === true, "してやれ のシが無声化された");
  assert(nodes[0].moras[3].voiced === false, "解釈のクが無声化されていない（k→sh 挟まれ）");
});
