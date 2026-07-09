// tokenize（公開トークナイザ）のユニット展開・fail-loud ガード・空白除去・断片オフセットの
// 振る舞いテスト。実辞書に依存せず、tokenizer.ts が触る辞書表面を実装した極小モックで縛る。
// 入力に使う文字はすべて normalizeForDict の不動点（カタカナ・。・\t・U+3000）なので、
// 正規化後オフセットは原文オフセットと一致する。

import type { JtdDictionary } from "../dict/dictionary.ts";
import { tokenize } from "./tokenizer.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const assertThrows = (fn: () => unknown, pattern: RegExp, msg: string) => {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
    const m = e instanceof Error ? e.message : String(e);
    assert(pattern.test(m), `${msg}: 例外メッセージが想定外 → ${m}`);
  }
  assert(threw, `${msg}: 例外が発生しなかった`);
};

// ---- 極小モック辞書 ----
// lattice.ts が使う表面に加え、tokenize が使う units/pos/chainRule/meta を実装する。

type MockUnit = { surfLen: number; accType: number; pron: string; pronRaw: string };
type MockCat = { name: string; invoke: boolean; group: boolean };
type MockEntry = {
  surface: string;
  leftId: number;
  rightId: number;
  cost: number;
  posId?: number;
  chainRuleId?: number;
  units?: MockUnit[];
};
type MockUnkRule = { catId: number; leftId: number; rightId: number; cost: number; posId?: number };
type MockSpec = {
  entries?: MockEntry[];
  categories: MockCat[];
  charCats: Record<string, number[]>;
  defaultCatId: number;
  unkRules?: MockUnkRule[];
  conn?: (prevRightId: number, nextLeftId: number) => number;
  posTable?: string[][];
  chainRuleTable?: string[];
};

const buildTokenizerDict = (spec: MockSpec): JtdDictionary => {
  const entries = spec.entries ?? [];

  // 表層でグルーピングし、初出順に surfaceId を割り当てエントリを連続配置する。
  const groups: { surface: string; entries: MockEntry[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const e of entries) {
    const gi = groupIndex.get(e.surface);
    if (gi === undefined) {
      groupIndex.set(e.surface, groups.length);
      groups.push({ surface: e.surface, entries: [e] });
    } else {
      groups[gi].entries.push(e);
    }
  }
  const flat: MockEntry[] = [];
  const entryIndex: number[] = [0];
  for (const g of groups) {
    for (const e of g.entries) flat.push(e);
    entryIndex.push(flat.length);
  }
  const leftId = flat.map((e) => e.leftId);
  const rightId = flat.map((e) => e.rightId);
  const cost = flat.map((e) => e.cost);
  const posId = flat.map((e) => e.posId ?? 0);
  const chainRuleId = flat.map((e) => e.chainRuleId ?? 0);

  // ユニット列。未指定なら「表層全体＝1ユニット」を合成する。
  const unitIndex: number[] = [0];
  const unitSurfLen: number[] = [];
  const unitAccType: number[] = [];
  const unitPronArr: string[] = [];
  const unitPronRawArr: string[] = [];
  for (const e of flat) {
    const units = e.units ??
      [{ surfLen: e.surface.length, accType: 255, pron: e.surface, pronRaw: e.surface }];
    for (const u of units) {
      unitSurfLen.push(u.surfLen);
      unitAccType.push(u.accType);
      unitPronArr.push(u.pron);
      unitPronRawArr.push(u.pronRaw);
    }
    unitIndex.push(unitSurfLen.length);
  }

  const commonPrefixSearch = (
    text: string,
    from: number,
    onHit: (surfaceId: number, end: number) => void,
  ): void => {
    const hits: { sid: number; end: number }[] = [];
    groups.forEach((g, sid) => {
      const end = from + g.surface.length;
      if (end <= text.length && text.slice(from, end) === g.surface) hits.push({ sid, end });
    });
    hits.sort((a, b) => a.end - b.end);
    for (const h of hits) onHit(h.sid, h.end);
  };

  const catMap = new Map<number, number[]>();
  for (const [ch, ids] of Object.entries(spec.charCats)) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) catMap.set(cp, ids);
  }
  const charCategoriesOf = (codePoint: number, out: number[]): number => {
    const ids = catMap.get(codePoint);
    if (ids !== undefined) {
      for (let i = 0; i < ids.length; i++) out[i] = ids[i];
      return ids.length;
    }
    out[0] = spec.defaultCatId;
    return 1;
  };

  const catCount = spec.categories.length;
  const rules = (spec.unkRules ?? []).slice().sort((a, b) => a.catId - b.catId);
  const unkCatIndex: number[] = [];
  for (let c = 0; c <= catCount; c++) unkCatIndex.push(rules.filter((r) => r.catId < c).length);
  const unkLeftId = rules.map((r) => r.leftId);
  const unkRightId = rules.map((r) => r.rightId);
  const unkCost = rules.map((r) => r.cost);
  const unkPosId = rules.map((r) => r.posId ?? 0);

  const charCategories = spec.categories.map((c) => ({
    name: c.name,
    invoke: c.invoke,
    group: c.group,
    length: 1,
  }));

  const mock = {
    trie: { commonPrefixSearch },
    entryIndex,
    leftId,
    rightId,
    cost,
    posId,
    chainRuleId,
    unitIndex,
    unitSurfLen,
    unitAccType,
    unitPron: (u: number): string => unitPronArr[u],
    unitPronRaw: (u: number): string => unitPronRawArr[u],
    connectionCost: spec.conn ?? ((_prev: number, _next: number): number => 0),
    charCategories,
    defaultCategoryId: spec.defaultCatId,
    charCategoriesOf,
    unkCatIndex,
    unkLeftId,
    unkRightId,
    unkCost,
    unkPosId,
    meta: {
      posTable: spec.posTable ?? [["名詞", "一般", "*", "*", "*", "*"]],
      chainRuleTable: spec.chainRuleTable ?? ["*"],
    },
  };
  return mock as unknown as JtdDictionary;
};

Deno.test("複合語エントリはユニット単位で展開される（surfLen 分割・最終ユニット=残り全部・chainFlag）", () => {
  const dict = buildTokenizerDict({
    entries: [{
      surface: "アイウ",
      leftId: 1,
      rightId: 1,
      cost: 0,
      posId: 0,
      chainRuleId: 1,
      units: [
        { surfLen: 1, accType: 1, pron: "ア", pronRaw: "ア" },
        // 最終ユニット surfLen=0 は「残り全部」。accType 255 は undefined になる。
        { surfLen: 0, accType: 255, pron: "イウ", pronRaw: "イ’ウ" },
      ],
    }],
    categories: [{ name: "KATA", invoke: false, group: false }],
    charCats: { "ア": [0], "イ": [0], "ウ": [0] },
    defaultCatId: 0,
    posTable: [["名詞", "一般", "*", "*", "*", "*"]],
    chainRuleTable: ["*", "C1"],
  });

  const tokens = tokenize(dict, "アイウ");
  assert(tokens.length === 2, `2トークンへ展開: ${tokens.length}`);
  const [t0, t1] = tokens;
  assert(t0.surface === "ア" && t0.start === 0 && t0.end === 1, "ユニット0 表層/範囲");
  assert(t1.surface === "イウ" && t1.start === 1 && t1.end === 3, "最終ユニット=残り全部(1..3)");
  assert(t0.pron === "ア" && t0.pronRaw === "ア", "ユニット0 発音");
  assert(t1.pron === "イウ" && t1.pronRaw === "イ’ウ", "ユニット1 発音（生は ’ 保持）");
  assert(t0.accType === 1 && t1.accType === undefined, "accType（255→undefined）");
  assert(
    t0.chainFlag === undefined && t1.chainFlag === false,
    "chainFlag: 先頭 undefined / 以降 false",
  );
  assert(t0.chainRule === "C1" && t1.chainRule === "C1", "chainRule はエントリ共通(C1)");
  assert(t0.pos[0] === "名詞" && t1.pos === t0.pos, "pos はエントリ共通（同一参照）");
  assert(!t0.isUnknown && !t1.isUnknown, "既知語");
});

Deno.test("fail-loud: 非最終ユニットの surfLen=0 は throw する", () => {
  const dict = buildTokenizerDict({
    entries: [{
      surface: "アイ",
      leftId: 1,
      rightId: 1,
      cost: 0,
      units: [
        { surfLen: 0, accType: 255, pron: "ア", pronRaw: "ア" }, // 非最終で 0 ⇒ 不正
        { surfLen: 1, accType: 255, pron: "イ", pronRaw: "イ" },
      ],
    }],
    categories: [{ name: "KATA", invoke: false, group: false }],
    charCats: { "ア": [0], "イ": [0] },
    defaultCatId: 0,
  });
  assertThrows(() => tokenize(dict, "アイ"), /非最終ユニットの surfLen=0/, "非最終 surfLen=0");
});

Deno.test("fail-loud: ユニット総和がノード表層を被覆しないと throw する", () => {
  const dict = buildTokenizerDict({
    entries: [{
      surface: "アイウ",
      leftId: 1,
      rightId: 1,
      cost: 0,
      units: [
        { surfLen: 1, accType: 255, pron: "ア", pronRaw: "ア" },
        // 最終ユニットだが surfLen=1（≠0）。1+1=2 で表層3文字を覆えない ⇒ 不正。
        { surfLen: 1, accType: 255, pron: "イ", pronRaw: "イ" },
      ],
    }],
    categories: [{ name: "KATA", invoke: false, group: false }],
    charCats: { "ア": [0], "イ": [0], "ウ": [0] },
    defaultCatId: 0,
  });
  assertThrows(() => tokenize(dict, "アイウ"), /被覆しない/, "ユニット被覆不足");
});

Deno.test("空白のみトークンの除去: \\t は除去され、U+3000（SYMBOL）は残る", () => {
  const dict = buildTokenizerDict({
    entries: [
      { surface: "ア", leftId: 1, rightId: 1, cost: 0 },
      { surface: "イ", leftId: 1, rightId: 1, cost: 0 },
    ],
    categories: [
      { name: "KATA", invoke: false, group: false }, // 0
      { name: "SPACE", invoke: true, group: true }, // 1
      { name: "SYMBOL", invoke: true, group: false }, // 2
    ],
    charCats: { "ア": [0], "イ": [0], "\t": [1], "　": [2] },
    defaultCatId: 0,
    unkRules: [
      { catId: 1, leftId: 1, rightId: 1, cost: 0, posId: 0 },
      { catId: 2, leftId: 1, rightId: 1, cost: 0, posId: 0 },
    ],
    posTable: [["記号", "空白", "*", "*", "*", "*"]],
  });

  // \t は SPACE のみのトークン ⇒ 除去（かつ断片区切りでもある）。ア・イ だけ残る。
  const tabbed = tokenize(dict, "ア\tイ");
  assert(
    tabbed.map((t) => t.surface).join("/") === "ア/イ",
    `\\t 除去: ${tabbed.map((t) => t.surface).join("/")}`,
  );
  assert(tabbed.every((t) => t.surface !== "\t"), "\\t トークンは残らない");

  // U+3000 は SYMBOL カテゴリ（SPACE ではない）なので空白扱いされず残る。
  const ideo = tokenize(dict, "ア　イ");
  assert(
    ideo.map((t) => t.surface).join("/") === "ア/　/イ",
    `U+3000 残存: ${ideo.map((t) => t.surface).join("/")}`,
  );
  assert(ideo[1].surface === "　" && ideo[1].isUnknown, "U+3000 は未知語トークンとして残る");
});

Deno.test("複数断片: 2断片目のトークン start/end が全文オフセットへ写像される", () => {
  const dict = buildTokenizerDict({
    entries: [
      { surface: "アイ", leftId: 1, rightId: 1, cost: 0 },
      { surface: "。", leftId: 1, rightId: 1, cost: 0 },
      { surface: "ウエ", leftId: 1, rightId: 1, cost: 0 },
    ],
    categories: [{ name: "KANJI", invoke: false, group: false }],
    charCats: { "ア": [0], "イ": [0], "ウ": [0], "エ": [0], "。": [0] },
    defaultCatId: 0,
  });

  const tokens = tokenize(dict, "アイ。ウエ"); // 「。」で2断片に割れる
  assert(
    tokens.map((t) => t.surface).join("/") === "アイ/。/ウエ",
    `分割: ${tokens.map((t) => t.surface).join("/")}`,
  );
  assert(tokens.map((t) => t.start).join(",") === "0,2,3", `start: ${tokens.map((t) => t.start)}`);
  assert(tokens.map((t) => t.end).join(",") === "2,3,5", `end: ${tokens.map((t) => t.end)}`);
  const ue = tokens.find((t) => t.surface === "ウエ");
  assert(
    ue !== undefined && ue.start === 3 && ue.end === 5,
    "2断片目「ウエ」は全文オフセット 3..5 へ写像される",
  );
});
