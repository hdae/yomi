// 型境界バリデータの仕様固定。JSON 由来の unknown が構造どおりでなければ
// path つきメッセージで throw し、正しい入力はそのまま通ることを縛る。

import { validateDictMeta, validateOverlayEntries } from "./validate.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

/** fn が throw し、メッセージに substr を含むことを検証する。 */
const assertThrows = (fn: () => unknown, substr: string) => {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.includes(substr), `メッセージに "${substr}" が無い: ${msg}`);
    return;
  }
  throw new Error(`throw しなかった（期待: "${substr}"）`);
};

/** 最小の正しい META（deep copy して壊す素体）。 */
const validMeta = () => ({
  dictName: "test-dict",
  source: { repo: "example/repo", tag: "v1.0.0" },
  builderVersion: "0.1.0",
  buildDate: "2026-07-10",
  counts: { surfaceCount: 6, entries: 10 },
  posTable: [["名詞", "一般", "*", "*", "*", "*"], ["動詞", "自立", "*", "*", "五段", "基本形"]],
  chainRuleTable: ["*", "C1"],
  charCategories: ["DEFAULT", "KANJI"],
  checksums: {
    CHAR: "00000000",
    CONN: "11111111",
    LEXI: "22222222",
    READ: "33333333",
    TRIE: "44444444",
    UNKD: "55555555",
  },
  license: "BSD-3-Clause",
});

Deno.test("validateDictMeta: 正しい META はそのまま通る（未知キーは無視）", () => {
  const m = { ...validMeta(), futureKey: "ignored" };
  const out = validateDictMeta(m);
  assert(out.dictName === "test-dict", "dictName");
  assert(out.posTable[1][4] === "五段", "posTable の中身が保持される");
  assert(out.checksums.TRIE === "44444444", "checksums が保持される");
  assert(!("futureKey" in out), "未知キーは出力へ持ち込まれない（既知キーのみ再構築）");
});

Deno.test("validateDictMeta: root がオブジェクトでなければ throw", () => {
  assertThrows(() => validateDictMeta(null), "(root)");
  assertThrows(() => validateDictMeta([]), "(root)");
  assertThrows(() => validateDictMeta("{}"), "(root)");
});

Deno.test("validateDictMeta: 必須キーの欠落・型違いは path つきで throw", () => {
  const drop = (key: string) => {
    const m: Record<string, unknown> = validMeta();
    delete m[key];
    return m;
  };
  assertThrows(() => validateDictMeta(drop("dictName")), "dictName");
  assertThrows(() => validateDictMeta(drop("source")), "source");
  assertThrows(() => validateDictMeta(drop("checksums")), "checksums");
  assertThrows(() => validateDictMeta({ ...validMeta(), dictName: 42 }), "dictName は string");
  assertThrows(
    () => validateDictMeta({ ...validMeta(), source: { repo: "r" } }),
    "source.tag",
  );
});

Deno.test("validateDictMeta: counts の非整数（NaN 含む）は throw", () => {
  assertThrows(
    () => validateDictMeta({ ...validMeta(), counts: { surfaceCount: NaN } }),
    "counts.surfaceCount",
  );
  assertThrows(
    () => validateDictMeta({ ...validMeta(), counts: { surfaceCount: "6" } }),
    "counts.surfaceCount",
  );
});

Deno.test("validateDictMeta: posTable の行が 6 列でなければ throw", () => {
  const m = validMeta();
  m.posTable[1] = ["名詞", "一般"];
  assertThrows(() => validateDictMeta(m), "posTable[1] は 6 列");
  const m2 = validMeta();
  (m2.posTable[0] as unknown[])[3] = 7;
  assertThrows(() => validateDictMeta(m2), "posTable[0][3]");
});

Deno.test("validateDictMeta: checksums のセクション欠落は throw（CRC 検証の黙殺を防ぐ）", () => {
  const m = validMeta();
  delete (m.checksums as Record<string, unknown>).TRIE;
  assertThrows(() => validateDictMeta(m), "checksums に TRIE が無い");
  // 空オブジェクトも同様（全セクションの CRC 検証が抜ける最悪形）。
  assertThrows(() => validateDictMeta({ ...validMeta(), checksums: {} }), "checksums に");
});

Deno.test("validateDictMeta: chainRuleTable / charCategories の非 string 要素は throw", () => {
  assertThrows(
    () => validateDictMeta({ ...validMeta(), chainRuleTable: ["*", 1] }),
    "chainRuleTable[1]",
  );
  assertThrows(
    () => validateDictMeta({ ...validMeta(), charCategories: [null] }),
    "charCategories[0]",
  );
});

Deno.test("validateOverlayEntries: 正しいエントリ配列はそのまま通る（省略可能キー対応）", () => {
  const out = validateOverlayEntries([
    { surface: "yomi", reading: "ヨミ", accentType: 1 },
    {
      surface: "全部",
      reading: "ゼンブ",
      accentType: 0,
      accentConnRule: "C1",
      pos: ["名詞", "一般"],
      cost: -5000,
    },
  ]);
  assert(out.length === 2, "件数");
  assert(out[0].cost === undefined, "省略キーは undefined のまま");
  assert(out[1].pos?.[0] === "名詞" && out[1].cost === -5000, "省略可能キーが保持される");
});

Deno.test("validateOverlayEntries: 配列以外・オブジェクト以外の要素は throw", () => {
  assertThrows(() => validateOverlayEntries({}), "(root)");
  assertThrows(() => validateOverlayEntries('[{"surface":"a"}]'), "(root)");
  assertThrows(() => validateOverlayEntries(["文字列"]), "[0]");
});

Deno.test("validateOverlayEntries: 必須キーの欠落・型違いは path つきで throw", () => {
  assertThrows(() => validateOverlayEntries([{ reading: "ア", accentType: 0 }]), "[0].surface");
  assertThrows(
    () => validateOverlayEntries([{ surface: "あ", accentType: 0 }]),
    "[0].reading",
  );
  assertThrows(
    () => validateOverlayEntries([{ surface: "あ", reading: "ア" }]),
    "[0].accentType",
  );
  // 2件目のエラーは index が [1] になる。
  assertThrows(
    () => validateOverlayEntries([{ surface: "あ", reading: "ア", accentType: 0 }, {}]),
    "[1].surface",
  );
});

Deno.test("validateOverlayEntries: cost / accentType の非整数はコスト演算を汚染する前に throw", () => {
  const base = { surface: "あ", reading: "ア", accentType: 0 };
  // 文字列 cost はラティスで文字列連結になり黙って壊れる（構造検証で止める本命ケース）。
  assertThrows(() => validateOverlayEntries([{ ...base, cost: "-10000" }]), "[0].cost");
  assertThrows(() => validateOverlayEntries([{ ...base, cost: NaN }]), "[0].cost");
  assertThrows(() => validateOverlayEntries([{ ...base, cost: 1.5 }]), "[0].cost");
  assertThrows(() => validateOverlayEntries([{ ...base, accentType: "1" }]), "[0].accentType");
  assertThrows(() => validateOverlayEntries([{ ...base, pos: ["名詞", 1] }]), "[0].pos[1]");
});
