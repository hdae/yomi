// njd_set_pronunciation（pronunciation.ts）の単体テスト。
//
// pass 単体のロジック（モーラ0ノードの表層かな分割・無音除去・連続かなフィラー併合・
// 助動詞う→長音ー / です・ます+？→核1）は手組みノードの辞書非依存テストで縛る。
// 例文の end-to-end（「行こう」等）は実辞書 fixture が要るため dict-gated
// （辞書が無ければ skip。src/_dict_path.ts）。
//
// 期待値の接地: 実辞書 analyze 出力の観測（「行こう」→イコー核0 など）と、
// pronunciation.ts のロジックを手組みノードで実行した観測に基づく（想像で決めていない）。

import type { MoraSpec } from "../text/types.ts";
import type { NjdNode } from "./types.ts";
import { njdSetPronunciation } from "./pronunciation.ts";
import { JtdDictionary } from "../dict/dictionary.ts";
import { analyze } from "../analyze.ts";
import { dictAvailable, dictPath } from "../_dict_path.ts";

const assertEquals = (actual: unknown, expected: unknown, msg: string) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
};

const m = (kana: string, consonant: string | null, vowel: string): MoraSpec => ({
  kana,
  consonant,
  vowel,
});

/** 疑問符の擬似モーラ（parse_mora_str が「？」単独で生成する Question 相当）。 */
const QUESTION: MoraSpec = { kana: "？", consonant: null, vowel: "", pseudo: "question" };

/** 表層かな解析前のノードを組む。moras 省略時は未知語（モーラ0・isUnknown）。 */
const mkNode = (surface: string, pos: string[], moras: MoraSpec[] = [], accent = 0): NjdNode => ({
  surface,
  pos,
  moras: moras.map((spec) => ({ spec, voiced: true })),
  pronOrig: moras.map((s) => s.kana).join(""),
  accent,
  chainRule: null,
  chainFlag: undefined,
  isUnknown: moras.length === 0,
});

const kanaOf = (node: NjdNode): string => node.moras.map((mm) => mm.spec.kana).join("");
const surfacesOf = (nodes: NjdNode[]): string[] => nodes.map((n) => n.surface);

Deno.test("pronunciation: モーラ0ノードの表層かな分割 → かな片はフィラー・読点相当は記号へ", () => {
  // 未知語「アイ？」（モーラ0）。かな連続「アイ」と非マッチ「？」に range 分割され、
  // 前者はフィラー化、後者は Touten 擬似モーラの記号ノードになる。
  const out = njdSetPronunciation([mkNode("アイ？", ["名詞", "一般", "*", "*", "*", "*"])]);
  assertEquals(surfacesOf(out), ["アイ", "？"], "表層かな分割で2ノードに割れる");
  assertEquals(out[0].pos[0], "フィラー", "かな片はフィラーへ品詞変換される");
  assertEquals(kanaOf(out[0]), "アイ", "フィラー片のモーラ化");
  assertEquals(out[1].pos[0], "記号", "非マッチ片は convert_to_kigou で記号化される");
  assertEquals(out[1].pos[1], "一般", "名詞,一般 → 記号,一般（細分類を一般で維持）");
  assertEquals(out[1].moras[0].spec.pseudo, "touten", "非マッチ区間は Touten 擬似モーラ");
});

Deno.test("pronunciation: 無音ノード（モーラ0・表層空）は除去される", () => {
  const out = njdSetPronunciation([
    mkNode("猫", ["名詞", "一般", "*", "*", "*", "*"], [m("ネ", "n", "e"), m("コ", "k", "o")]),
    mkNode("", ["名詞", "一般", "*", "*", "*", "*"]), // 無音（表層空・モーラ0）
    mkNode("犬", ["名詞", "一般", "*", "*", "*", "*"], [m("イ", null, "i"), m("ヌ", "n", "u")]),
  ]);
  assertEquals(surfacesOf(out), ["猫", "犬"], "中間の無音ノードが消え、前後の実ノードは残る");
});

Deno.test("pronunciation: 連続する1モーラかなフィラーは先頭へ併合され、非フィラーで鎖が切れる", () => {
  // ア・イ（未知語1文字）→ フィラー化して先頭アへ併合。間の実語「猫」で鎖が切れ、
  // ウ・エ が新たな先頭ウへ併合する（chain kana sequence）。
  const out = njdSetPronunciation([
    mkNode("ア", ["名詞", "一般", "*", "*", "*", "*"]),
    mkNode("イ", ["名詞", "一般", "*", "*", "*", "*"]),
    mkNode("猫", ["名詞", "一般", "*", "*", "*", "*"], [m("ネ", "n", "e"), m("コ", "k", "o")]),
    mkNode("ウ", ["名詞", "一般", "*", "*", "*", "*"]),
    mkNode("エ", ["名詞", "一般", "*", "*", "*", "*"]),
  ]);
  assertEquals(surfacesOf(out), ["アイ", "猫", "ウエ"], "アイ / 猫 / ウエ に併合される");
  assertEquals(kanaOf(out[0]), "アイ", "先頭フィラーがモーラを吸収する");
  assertEquals(out[0].pos[0], "フィラー", "併合後もフィラー");
  assertEquals(kanaOf(out[2]), "ウエ", "非フィラーで鎖が切れ、後続が新たに併合される");
});

Deno.test("pronunciation: 動詞 + 助動詞「う」→ 助動詞のウが長音ーになり accent は0へ", () => {
  // 行こ（動詞）+ う（助動詞・1モーラのウ）→ う のモーラを長音ーに置換（イコ+ー=イコー）。
  const u = mkNode("う", ["助動詞", "*", "*", "*", "不変化型", "基本形"], [m("ウ", null, "u")], 5);
  const out = njdSetPronunciation([
    mkNode("行こ", ["動詞", "自立", "*", "*", "五段・カ行促音便", "未然ウ接続"], [
      m("イ", null, "i"),
      m("コ", "k", "o"),
    ]),
    u,
  ]);
  assertEquals(kanaOf(out[1]), "ー", "助動詞ウが長音ーへ置換される");
  assertEquals(out[1].moras[0].spec.vowel, "long", "置換後モーラは長音（vowel=long）");
  assertEquals(out[1].moras.length, 1, "1モーラのまま");
  assertEquals(out[1].accent, 0, "accent が 0 に上書きされる（与えた5から変化）");
  assertEquals(out.map((n) => kanaOf(n)).join(""), "イコー", "全体でイコー");
});

Deno.test("pronunciation: 助動詞です/ます + ？ → 核1のデス/マスへ再設定（無声化解除）。？以外では発火しない", () => {
  // です（核をわざと2・すを無声で与える）+ ？ → 核1のデス（すは有声の新モーラ）に戻る。
  const desu = mkNode("です", ["助動詞", "*", "*", "*", "特殊・デス", "基本形"], [
    m("デ", "d", "e"),
    m("ス", "s", "u"),
  ], 2);
  desu.moras[1].voiced = false;
  const outDesu = njdSetPronunciation([
    desu,
    mkNode("？", ["記号", "一般", "*", "*", "*", "*"], [QUESTION]),
  ]);
  assertEquals(outDesu[0].accent, 1, "核が1へ戻る（与えた2から変化）");
  assertEquals(kanaOf(outDesu[0]), "デス", "デスのモーラ列");
  assertEquals(outDesu[0].moras[1].voiced, true, "すの無声化が解除され有声になる");

  const outMasu = njdSetPronunciation([
    mkNode("ます", ["助動詞", "*", "*", "*", "特殊・マス", "基本形"], [
      m("マ", "m", "a"),
      m("ス", "s", "u"),
    ], 3),
    mkNode("？", ["記号", "一般", "*", "*", "*", "*"], [QUESTION]),
  ]);
  assertEquals(outMasu[0].accent, 1, "ます も核1へ戻る（与えた3から変化）");
  assertEquals(kanaOf(outMasu[0]), "マス", "マスのモーラ列");

  // 制御群: 次が「。」（？でない）なら規則は発火せず、核は与えた2のまま。
  const outControl = njdSetPronunciation([
    mkNode("です", ["助動詞", "*", "*", "*", "特殊・デス", "基本形"], [
      m("デ", "d", "e"),
      m("ス", "s", "u"),
    ], 2),
    mkNode("。", ["記号", "句点", "*", "*", "*", "*"], [{
      kana: "、",
      consonant: null,
      vowel: "",
      pseudo: "touten",
    }]),
  ]);
  assertEquals(outControl[0].accent, 2, "？以外（。）では再設定が起きず核は不変");
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
  analyze(loadDict(), text).accentPhrases.flatMap((p) => p.moras.map((mm) => mm.kana)).join("");

Deno.test({
  name:
    "pronunciation(実辞書): 動詞+助動詞う → 長音化がコア結果に伝播（行こう→イコー核0・食べよう→タベヨー核2）",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    const iko = analyze(dict, "行こう");
    assertEquals(iko.accentPhrases.length, 1, "行こう は1句");
    assertEquals(reading("行こう"), "イコー", "行こう → イコー");
    assertEquals(iko.accentPhrases[0].accentNucleus, 0, "イコー は核0（平板）");

    const tabe = analyze(dict, "食べよう");
    assertEquals(reading("食べよう"), "タベヨー", "食べよう → タベヨー");
    assertEquals(tabe.accentPhrases[0].accentNucleus, 2, "タベヨー は核2");
  },
});

Deno.test({
  name: "pronunciation(実辞書): です？ は核1のデス（すは有声）で疑問符ノードは併合されない",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    const q = analyze(dict, "です？");
    assertEquals(reading("です？"), "デス", "です？ → デス");
    assertEquals(q.accentPhrases[0].accentNucleus, 1, "デス は核1");
    assertEquals(
      q.accentPhrases[0].moras[1].devoiced ?? false,
      false,
      "？の前ではすが有声（上昇調）",
    );
  },
});
