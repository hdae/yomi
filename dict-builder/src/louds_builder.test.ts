import { BitVector, LoudsTrie } from "@hdae/yomi";
import { buildLouds, type LoudsBuild } from "./louds_builder.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const toTrie = (b: LoudsBuild): LoudsTrie =>
  new LoudsTrie(
    new BitVector(b.lbsWords, b.lbsBitLength),
    b.labels,
    new BitVector(b.terminalWords, b.terminalBitLength),
    b.nodeCount,
    b.surfaceCount,
  );

Deno.test("build→search roundtrip: 登録した全表層形が exactMatch で引け、未登録は引けない", () => {
  const surfaces = ["いく", "いった", "きょう", "きょうと", "今日", "行", "行った", "行く"]
    .sort();
  const b = buildLouds(surfaces);
  const trie = toTrie(b);

  const seen = new Set<number>();
  for (const s of surfaces) {
    const sid = trie.exactMatch(s);
    assert(sid >= 0, `${s} が引けない`);
    assert(!seen.has(sid), `surfaceId 重複: ${s}`);
    seen.add(sid);
    // surfaceOrder の逆引きが一致する（LEXI 並び替えの前提）。
    assert(surfaces[b.surfaceOrder[sid]] === s, `surfaceOrder 不一致: ${s}`);
  }
  for (const s of ["い", "いっ", "きょうF", "行っ", "京", ""]) {
    assert(trie.exactMatch(s) === -1, `未登録 ${s} が引けてしまう`);
  }
});

Deno.test("commonPrefixSearch は接頭辞に一致する全登録語を位置つきで返す", () => {
  const surfaces = ["きょ", "きょう", "きょうと", "と", "とし"].sort();
  const b = buildLouds(surfaces);
  const trie = toTrie(b);

  const hits: string[] = [];
  trie.commonPrefixSearch("きょうとし", 0, (sid, end) => {
    hits.push(surfaces[b.surfaceOrder[sid]] + "@" + end);
  });
  assert(
    hits.join(",") === "きょ@2,きょう@3,きょうと@4",
    `先頭からの hits が不正: ${hits.join(",")}`,
  );

  const hits2: string[] = [];
  trie.commonPrefixSearch("きょうとし", 3, (sid, end) => {
    hits2.push(surfaces[b.surfaceOrder[sid]] + "@" + end);
  });
  assert(hits2.join(",") === "と@4,とし@5", `途中からの hits が不正: ${hits2.join(",")}`);
});

Deno.test("サロゲートペア（非BMP）も2コードユニットのエッジとして正しく引ける", () => {
  const surfaces = ["𠮷野家", "吉野家"].sort();
  const b = buildLouds(surfaces);
  const trie = toTrie(b);
  for (const s of surfaces) {
    assert(trie.exactMatch(s) >= 0, `${s} が引けない`);
  }
  assert(trie.exactMatch("𠮷野") === -1, "部分文字列が誤ヒット");
});

Deno.test("ソート違反・空文字列は fail loudly", () => {
  for (const bad of [["b", "a"], ["a", "a"], [""]]) {
    let threw = false;
    try {
      buildLouds(bad);
    } catch {
      threw = true;
    }
    assert(threw, `${JSON.stringify(bad)} で throw しなかった`);
  }
});

Deno.test("実辞書規模の負荷: 決定的生成の1万語で全件 roundtrip", () => {
  // かな2〜6文字の擬似語彙を決定的に生成（重複は Set で除去）。
  let s = 123456789;
  const rnd = () => {
    s = (Math.imul(s, 48271) >>> 0) % 0x7fffffff;
    return s / 0x7fffffff;
  };
  const kana =
    "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん";
  const set = new Set<string>();
  while (set.size < 10000) {
    const len = 2 + Math.floor(rnd() * 5);
    let w = "";
    for (let i = 0; i < len; i++) w += kana[Math.floor(rnd() * kana.length)];
    set.add(w);
  }
  const surfaces = [...set].sort();
  const trie = toTrie(buildLouds(surfaces));
  for (const w of surfaces) {
    if (trie.exactMatch(w) < 0) throw new Error(`${w} が引けない`);
  }
});
