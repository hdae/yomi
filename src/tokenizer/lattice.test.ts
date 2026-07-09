// tokenizeToNodes（Viterbi ラティス）の振る舞いテスト。
// 実辞書に依存せず、lattice.ts が実際に触る辞書表面だけを実装した極小モック辞書で
// 経路選択・タイブレーク・未知語生成・枝刈り・サロゲート・失敗パスを縛る。

import type { JtdDictionary } from "../dict/dictionary.ts";
import type { LatticeNode } from "./types.ts";
import { tokenizeToNodes } from "./lattice.ts";

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
// lattice.ts が参照する表面のみ実装する（units/meta/pos は tokenizeToNodes が触らないため不要）。

type MockCat = { name: string; invoke: boolean; group: boolean };
type MockEntry = { surface: string; leftId: number; rightId: number; cost: number };
type MockUnkRule = { catId: number; leftId: number; rightId: number; cost: number };
type MockSpec = {
  entries?: MockEntry[];
  categories: MockCat[];
  charCats: Record<string, number[]>;
  defaultCatId: number;
  unkRules?: MockUnkRule[];
  conn?: (prevRightId: number, nextLeftId: number) => number;
};

const buildLatticeDict = (spec: MockSpec): JtdDictionary => {
  const entries = spec.entries ?? [];

  // 表層でグルーピングし、初出順に surfaceId を割り当て、エントリを連続配置する。
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

  // trie.commonPrefixSearch: Map ベースで再現。end 昇順で onHit（実 trie の走査順に一致）。
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

  // charCategoriesOf: 明示マップ優先、未登録は defaultCatId（BMP/非BMP とも）。
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

  // 未知語規則を catId 昇順に並べ、unkCatIndex（catCount+1）で範囲索引化する。
  const catCount = spec.categories.length;
  const rules = (spec.unkRules ?? []).slice().sort((a, b) => a.catId - b.catId);
  const unkCatIndex: number[] = [];
  for (let c = 0; c <= catCount; c++) unkCatIndex.push(rules.filter((r) => r.catId < c).length);
  const unkLeftId = rules.map((r) => r.leftId);
  const unkRightId = rules.map((r) => r.rightId);
  const unkCost = rules.map((r) => r.cost);

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
    connectionCost: spec.conn ?? ((_prev: number, _next: number): number => 0),
    charCategories,
    defaultCategoryId: spec.defaultCatId,
    charCategoriesOf,
    unkCatIndex,
    unkLeftId,
    unkRightId,
    unkCost,
  };
  return mock as unknown as JtdDictionary;
};

const surfacesOf = (text: string, nodes: LatticeNode[]): string[] =>
  nodes.map((n) => text.slice(n.start, n.end));

Deno.test("同コスト経路は先に追加されたエッジが勝ち、コストを1ずらすと勝者が入れ替わる", () => {
  const text = "にわ"; // 「庭」(にわ) vs 「に」+「わ」
  const make = (niwaCost: number) =>
    buildLatticeDict({
      entries: [
        { surface: "にわ", leftId: 1, rightId: 1, cost: niwaCost },
        { surface: "に", leftId: 1, rightId: 1, cost: 4 },
        { surface: "わ", leftId: 1, rightId: 1, cost: 6 },
      ],
      categories: [{ name: "KANJI", invoke: false, group: false }],
      charCats: { "に": [0], "わ": [0] },
      defaultCatId: 0,
    });

  // 同点(にわ=10 と に+わ=4+6=10)。にわ は p=0 で先に endsAt[2] へ入るので勝つ。
  const tie = tokenizeToNodes(make(10), text);
  assert(surfacesOf(text, tie).join("/") === "にわ", `同点: ${surfacesOf(text, tie).join("/")}`);

  // にわ を +1(=11) にすると に+わ(=10) が勝つ。勝者が入れ替わる＝assertion が生きている証拠。
  const flip = tokenizeToNodes(make(11), text);
  assert(surfacesOf(text, flip).join("/") === "に/わ", `flip: ${surfacesOf(text, flip).join("/")}`);
});

Deno.test("未知語 invoke: false は既知語のある位置で張らず、true は併存して安い方が勝つ", () => {
  const text = "アイ";
  const make = (invoke: boolean) =>
    buildLatticeDict({
      entries: [{ surface: "アイ", leftId: 1, rightId: 1, cost: 100 }],
      categories: [{ name: "KATA", invoke, group: false }],
      charCats: { "ア": [0], "イ": [0] },
      defaultCatId: 0,
      unkRules: [{ catId: 0, leftId: 1, rightId: 1, cost: -100 }],
    });

  // invoke=false: 既知語「アイ」があるので未知語は生成されない。高コスト(100)でも既知語のみ。
  const suppressed = tokenizeToNodes(make(false), text);
  assert(suppressed.length === 1 && suppressed[0].entryIdx >= 0, "invoke=false は既知語のみ");

  // invoke=true: 未知語(−100)が既知語と併存し、安いので未知語列が勝つ。
  const coexist = tokenizeToNodes(make(true), text);
  assert(coexist.length === 2, `invoke=true は未知語が併存: ${coexist.length}`);
  assert(coexist.every((n) => n.entryIdx < 0), "勝者は未知語（併存の証拠）");
});

Deno.test("未知語 group: true は同カテゴリ連続を1語化し、false は1文字ずつになる", () => {
  const text = "アイウエ";
  const make = (group: boolean) =>
    buildLatticeDict({
      categories: [{ name: "KATA", invoke: true, group }],
      charCats: { "ア": [0], "イ": [0], "ウ": [0], "エ": [0] },
      defaultCatId: 0,
      unkRules: [{ catId: 0, leftId: 1, rightId: 1, cost: 0 }],
    });

  const grouped = tokenizeToNodes(make(true), text);
  assert(grouped.length === 1, `group=true は1語化: ${grouped.length}`);
  assert(grouped[0].start === 0 && grouped[0].end === 4, "group=true は 0..4 を覆う");

  const perChar = tokenizeToNodes(make(false), text);
  assert(perChar.length === 4, `group=false は1文字ずつ: ${perChar.length}`);
  assert(perChar.every((n) => n.end - n.start === 1), "group=false は各ノード長1");
});

Deno.test("unknownWordEnd: 未知語で覆った区間の内側では未知語を再生成しない（増殖しない）", () => {
  const text = "アイウ";
  const dict = buildLatticeDict({
    // 位置0に安い既知語「ア」(-50) を置く。group 未知語は 0..3 を1本張る。
    entries: [{ surface: "ア", leftId: 1, rightId: 1, cost: -50 }],
    categories: [{ name: "KATA", invoke: true, group: true }],
    charCats: { "ア": [0], "イ": [0], "ウ": [0] },
    defaultCatId: 0,
    unkRules: [{ catId: 0, leftId: 1, rightId: 1, cost: 0 }],
  });
  const path = tokenizeToNodes(dict, text);

  // 抑制が効くと 0..3 の未知語1本のみが経路になる。もし内側(位置1)で未知語「イウ」を
  // 再生成していたら「ア」(-50)+「イウ」(0)=−50 の方が安く、経路は2ノードになるはず。
  // 1ノードであることが unknownWordEnd による抑制の証拠（fault が入れば2ノードで落ちる）。
  assert(path.length === 1, `未知語1本のみ（抑制の証拠）: ${path.length}`);
  assert(
    path[0].entryIdx < 0 && path[0].start === 0 && path[0].end === 3,
    "経路は 0..3 の未知語",
  );
});

Deno.test("到達不能位置の枝刈り: 先行エッジの無い位置で始まる語は生成されない", () => {
  const text = "アイウ";
  const dict = buildLatticeDict({
    entries: [
      { surface: "アイウ", leftId: 1, rightId: 1, cost: 5 },
      // 位置1始まり。到達不能なので生成されない（もし addNode されれば到達不能で throw する）。
      { surface: "イウ", leftId: 1, rightId: 1, cost: 0 },
    ],
    categories: [{ name: "KANJI", invoke: false, group: false }],
    charCats: { "ア": [0], "イ": [0], "ウ": [0] },
    defaultCatId: 0,
  });
  const path = tokenizeToNodes(dict, text);

  assert(path.length === 1, `枝刈りで throw せず1ノード: ${path.length}`);
  assert(surfacesOf(text, path)[0] === "アイウ", "アイウ 単独");
  assert(path.every((n) => n.start !== 1), "位置1始まりの語は経路に無い");
});

Deno.test("サロゲートペア: 絵文字は非BMP未知語として +2 進み、後続の既知語が正しい位置で認識される", () => {
  const text = "😀ア"; // 😀 = U+1F600（UTF-16 で2コードユニット）
  const dict = buildLatticeDict({
    entries: [{ surface: "ア", leftId: 1, rightId: 1, cost: 0 }],
    categories: [
      { name: "KATA", invoke: false, group: false }, // 0: ア用（未知語を張らない）
      { name: "DEFAULT", invoke: true, group: false }, // 1: 非BMPフォールバック
    ],
    charCats: { "ア": [0] },
    defaultCatId: 1,
    unkRules: [{ catId: 1, leftId: 1, rightId: 1, cost: 0 }],
  });
  const path = tokenizeToNodes(dict, text);

  assert(path.length === 2, `2ノード: ${path.length}`);
  assert(
    path[0].entryIdx < 0 && path[0].start === 0 && path[0].end === 2,
    "絵文字は 0..2 の未知語（+2 進んだ証拠）",
  );
  assert(text.slice(path[0].start, path[0].end) === "😀", "絵文字表層をそのまま覆う");
  assert(
    path[1].entryIdx >= 0 && path[1].start === 2 && path[1].end === 3,
    "後続の既知語アは UTF-16 位置2で認識される",
  );
});

Deno.test("経路が構成できない入力は throw する（未知語規則も既知語も無い）", () => {
  const text = "ア";
  const dict = buildLatticeDict({
    categories: [{ name: "NONE", invoke: true, group: false }],
    charCats: { "ア": [0] },
    defaultCatId: 0,
    unkRules: [], // どのカテゴリにも未知語規則が無い ⇒ ノードが1つも生成されない
  });
  assertThrows(() => tokenizeToNodes(dict, text), /経路が存在しない/, "経路なしで throw");
});
