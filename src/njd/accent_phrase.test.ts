// njdSetAccentPhrase（njd_set_accent_phrase 移植）の振る舞いテスト。
// 隣接2ノード列（prev, current）を組み、確定した current.chainFlag を検証する。
// 期待値は accent_phrase.rs の各規則（R01〜R18）の「意味」から導出する
// （true=前のアクセント句に連結 / false=別のアクセント句に切断）。実装の返り値を
// コピーしていない: くっつける/分離するの意味論を規則の説明文から起こしている。
//
// 順序依存（上位規則が下位を先取りする）を固定する 2 例を明示的に含む:
//   - R11c（接続助詞「て」+ 形容詞非自立 → 連結）が R09（付属語 + 自立語 → 切断）を先取り
//   - R07（名詞,副詞可能 → 単独）が R02（名詞連続 → 連結）を先取り
// これらは accent_phrase.ts の「分岐の順番を変えてはならない（MUST）」を守る回帰。
//
// 全ノードは手組み（辞書非依存）。chainFlag は品詞と表層のみで決まり moras を見ないため空で良い。

import type { NjdNode } from "./types.ts";
import { njdSetAccentPhrase } from "./accent_phrase.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

/** 品詞 + 表層のみを持つ最小 NjdNode（chainFlag 決定に moras/accent は不要）。 */
const mk = (
  pos: string[],
  surface = "",
  chainFlag: boolean | undefined = undefined,
): NjdNode => ({
  surface,
  pos,
  moras: [],
  pronOrig: "",
  accent: 0,
  chainRule: null,
  chainFlag,
  isUnknown: false,
});

/** [prev, current] に njdSetAccentPhrase を適用し、確定した current.chainFlag を返す。 */
const chainFlagOf = (prev: NjdNode, current: NjdNode): boolean | undefined => {
  const nodes = [prev, current];
  njdSetAccentPhrase(nodes);
  return nodes[1].chainFlag;
};

// 品詞の短縮ビルダ（6素性を必ず埋める。isRenyou が p[5] を見るため）。
const MEISHI = ["名詞", "一般", "*", "*", "*", "*"];
const MEISHI_FUKUSHI = ["名詞", "副詞可能", "*", "*", "*", "*"];
const MEISHI_GOKAN = ["名詞", "形容動詞語幹", "*", "*", "*", "*"];
const MEISHI_SETSUBI = ["名詞", "接尾", "一般", "*", "*", "*"];
const PERSON_SEI = ["名詞", "固有名詞", "人名", "姓", "*", "*"];
const PERSON_MEI = ["名詞", "固有名詞", "人名", "名", "*", "*"];
const SETTOUSHI = ["接頭詞", "名詞接続", "*", "*", "*", "*"];
const KIGOU_TOUTEN = ["記号", "読点", "*", "*", "*", "*"];
const DOUSHI = ["動詞", "自立", "*", "*", "五段・カ行", "基本形"];
const DOUSHI_RENYOU = ["動詞", "自立", "*", "*", "五段・カ行", "連用形"];
const DOUSHI_HIJIRITSU = ["動詞", "非自立", "*", "*", "一段", "基本形"];
const KEIYOUSHI = ["形容詞", "自立", "*", "*", "形容詞・アウオ段", "基本形"];
const KEIYOUSHI_RENYOU = ["形容詞", "自立", "*", "*", "形容詞・アウオ段", "連用テ接続"];
const KEIYOUSHI_HIJIRITSU = ["形容詞", "非自立", "*", "*", "形容詞・イ段", "基本形"];
const JOSHI_KAKU = ["助詞", "格助詞", "*", "*", "*", "*"];
const JOSHI_SETSUZOKU = ["助詞", "接続助詞", "*", "*", "*", "*"];
const JODOUSHI = ["助動詞", "*", "*", "*", "特殊・ダ", "基本形"];
const FUKUSHI = ["副詞", "一般", "*", "*", "*", "*"];
const RENTAISHI = ["連体詞", "*", "*", "*", "*", "*"];
const KANDOUSHI = ["感動詞", "*", "*", "*", "*", "*"];

Deno.test("R18: 接尾は前のアクセント句に連結（最優先で他規則を先取り）", () => {
  // 名詞+名詞接尾。R13(名詞→…)や他より先に R18 が当たり、必ず連結。
  assert(chainFlagOf(mk(MEISHI), mk(MEISHI_SETSUBI)) === true, "接尾は連結されるべき");
});

Deno.test("R17: 名詞の後の固有名詞・人名・名は別のアクセント句に切断", () => {
  assert(chainFlagOf(mk(MEISHI), mk(PERSON_MEI)) === false, "名詞+人名名は切断されるべき");
});

Deno.test("R16: 固有名詞・人名・姓の後の名詞は別のアクセント句に切断", () => {
  assert(chainFlagOf(mk(PERSON_SEI), mk(MEISHI)) === false, "人名姓+名詞は切断されるべき");
});

Deno.test("R15: 接頭詞は単独のアクセント句（後続を切断）", () => {
  assert(chainFlagOf(mk(MEISHI), mk(SETTOUSHI)) === false, "接頭詞は切断されるべき");
});

Deno.test("R14: 記号は単独のアクセント句（前後どちらが記号でも切断）", () => {
  assert(chainFlagOf(mk(MEISHI), mk(KIGOU_TOUTEN)) === false, "current=記号は切断されるべき");
  assert(chainFlagOf(mk(KIGOU_TOUTEN), mk(MEISHI)) === false, "prev=記号は切断されるべき");
});

Deno.test("R13: 名詞の後の動詞・形容詞・形容動詞語幹は別のアクセント句に切断", () => {
  assert(chainFlagOf(mk(MEISHI), mk(DOUSHI)) === false, "名詞+動詞は切断されるべき");
  assert(chainFlagOf(mk(MEISHI), mk(KEIYOUSHI)) === false, "名詞+形容詞は切断されるべき");
  assert(chainFlagOf(mk(MEISHI), mk(MEISHI_GOKAN)) === false, "名詞+形容動詞語幹は切断されるべき");
});

Deno.test("R12: 動詞連用形の後の動詞・非自立は前に連結", () => {
  assert(
    chainFlagOf(mk(DOUSHI_RENYOU), mk(DOUSHI_HIJIRITSU)) === true,
    "動詞連用+動詞非自立は連結されるべき",
  );
  // 連用形でない動詞が前なら R12 は当たらず、動詞+動詞は既定連結（R01）で true になる。
});

Deno.test("R11: 形容詞非自立は 動詞連用/形容詞連用/接続助詞て・で に前接", () => {
  assert(
    chainFlagOf(mk(DOUSHI_RENYOU), mk(KEIYOUSHI_HIJIRITSU)) === true,
    "動詞連用+形容詞非自立は連結されるべき",
  );
  assert(
    chainFlagOf(mk(KEIYOUSHI_RENYOU), mk(KEIYOUSHI_HIJIRITSU)) === true,
    "形容詞連用+形容詞非自立は連結されるべき",
  );
  assert(
    chainFlagOf(mk(JOSHI_SETSUZOKU, "て"), mk(KEIYOUSHI_HIJIRITSU)) === true,
    "接続助詞て+形容詞非自立は連結されるべき",
  );
  // 接続助詞でも表層が「て/で」でなければ R11 は当たらず、R09（付属語+自立語）で切断される。
  assert(
    chainFlagOf(mk(JOSHI_SETSUZOKU, "ながら"), mk(KEIYOUSHI_HIJIRITSU)) === false,
    "接続助詞でも表層がて/で以外なら R11 不発 → R09 で切断されるべき",
  );
});

Deno.test("R10: 接尾の後の名詞は別のアクセント句に切断", () => {
  assert(chainFlagOf(mk(MEISHI_SETSUBI), mk(MEISHI)) === false, "接尾+名詞は切断されるべき");
});

Deno.test("R08/R09 の3分岐: 付属語連続=連結 / 付属語+自立語=切断 / 自立語+付属語=連結", () => {
  // 付属語（助詞・助動詞）が連続 → 連結（R08、行71）。
  assert(chainFlagOf(mk(JOSHI_KAKU), mk(JODOUSHI)) === true, "助詞+助動詞（付属語連続）は連結");
  assert(chainFlagOf(mk(JODOUSHI), mk(JOSHI_KAKU)) === true, "助動詞+助詞（付属語連続）は連結");
  // 付属語の後の自立語 → 切断（R09、行73）。
  assert(chainFlagOf(mk(JODOUSHI), mk(MEISHI)) === false, "助動詞+名詞（付属語→自立語）は切断");
  assert(chainFlagOf(mk(JOSHI_KAKU), mk(DOUSHI)) === false, "助詞+動詞（付属語→自立語）は切断");
  // 自立語の後の付属語 → 連結（R08 再、行75）。
  assert(chainFlagOf(mk(MEISHI), mk(JOSHI_KAKU)) === true, "名詞+助詞（自立語→付属語）は連結");
  assert(chainFlagOf(mk(DOUSHI), mk(JODOUSHI)) === true, "動詞+助動詞（自立語→付属語）は連結");
});

Deno.test("R07: 名詞・副詞可能は前後どちらでも単独のアクセント句に切断", () => {
  assert(chainFlagOf(mk(MEISHI_FUKUSHI), mk(MEISHI)) === false, "副詞可能(prev)+名詞は切断");
  assert(chainFlagOf(mk(MEISHI), mk(MEISHI_FUKUSHI)) === false, "名詞+副詞可能(cur)は切断");
});

Deno.test("R06: 副詞・接続詞・連体詞は前後どちらでも単独のアクセント句に切断", () => {
  assert(chainFlagOf(mk(FUKUSHI), mk(MEISHI)) === false, "副詞(prev)+名詞は切断");
  assert(chainFlagOf(mk(MEISHI), mk(RENTAISHI)) === false, "名詞+連体詞(cur)は切断");
});

Deno.test("R05: 動詞の後の形容詞・名詞は別のアクセント句に切断", () => {
  assert(chainFlagOf(mk(DOUSHI), mk(MEISHI)) === false, "動詞+名詞は切断されるべき");
  assert(chainFlagOf(mk(DOUSHI), mk(KEIYOUSHI)) === false, "動詞+形容詞は切断されるべき");
});

Deno.test("R04: 形容動詞語幹の後の名詞は別のアクセント句に切断", () => {
  assert(chainFlagOf(mk(MEISHI_GOKAN), mk(MEISHI)) === false, "形容動詞語幹+名詞は切断されるべき");
});

Deno.test("R03: 形容詞の後の名詞は別のアクセント句に切断", () => {
  assert(chainFlagOf(mk(KEIYOUSHI), mk(MEISHI)) === false, "形容詞+名詞は切断されるべき");
});

Deno.test("R02: 名詞の連続は前に連結", () => {
  assert(chainFlagOf(mk(MEISHI), mk(MEISHI)) === true, "名詞+名詞は連結されるべき");
});

Deno.test("R01: どの規則にも当たらなければ既定で連結", () => {
  // 感動詞はどの述語にも該当せず、既定分岐（行91）へ到達して連結。
  assert(chainFlagOf(mk(KANDOUSHI), mk(KANDOUSHI)) === true, "既定は連結されるべき");
});

Deno.test("順序依存①: R11c（接続助詞て+形容詞非自立→連結）が R09（付属語+自立語→切断）を先取り", () => {
  // prev=接続助詞「て」は付属語なので、規則を並べ替えて R09 を先に評価すると切断されてしまう。
  // R11c が行61（R09 の行73 より上）にあることで連結が守られる。
  assert(
    chainFlagOf(mk(JOSHI_SETSUZOKU, "て"), mk(KEIYOUSHI_HIJIRITSU)) === true,
    "R11c が R09 を先取りして連結にすべき（順番を変えると切断に化ける）",
  );
});

Deno.test("順序依存②: R07（名詞,副詞可能→単独）が R02（名詞連続→連結）を先取り", () => {
  // 副詞可能も名詞なので R02 なら連結になるが、R07（行77）が R02（行89）より上のため切断が勝つ。
  assert(
    chainFlagOf(mk(MEISHI_FUKUSHI), mk(MEISHI)) === false,
    "R07 が R02 を先取りして切断にすべき（順番を変えると連結に化ける）",
  );
});

Deno.test("既に確定した chainFlag は上書きしない（undefined のノードだけ確定する）", () => {
  // current.chainFlag=false を明示。規則上は R02 で true だが、確定済みなので変更されない。
  const nodes = [mk(MEISHI), mk(MEISHI, "", false)];
  njdSetAccentPhrase(nodes);
  assert(nodes[1].chainFlag === false, "確定済み false は R02(true) で上書きされないべき");
  // nodes[0]（先頭）は決してループ対象にならず undefined のまま。
  assert(nodes[0].chainFlag === undefined, "先頭ノードは chainFlag を確定されないべき");
});
