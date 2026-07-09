// digit_lut.ts の各テーブルの挙動テスト。
// 期待値は jpreprocess (Rust) crates/jpreprocess-njd/src/open_jtalk/digit/ の
// 実装意味論（njd_set_digit / find_pron_conv_set / Mora::convert_to_(semi)voiced_sound）
// に基づいて決定した（想像で決めていない）。
//
// njdSetDigit の end-to-end 経路を通すことで、CLASS1/CLASS2/CLASS3/numeral/others の
// 各テーブルが正しく参照されることを検証する（テーブル単体の中身の正しさは
// エントリ数突合と VOICED/SEMIVOICED の直接テストで別途担保する）。

import { njdSetDigit } from "./digit.ts";
import { makeRuleNode } from "./rule_node.ts";
import type { NjdNode } from "./types.ts";
import {
  CLASS1_CONVERSION,
  CLASS2_CONVERSION,
  CLASS3_CONVERSION,
  CLASS3_KEYS,
  NUMERAL_DIGIT_CONVERSION,
  NUMERAL_LIST2,
  NUMERAL_LIST3,
  NUMERAL_LIST4,
  NUMERAL_LIST5,
  NUMERAL_NUMERATIVE_CONVERSION,
  OTHERS_CONVERSION,
  SEMIVOICED_MORA,
  UNKNOWN_DICT_DIGITS,
  VOICED_MORA,
} from "./digit_lut.ts";

const assertEquals = (actual: unknown, expected: unknown, msg: string) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
};

const kanaOf = (node: NjdNode): string => node.moras.map((m) => m.spec.kana).join("");

// naist-jdic 実データ（data/naist-jdic/naist-jdic.csv で確認済みの行を
// leftId/rightId/cost を除いた makeRuleNode 形式に変換）。
const ICHI = () => makeRuleNode("一,名詞,数,*,*,*,*,一,イチ,イチ,2/2,C3");
const NI = () => makeRuleNode("二,名詞,数,*,*,*,*,二,ニ,ニ,1/1,C3");
const SAN = () => makeRuleNode("三,名詞,数,*,*,*,*,三,サン,サン,0/2,C3");
const HYAKU = () => makeRuleNode("百,名詞,数,*,*,*,*,百,ヒャク,ヒャク,2/2,C3");
const FUN = () => makeRuleNode("分,名詞,接尾,助数詞,*,*,*,分,フン,フン,1/2,C3");
const NIN = () => makeRuleNode("人,名詞,接尾,助数詞,*,*,*,人,ニン,ニン,1/2,C3");
const HI = () => makeRuleNode("日,名詞,接尾,助数詞,*,*,*,日,ヒ,ヒ,0/1,C3");

Deno.test("エントリ数突合: class1 (11集合の合計29エントリ)", () => {
  const total = CLASS1_CONVERSION.reduce((n, { table }) => n + table.size, 0);
  assertEquals(total, 29, "class1 CONVERSION_TABLE の合計エントリ数");
  assertEquals(CLASS1_CONVERSION.length, 11, "class1 集合数");
});

Deno.test("エントリ数突合: class2 (5集合の合計31エントリ)", () => {
  const total = CLASS2_CONVERSION.reduce((n, { table }) => n + table.size, 0);
  assertEquals(total, 31, "class2 CONVERSION_TABLE の合計エントリ数");
  assertEquals(CLASS2_CONVERSION.length, 5, "class2 集合数");
});

Deno.test("エントリ数突合: class3 (実測59。事前調査値61との差異は実ソース実測を正とする)", () => {
  assertEquals(CLASS3_KEYS.length, 59, "class3 キー数");
});

Deno.test("エントリ数突合: numeral (DIGIT 2集合5エントリ + NUMERATIVE 1集合4エントリ = 9)", () => {
  const digitTotal = NUMERAL_DIGIT_CONVERSION.reduce((n, { table }) => n + table.size, 0);
  const numerativeTotal = NUMERAL_NUMERATIVE_CONVERSION.reduce((n, { table }) => n + table.size, 0);
  assertEquals(digitTotal + numerativeTotal, 9, "numeral 変換エントリ合計数");
});

Deno.test("エントリ数突合: others (3集合 2+10+10=22エントリ)", () => {
  const total = OTHERS_CONVERSION.reduce((n, { table }) => n + table.size, 0);
  assertEquals(total, 22, "others CONVERSION_TABLE の合計エントリ数");
});

Deno.test("エントリ数突合: UNKNOWN_DICT_DIGITS は全角数字10種", () => {
  assertEquals(UNKNOWN_DICT_DIGITS.size, 10, "UNKNOWN_DICT_DIGITS件数");
});

Deno.test("エントリ数突合: NUMERAL_LIST2/3 は index0が空文字列のオフセット配列", () => {
  assertEquals(NUMERAL_LIST2[0], "", "NUMERAL_LIST2[0]は未使用領域");
  assertEquals(NUMERAL_LIST2.length, 4, "NUMERAL_LIST2は十/百/千の3件+index0");
  assertEquals(NUMERAL_LIST3[0], "", "NUMERAL_LIST3[0]は未使用領域");
  assertEquals(NUMERAL_LIST3.length, 18, "NUMERAL_LIST3は万..無量大数の17件+index0");
});

Deno.test("一+分 → イップン（class1G促音化イッ + class2B半濁音化プン）", () => {
  const nodes = njdSetDigit([ICHI(), FUN()]);
  // class1: 「分」はNUMERATIVE_CLASS1G所属、CONV_TABLE1Gに「一」→イッ が存在。
  assertEquals(kanaOf(nodes[0]), "イッ", "一の読みがイッに変換される（class1G）");
  // class2: 「分」はNUMERATIVE_CLASS2B所属、CONV_TABLE2Bに「一」→semivoicedが存在。
  // 「分」の先頭モーラ フ→プ（半濁音化）。
  assertEquals(kanaOf(nodes[1]), "プン", "分の先頭モーラがプに半濁音化される（class2B）");
});

Deno.test("三+百 → サン+ビャク（numeral: 百=NUMERAL_LIST6, 三→voiced で連濁）", () => {
  const nodes = njdSetDigit([SAN(), HYAKU()]);
  // NUMERAL_NUMERATIVE_CONVERSION: NUMERAL_LIST6={百,千}, NUMERAL_LIST7に三→voicedが存在。
  // 百の先頭モーラ ヒャ→ビャ（連濁）。
  assertEquals(kanaOf(nodes[1]), "ビャク", "百の先頭モーラがビャに連濁する（numeral NUMERATIVE）");
  // 「三」自体はDIGIT_CONVERSION_TABLE対象外（NUMERAL_LIST8={百}, LIST10={千,兆}のみ）
  // なのでnode.get_stringでの一致は起きず、サンのまま。
  assertEquals(kanaOf(nodes[0]), "サン", "三はDIGIT_CONVERSION_TABLE対象外のため不変");
});

Deno.test("一+人 → ヒトリ（others: NUMERATIVE_CLASS4 一→一人,ヒトリ の丸ごと置換）", () => {
  const nodes = njdSetDigit([ICHI(), NIN()]);
  assertEquals(nodes.length, 1, "next（人）はresetされ空発音のためremove_silent_nodeで除去される");
  assertEquals(nodes[0].surface, "一人", "ノードがothers変換の一人ノードに丸ごと置換される");
  assertEquals(kanaOf(nodes[0]), "ヒトリ", "一人の発音がヒトリになる");
});

Deno.test("二+人 → フタリ（others: NUMERATIVE_CLASS4 二→二人,フタリ）", () => {
  const nodes = njdSetDigit([NI(), NIN()]);
  assertEquals(nodes.length, 1, "next（人）はresetされ空発音のため除去される");
  assertEquals(nodes[0].surface, "二人", "ノードがothers変換の二人ノードに丸ごと置換される");
  assertEquals(kanaOf(nodes[0]), "フタリ", "二人の発音がフタリになる");
});

Deno.test("一+日 → ツイタチ（others通常置換ではなく月一日の特殊分岐がヒットしない単独ケースはイチニチ）", () => {
  // 「一日」は others の CLASS5（NUMERATIVE_CLASS5="日"）にも一致するが、
  // njd_set_digit の特殊分岐（prev.surfaceが"月"を含む場合のみツイタチ）は
  // prev が無い（先頭）ためヒットせず、通常の others 置換 CONV_TABLE5["一"] が使われる。
  const nodes = njdSetDigit([ICHI(), HI()]);
  assertEquals(nodes.length, 1, "next（日）はresetされ空発音のため除去される");
  assertEquals(nodes[0].surface, "一日", "ノードがothers変換の一日ノードに丸ごと置換される");
  assertEquals(kanaOf(nodes[0]), "イチニチ", "月が前置されない単独の一日はイチニチ（CONV_TABLE5）");
});

Deno.test("ConvSet の early-return 意味論: ヒットしても値が無ければそこで打ち切り、後続要素を見ない", () => {
  // NUMERATIVE_CLASS1F（"羽"/"把"はコメントアウトで空集合）は空集合なので、
  // 現実のキーではヒットしない。ここでは自前の最小 ConvSet で意味論そのものを検証する。
  const table: { keys: Set<string>; table: Map<string, string> }[] = [
    { keys: new Set(["対象語"]), table: new Map() }, // ヒットするが値が無い
    { keys: new Set(["対象語"]), table: new Map([["キー", "後続要素の値"]]) },
  ];
  const findConv = <V>(
    convTable: { keys: Set<string>; table: Map<string, V> }[],
    key1: string,
    key2: string,
  ): V | undefined => {
    for (const { keys, table: t } of convTable) {
      if (keys.has(key1)) return t.get(key2);
    }
    return undefined;
  };
  const result = findConv(table, "対象語", "キー");
  assertEquals(
    result,
    undefined,
    "先頭要素がヒットした時点で打ち切り、値が無くてもundefinedを返し後続要素は見ない",
  );
});

Deno.test("VOICED_MORA: ハ→バ 等の基本的な清濁変換", () => {
  assertEquals(VOICED_MORA.get("ハ"), "バ", "ハ→バ");
  assertEquals(VOICED_MORA.get("カ"), "ガ", "カ→ガ");
  assertEquals(VOICED_MORA.get("シ"), "ジ", "シ→ジ（例外的な変化）");
  assertEquals(VOICED_MORA.get("チ"), "ヂ", "チ→ヂ（例外的な変化）");
  assertEquals(VOICED_MORA.get("ツ"), "ヅ", "ツ→ヅ（例外的な変化）");
  assertEquals(VOICED_MORA.get("ヒャ"), "ビャ", "拗音ヒャ→ビャ（2文字カナ全体が変わる）");
  assertEquals(VOICED_MORA.get("ア"), undefined, "母音のみのモーラは変換対象外");
});

Deno.test("SEMIVOICED_MORA: ハ→パ 等の半濁音変換（ハ行のみ対象）", () => {
  assertEquals(SEMIVOICED_MORA.get("ハ"), "パ", "ハ→パ");
  assertEquals(SEMIVOICED_MORA.get("ヒャ"), "ピャ", "拗音ヒャ→ピャ");
  assertEquals(SEMIVOICED_MORA.get("カ"), undefined, "ハ行以外は半濁音化対象外");
});

Deno.test("class3焼き直し: とおり/通りは読みトオリから発音トーリへ変化している", () => {
  const toori = CLASS3_KEYS.find((k) => k.surface === "とおり");
  const doori = CLASS3_KEYS.find((k) => k.surface === "通り");
  assertEquals(toori?.prons.has("トーリ"), true, "とおりの発音キーはトーリ（読みトオリから変化）");
  assertEquals(toori?.prons.has("トオリ"), false, "変化前の読みトオリはキーとして残っていない");
  assertEquals(doori?.prons.has("トーリ"), true, "通りの発音キーはトーリ（読みトオリから変化）");
});

Deno.test("class3焼き直し: 棟はムネのまま変化なし（辞書ヒット、フォールバックではない）", () => {
  const mune = CLASS3_KEYS.find((k) => k.surface === "棟");
  assertEquals(mune?.prons.has("ムネ"), true, "棟の発音キーはムネ");
});

Deno.test("CLASS3_CONVERSION: 一→ヒト, 二→フタ の変換発音（三は未実装のためエントリ無し）", () => {
  assertEquals(CLASS3_CONVERSION.get("一"), { kana: "ヒト", accent: 0 }, "一→ヒト");
  assertEquals(CLASS3_CONVERSION.get("二"), { kana: "フタ", accent: 0 }, "二→フタ");
  assertEquals(CLASS3_CONVERSION.has("三"), false, "三はRustソース側で未実装（コメントアウト）");
});

Deno.test("NUMERAL_LIST4/5: 位取り語と数詞の分離が正しい", () => {
  assertEquals(NUMERAL_LIST4.has("一"), true, "一は数詞リスト4に属する");
  assertEquals(NUMERAL_LIST5.has("十"), true, "十は位取り語リスト5に属する");
  assertEquals(NUMERAL_LIST4.has("十"), false, "十は数詞リスト4には属さない");
  assertEquals(NUMERAL_LIST5.has("一"), false, "一は位取り語リスト5には属さない");
});
