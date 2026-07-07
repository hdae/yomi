// jpreprocess normalize_text.rs のテストベクタをそのまま移植（互換の regression 固定）。

import { normalizeForDict, splitFragments } from "./normalize.ts";

const eq = (got: string, want: string) => {
  if (got !== want) throw new Error(`got ${got} want ${want}`);
};

Deno.test("ASCII: 専用表(￥−〜‘”’) + 一律全角化。NFKC とは異なる", () => {
  eq(normalizeForDict(" !\"#$%&'()*+,-./"), "　！”＃＄％＆’（）＊＋，−．／");
  eq(normalizeForDict("0123456789"), "０１２３４５６７８９");
  eq(normalizeForDict(":;<=>?@"), "：；＜＝＞？＠");
  eq(
    normalizeForDict("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    "ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ",
  );
  eq(normalizeForDict("[\\]^_`"), "［￥］＾＿‘");
  eq(
    normalizeForDict("abcdefghijklmnopqrstuvwxyz"),
    "ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ",
  );
  eq(normalizeForDict("{|}~"), "｛｜｝〜");
});

Deno.test("半角カナ: 濁点合成込みで全角化", () => {
  eq(
    normalizeForDict("ｳﾞｶﾞｷﾞｸﾞｹﾞｺﾞｻﾞｼﾞｽﾞｾﾞｿﾞﾀﾞﾁﾞﾂﾞﾃﾞﾄﾞﾊﾞﾋﾞﾌﾞﾍﾞﾎﾞﾊﾟﾋﾟﾌﾟﾍﾟﾎﾟ"),
    "ヴガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ",
  );
  eq(normalizeForDict("｡｢｣､･"), "。「」、・");
  eq(
    normalizeForDict("ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ"),
    "ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン",
  );
});

Deno.test("濁点・半濁点: 合成できないマークは黙って落ちる（jpreprocess と同挙動）", () => {
  eq(normalizeForDict("ﾞﾟ"), "");
  eq(normalizeForDict("あ゛"), "あ");
  eq(normalizeForDict("あ゜"), "あ");
  eq(normalizeForDict("は゛"), "ば");
  eq(normalizeForDict("は゜"), "ぱ");
});

Deno.test("文分割: 。、\\n\\t が区切り（区切り文字は前断片の末尾に含まれる）", () => {
  const text = "今日は、いい天気。明日も";
  const frags = splitFragments(text).map((f) => text.slice(f.start, f.end));
  if (frags.join("|") !== "今日は、|いい天気。|明日も") {
    throw new Error(`fragments: ${frags.join("|")}`);
  }
  if (splitFragments("").length !== 0) throw new Error("空文字列");
  const only = splitFragments("。");
  if (only.length !== 1 || only[0].end !== 1) throw new Error("区切りのみ");
});
