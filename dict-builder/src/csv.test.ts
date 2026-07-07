import { COL, parseCsvLine } from "./csv.ts";
import { parseCharDef } from "./defs.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

Deno.test("通常行: 発音形(col13)とアクセント型を正しく取り出す（col12読みと混同しない）", () => {
  // 実データ行（読み=シメハリヅル と 発音=シメハリズル が異なる代表例）。
  const e = parseCsvLine(
    "注連張鶴,1345,1345,7133,名詞,一般,*,*,*,*,注連張鶴,シメハリヅル,シメハリズル,4/6,C2",
    1,
  );
  assert(e.units.length === 1, "ユニット数");
  assert(e.units[0].pron === "シメハリズル", `pron が発音形でない: ${e.units[0].pron}`);
  assert(e.units[0].accType === 4, "accType");
  assert(e.chainRule === "C2", "chainRule");
  assert(e.features[0] === "名詞", "pos");
  assert(COL.PRON === 12 && COL.READ === 11, "列定数の regression");
});

Deno.test("複合語行: ':' で orig/pron/acc が並列分割されユニット列になる", () => {
  const e = parseCsvLine(
    "３０２Ａ,1345,1345,49,名詞,一般,*,*,*,*,３０:２Ａ,サンマル:ニエー,サンマル:ニエー,3/4:2/3,C1",
    1,
  );
  assert(e.units.length === 2, "ユニット数");
  assert(e.units[0].surfLen === 2 && e.units[1].surfLen === 0, "surfLen（最終は0=残り）");
  assert(e.units[0].pron === "サンマル" && e.units[1].pron === "ニエー", "pron 分割");
  assert(e.units[0].accType === 3 && e.units[1].accType === 2, "accType 分割");
});

Deno.test("アクセント '*' は null、列数不一致は throw", () => {
  const e = parseCsvLine("Ｘ,100,100,0,記号,一般,*,*,*,*,Ｘ,エックス,エックス,*,*", 1);
  assert(e.units[0].accType === null, "acc null");
  let threw = false;
  try {
    parseCsvLine("a,b,c", 1);
  } catch {
    threw = true;
  }
  assert(threw, "列数不一致で throw しない");
});

Deno.test("char.def: 範囲行の出現順どおりの順序付きカテゴリ列（lindera lookup_categories 互換）", () => {
  const def = parseCharDef(`
DEFAULT 0 1 0  # コメント
KANJI   0 0 2
KANJINUMERIC 1 1 0
0x4E00..0x9FFF KANJI
0x4E00 KANJINUMERIC KANJI
`);
  assert(def.categories.length === 3, "カテゴリ数");
  assert(def.categories[1].name === "KANJI" && def.categories[1].length === 2, "KANJI定義");
  const unpack = (cp: number): number[] => {
    const out: number[] = [];
    for (let s = 0; s < 16; s += 4) {
      const v = (def.catsPacked[cp] >> s) & 0xf;
      if (v === 0) break;
      out.push(v - 1);
    }
    return out;
  };
  // 一(0x4E00): 先に KANJI 範囲行、後から KANJINUMERIC 行 → 出現順 [KANJI, KANJINUMERIC]
  assert(unpack(0x4e00).join(",") === "1,2", `一: ${unpack(0x4e00)}`);
  assert(unpack(0x4e01).join(",") === "1", "漢字は KANJI のみ");
  assert(unpack(0x41).join(",") === "0", "未定義は DEFAULT");
});
