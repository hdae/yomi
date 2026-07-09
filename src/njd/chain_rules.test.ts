// parseChainRules / getRule（accent_rule.rs 移植）の振る舞いテスト。
// 文法「[品詞%]結合型[@加算値]」を '/' で並べた辞書 chain_rule 欄のパースと、
// 前語品詞によるルール選択を検証する。
//
// 期待値は accent_rule.rs の意味論から導出する（実装の返り値コピーではない）:
//  - 品詞プレフィクスは「前語の品詞別スロット」を選ぶ。プレフィクス無し=default スロット。
//  - "特殊助動詞" は PARSE_REGEX には載るが POSMatch が受理せずスキップ（jpreprocess 同挙動）。
//  - "*"/"" は「規則なし」= null。マッチしない要素はスキップ。
//  - getRule は 助動詞 を 動詞スロットへ写像し、該当スロットが無ければ default に落ちる。

import type { ChainRule, ChainRules } from "./types.ts";
import { getRule, parseChainRules } from "./chain_rules.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const assertRule = (
  got: ChainRule | undefined,
  accentType: string,
  addType: number,
  msg: string,
) => {
  assert(got !== undefined, `${msg}: ルールが undefined`);
  assert(
    got!.accentType === accentType && got!.addType === addType,
    `${msg}: got ${JSON.stringify(got)} != {${accentType},${addType}}`,
  );
};

/** 定義済みスロットの個数（想定外スロットへの誤配線を検出する）。 */
const slotCount = (r: ChainRules): number => Object.keys(r).length;

Deno.test('parseChainRules "C3": プレフィクス無しは default スロットに結合型のみ', () => {
  const r = parseChainRules("C3");
  assert(r !== null, "C3 は非null");
  assertRule(r!.default, "C3", 0, "default=C3");
  assert(slotCount(r!) === 1, "スロットは default のみ");
});

Deno.test('parseChainRules "形容詞%F2@-1": 品詞条件付き＋負の加算値', () => {
  const r = parseChainRules("形容詞%F2@-1");
  assert(r !== null, "非null");
  assertRule(r!.keiyoushi, "F2", -1, "keiyoushi=F2@-1");
  assert(r!.default === undefined, "default スロットは未設定");
  assert(slotCount(r!) === 1, "スロットは keiyoushi のみ");
});

Deno.test('parseChainRules "動詞%F1/形容詞%F1/名詞%F1": 複数規則を品詞別スロットへ振り分け', () => {
  const r = parseChainRules("動詞%F1/形容詞%F1/名詞%F1");
  assert(r !== null, "非null");
  assertRule(r!.doushi, "F1", 0, "doushi=F1");
  assertRule(r!.keiyoushi, "F1", 0, "keiyoushi=F1");
  assertRule(r!.meishi, "F1", 0, "meishi=F1");
  assert(r!.default === undefined && r!.joshi === undefined, "default/joshi は未設定");
  assert(slotCount(r!) === 3, "スロットは3つ");
});

Deno.test('parseChainRules "*" と "" は規則なし（null）', () => {
  assert(parseChainRules("*") === null, "* は null");
  assert(parseChainRules("") === null, "空文字は null");
});

Deno.test("parseChainRules: 特殊助動詞% はスキップされ空の規則集合になる", () => {
  // 正規表現には載るが POSMatch::from_str が受理しないため、どのスロットにも入らない。
  const r = parseChainRules("特殊助動詞%F1");
  assert(r !== null, "非null（空オブジェクト）");
  assert(slotCount(r!) === 0, "特殊助動詞 はスキップされスロット0");
});

Deno.test("parseChainRules: 文法に合わない要素はスキップ（空集合を返す）", () => {
  const r = parseChainRules("XYZ");
  assert(r !== null, "非null");
  assert(slotCount(r!) === 0, "非マッチ要素はスキップされスロット0");
});

Deno.test("parseChainRules: 混在列は有効要素のみ採り、無効要素は落とす", () => {
  // 有効(名詞%C2@1) + 無効(特殊助動詞%F1・XYZ)。名詞スロットだけが残る。
  const r = parseChainRules("名詞%C2@1/特殊助動詞%F1/XYZ");
  assert(r !== null, "非null");
  assertRule(r!.meishi, "C2", 1, "meishi=C2@1");
  assert(slotCount(r!) === 1, "有効な名詞スロットのみ残る");
});

Deno.test("parseChainRules メモ化: 同一入力は同一オブジェクト参照を返す（キャッシュ無害）", () => {
  // 参照が同一 = パースが1回だけで、呼び出し側が破壊変更しない限り無害。
  const a = parseChainRules("動詞%F4@1/助詞%F2@1");
  const b = parseChainRules("動詞%F4@1/助詞%F2@1");
  assert(a === b, "同一入力は同一参照を返すべき");
  assert(parseChainRules("*") === parseChainRules("*"), "null 結果もキャッシュされ同一");
});

Deno.test("getRule: 前語品詞で対応スロットを選ぶ（助動詞は動詞スロットへ写像）", () => {
  const r = parseChainRules("動詞%F1/形容詞%F2/名詞%C3");
  assert(r !== null, "非null");
  assertRule(getRule(r!, ["名詞", "一般"]), "C3", 0, "前=名詞 → 名詞スロット");
  assertRule(getRule(r!, ["動詞", "自立"]), "F1", 0, "前=動詞 → 動詞スロット");
  assertRule(getRule(r!, ["形容詞", "自立"]), "F2", 0, "前=形容詞 → 形容詞スロット");
  assertRule(getRule(r!, ["助動詞", "*"]), "F1", 0, "前=助動詞 → 動詞スロットへ写像");
});

Deno.test("getRule: 該当スロットが無ければ default にフォールバック", () => {
  const r = parseChainRules("C5/動詞%F1");
  assert(r !== null, "非null");
  // 前=助詞 は joshi スロット未定義 → default(C5)。
  assertRule(getRule(r!, ["助詞", "格助詞"]), "C5", 0, "助詞は default(C5) に落ちる");
  // 前=動詞 は動詞スロット命中。
  assertRule(getRule(r!, ["動詞", "自立"]), "F1", 0, "動詞は動詞スロット(F1)");
});

Deno.test("getRule: スロットも default も無ければ undefined", () => {
  const r = parseChainRules("動詞%F1");
  assert(r !== null, "非null");
  assert(getRule(r!, ["名詞", "一般"]) === undefined, "名詞スロットも default も無く undefined");
});
