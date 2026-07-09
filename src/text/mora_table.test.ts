// mora_table.ts の振る舞いテスト。
// jpreprocess の parse_mora_str（最長一致・無声化マーク・非マッチ文字の擬似モーラ化）
// と同じ挙動になっているかを確認する。

import {
  ALL_MORA_TABLE_ENTRIES,
  isMoraString,
  splitMoras,
  splitMorasWithRanges,
} from "./mora_table.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

Deno.test("拗音は2文字で1モーラになる（最長一致）", () => {
  const { moras, unparseable } = splitMoras("キャ");
  assert(moras.length === 1, `モーラ数: ${moras.length}`);
  assert(moras[0].kana === "キャ", `kana: ${moras[0].kana}`);
  assert(moras[0].consonant === "ky" && moras[0].vowel === "a", "音素");
  assert(unparseable.length === 0, "unparseable は空");
});

Deno.test("1文字カナは通常通り1モーラ（拗音表に食われない）", () => {
  const { moras } = splitMoras("キ");
  assert(moras.length === 1 && moras[0].kana === "キ", "kana");
  assert(moras[0].consonant === "k" && moras[0].vowel === "i", "音素");
});

Deno.test("長音ー・促音ッ・撥音ンの特殊音素", () => {
  const { moras } = splitMoras("カーッン");
  assert(moras.length === 4, `モーラ数: ${moras.length}`);
  assert(moras[0].consonant === "k" && moras[0].vowel === "a", "カ");
  assert(moras[1].consonant === "-" && moras[1].vowel === "long", "ー: 長音");
  assert(moras[2].consonant === "cl" && moras[2].vowel === "cl", "ッ: 促音");
  assert(moras[3].consonant === "N" && moras[3].vowel === "N", "ン: 撥音");
});

Deno.test("ヴ系（外来音）は2文字拗音・1文字とも正しく分割される", () => {
  const { moras } = splitMoras("ヴァヴィヴヴェヴォヴュ");
  assert(moras.length === 6, `モーラ数: ${moras.length}`);
  const expect = [
    ["v", "a"],
    ["v", "i"],
    ["v", "u"],
    ["v", "e"],
    ["v", "o"],
    ["by", "u"],
  ];
  moras.forEach((m, i) => {
    assert(
      m.consonant === expect[i][0] && m.vowel === expect[i][1],
      `index ${i}: got ${m.consonant}/${m.vowel}`,
    );
  });
});

Deno.test("無声化マーク（’）は直前モーラを devoiced にし、モーラ自体は生成しない", () => {
  // 「オツカレサマデシ’タ」相当の断片（シが無声化）
  const { moras, devoiced } = splitMoras("デシ’タ");
  assert(moras.length === 3, `モーラ数（’はモーラを増やさない）: ${moras.length}`);
  assert(moras[0].kana === "デ" && moras[1].kana === "シ" && moras[2].kana === "タ", "kana列");
  assert(devoiced.length === 1 && devoiced[0] === 1, `devoiced: ${JSON.stringify(devoiced)}`);
});

Deno.test('擬似モーラ: 文字列全体が「？」の場合のみ pseudo:"question" になる', () => {
  const q = splitMoras("？");
  assert(q.moras.length === 1 && q.moras[0].pseudo === "question", "？は pseudo:question 1件");
  assert(q.moras[0].vowel === "" && q.moras[0].consonant === null, "？の音素は空");
  assert(q.unparseable.length === 0, "？は unparseable に含めない（特別扱い）");

  // 文字列の一部に「？」が混ざる場合は通常の非マッチ文字として pseudo:"touten" 扱いになる
  const mixed = splitMoras("ア？イ");
  assert(mixed.moras.length === 3, `モーラ数: ${mixed.moras.length}`);
  assert(
    mixed.moras[1].pseudo === "touten" && mixed.moras[1].kana === "、",
    "中間の？は pseudo:touten（question にはならない。kana は正準形「、」固定）",
  );
  assert(
    mixed.unparseable.length === 1 && mixed.unparseable[0] === "？",
    "unparseable には原文が積まれる",
  );
});

Deno.test('非カナ文字はモーラ境界をまたいで1つの pseudo:"touten" モーラにまとめられる', () => {
  const { moras, unparseable } = splitMoras("ア；：イ");
  assert(moras.length === 3, `モーラ数: ${moras.length}`);
  assert(moras[0].kana === "ア" && moras[2].kana === "イ", "前後は通常モーラ");
  assert(
    moras[1].pseudo === "touten" && moras[1].kana === "、",
    "中間は連続してまとめられ pseudo:touten になる（kana は正準形「、」固定。原文「；：」は保持しない）",
  );
  assert(
    unparseable.length === 1 && unparseable[0] === "；：",
    "unparseable には原文の断片がそのまま積まれる",
  );
});

Deno.test("混在文字列: 通常モーラ・擬似モーラ・無声化が共存しても分割が継続する", () => {
  const { moras, devoiced, unparseable } = splitMoras("バリー・ペーン");
  assert(moras.length === 7, `モーラ数: ${moras.length}`);
  assert(
    moras.map((m) => m.kana).join("") === "バリー、ペーン",
    "kana列（Touten は正準形「、」に置き換わるため原文とは非一致）",
  );
  assert(
    unparseable.length === 1 && unparseable[0] === "・",
    "unparseable には原文の「・」が積まれる",
  );
  assert(devoiced.length === 0, "無声化なし");
});

Deno.test("空文字列は空のモーラ列を返す", () => {
  const { moras, unparseable, devoiced } = splitMoras("");
  assert(moras.length === 0 && unparseable.length === 0 && devoiced.length === 0, "全て空");
});

Deno.test("isMoraString: カナ表のキー1個そのものだけ true（カタカナ・ひらがな・アルファベット共通）", () => {
  assert(isMoraString("キャ") === true, "2文字拗音キー（カタカナ）");
  assert(isMoraString("きゃ") === true, "2文字拗音キー（ひらがな）");
  assert(isMoraString("ア") === true, "1文字キー（カタカナ）");
  assert(isMoraString("あ") === true, "1文字キー（ひらがな）");
  assert(isMoraString("ー") === true, "長音キー");
  assert(isMoraString("Ａ") === true, "全角アルファベット（1キーが複数モーラへ展開されても true）");
  assert(isMoraString("ｚ") === true, "全角アルファベット小文字");
  assert(isMoraString("アイ") === false, "複数モーラの連結は false");
  assert(isMoraString("") === false, "空文字列は false");
  assert(isMoraString("；") === false, "非カナ記号は false");
});

Deno.test("splitMorasWithRanges: マッチ区間と非マッチ区間(touten)がそれぞれ別セグメントになる", () => {
  const segs = splitMorasWithRanges("ア；：イ");
  assert(segs.length === 3, `セグメント数: ${segs.length}`);
  assert(
    segs[0].start === 0 && segs[0].end === 1 && segs[0].moras[0].kana === "ア",
    "先頭アセグメント",
  );
  assert(
    segs[1].start === 1 && segs[1].end === 3 && segs[1].moras[0].pseudo === "touten" &&
      segs[1].moras[0].kana === "、",
    "中間の非マッチ区間は1セグメントにまとまり kana は正準形「、」",
  );
  assert(
    segs[2].start === 3 && segs[2].end === 4 && segs[2].moras[0].kana === "イ",
    "末尾イセグメント",
  );
});

Deno.test("splitMorasWithRanges: 無声化マークはセグメント内モーラの devoiced index になる", () => {
  const segs = splitMorasWithRanges("デシ’タ");
  assert(segs.length === 1, `連続マッチは1セグメントにまとまる: ${segs.length}`);
  assert(segs[0].start === 0 && segs[0].end === 4, `range: ${segs[0].start}..${segs[0].end}`);
  assert(segs[0].moras.length === 3, "’はモーラを増やさない");
  assert(segs[0].devoiced.length === 1 && segs[0].devoiced[0] === 1, "シが無声化");
});

Deno.test("splitMorasWithRanges: マッチ区間とTouten区間が隣接していても連結されない", () => {
  // jpreprocess parse_mora_str はマッチ区間の直後に非マッチ文字が来ても
  // 別セグメントとして区切る（同じ Vec<Mora> に混在させない）。
  const segs = splitMorasWithRanges("アイ；ウ");
  assert(segs.length === 3, `セグメント数: ${segs.length}`);
  assert(
    segs[0].moras.length === 2 && segs[0].moras.every((m) => !m.pseudo),
    "先頭は通常モーラ2個",
  );
  assert(segs[1].moras[0].pseudo === "touten", "中間は touten");
  assert(segs[2].moras.length === 1 && !segs[2].moras[0].pseudo, "末尾は通常モーラ");
});

Deno.test("splitMorasWithRanges: 全角アルファベットは1キーが複数モーラへ展開され、無声化は全モーラに及ぶ", () => {
  // Ｘ（全角）→ エ・ッ・ク・ス の4モーラ展開。直後の ’ は展開後の全モーラを無声化する
  // （jpreprocess が .map(...) で quotation を各モーラへ一律適用するため）。
  const segs = splitMorasWithRanges("Ｘ’");
  assert(segs.length === 1, `セグメント数: ${segs.length}`);
  assert(segs[0].start === 0 && segs[0].end === 2, `range（’を消費して end=2）: ${segs[0].end}`);
  assert(segs[0].moras.length === 4, `展開モーラ数: ${segs[0].moras.length}`);
  assert(
    segs[0].moras.map((m) => m.kana).join("") === "エックス",
    `展開結果: ${segs[0].moras.map((m) => m.kana).join("")}`,
  );
  assert(
    segs[0].devoiced.length === 4,
    `無声化が全モーラに及ぶ: ${JSON.stringify(segs[0].devoiced)}`,
  );
});

Deno.test("ひらがな長文は1つのマッチ区間としてモーラ化できる（表層のかな解析を想定）", () => {
  const kana = "ふーむとぷーっとあははは";
  const segs = splitMorasWithRanges(kana);
  assert(
    segs.length === 1,
    `セグメント数（全てひらがな辞書内なので1区間になるはず）: ${segs.length}`,
  );
  assert(segs[0].start === 0 && segs[0].end === kana.length, "range が原文全体をカバー");
  assert(segs[0].moras.every((m) => !m.pseudo), "全モーラが非擬似（unparseable なし）");

  const flat = splitMoras(kana);
  assert(flat.unparseable.length === 0, "unparseable は空");
  assert(
    flat.moras.map((m) => m.kana).join("") === "フームトプーットアハハハ",
    `カタカナ正準形へ揃って復元: ${flat.moras.map((m) => m.kana).join("")}`,
  );
});

Deno.test("splitMoras と splitMorasWithRanges は一貫した結果になる（フラット化の regression）", () => {
  const kana = "バリー・ペーン";
  const flat = splitMoras(kana);
  const segs = splitMorasWithRanges(kana);
  const fromSegs = segs.flatMap((s) => s.moras);
  assert(flat.moras.length === fromSegs.length, "モーラ数が一致");
  flat.moras.forEach((m, i) => {
    assert(m.kana === fromSegs[i].kana && m.pseudo === fromSegs[i].pseudo, `index ${i} 不一致`);
  });
});

// --- ALL_MORA_TABLE_ENTRIES の構造不変条件 ---
// scanMoraSegments の「2文字キーを先に試し、なければ1文字キー」という決定的走査が
// Aho-Corasick LeftmostLongest と等価になる前提（キーが全ユニーク・長さ1か2のみ・
// prefix 衝突なし）を、テーブル本体に対して構造的に固定する。

Deno.test("ALL_MORA_TABLE_ENTRIES: キーは全てユニーク（prefix 衝突なしの前提）", () => {
  const keys = ALL_MORA_TABLE_ENTRIES.map((e) => e.key);
  const unique = new Set(keys).size;
  assert(unique === keys.length, `キーに重複あり: ユニーク ${unique} / 総数 ${keys.length}`);
});

Deno.test("ALL_MORA_TABLE_ENTRIES: キー長は 1 か 2 のみ（3文字以上のキーは無い）", () => {
  for (const e of ALL_MORA_TABLE_ENTRIES) {
    assert(
      e.key.length === 1 || e.key.length === 2,
      `キー長が想定外: ${JSON.stringify(e.key)} (length ${e.key.length})`,
    );
  }
});

Deno.test("ALL_MORA_TABLE_ENTRIES: 全 expansion の vowel は既知集合に含まれる", () => {
  const known = new Set(["a", "i", "u", "e", "o", "N", "cl", "long"]);
  for (const e of ALL_MORA_TABLE_ENTRIES) {
    for (const m of e.expansion) {
      assert(known.has(m.vowel), `未知の vowel「${m.vowel}」（キー ${JSON.stringify(e.key)}）`);
    }
  }
});

Deno.test("ALL_MORA_TABLE_ENTRIES: キーに無声化マーク U+2019 を含まない", () => {
  // U+2019(’) はマッチ後の走査で消費されるフラグであり、キー自身に混入してはならない。
  for (const e of ALL_MORA_TABLE_ENTRIES) {
    assert(!e.key.includes("’"), `キーに U+2019 が混入: ${JSON.stringify(e.key)}`);
  }
});
