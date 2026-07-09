// 書き手(encodeSection/writeContainer) → 読み手(JtdContainer/decodeSection) の
// 往復で、値・アラインメント・ゼロコピー性が保たれることを検証する。

import {
  decodeSection,
  JtdContainer,
  READ_LAYOUT,
  type SectionLayout,
  TRIE_LAYOUT,
} from "@hdae/yomi/format";
import { encodeSection, writeContainer } from "./container_writer.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

// u8 配列の直後に u16/u32 が来る「アラインメントの意地悪」を含むテスト用レイアウト。
const NASTY_LAYOUT: SectionLayout = {
  header: ["n"],
  arrays: [
    { name: "bytes", type: "u8", length: (h) => h.n },
    { name: "shorts", type: "u16", length: (h) => h.n },
    { name: "words", type: "u32", length: (h) => h.n },
  ],
};

Deno.test("コンテナ往復: 複数セクションの値が完全一致し、全セクションが8B境界に乗る", () => {
  const trie = encodeSection(TRIE_LAYOUT, {
    nodeCount: 3,
    surfaceCount: 1,
    lbsBitLength: 5,
    lbsWordCount: 1,
    terminalBitLength: 3,
    terminalWordCount: 1,
  }, {
    lbsWords: [0b01011],
    terminalWords: [0b100],
    labels: [0, 0x3042, 0x3044], // あ, い
  });
  const read = encodeSection(READ_LAYOUT, { poolLength: 3 }, { pool: [0x30a2, 0x30a4, 0x30fc] });
  // 奇数長 u8 で意地悪（次セクションのアラインを崩しにいく）。
  const nasty = encodeSection(NASTY_LAYOUT, { n: 3 }, {
    bytes: [1, 2, 3],
    shorts: [10, 20, 30],
    words: [100, 200, 300],
  });

  const file = writeContainer([
    { name: "TRIE", encoding: 0, bytes: trie },
    { name: "NSTY", encoding: 0, bytes: nasty },
    { name: "READ", encoding: 0, bytes: read },
  ]);

  // ArrayBuffer 化（ファイル読込と同じ経路を模す）。
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const c = new JtdContainer(buf);

  for (const name of ["TRIE", "NSTY", "READ"]) {
    assert(c.section(name).offset % 8 === 0, `${name} が8B境界にない`);
  }

  const t = c.section("TRIE");
  const td = decodeSection(buf, t.offset, t.length, TRIE_LAYOUT);
  assert(td.scalars.nodeCount === 3, "nodeCount");
  assert(td.arrays.labels[1] === 0x3042, "labels[1]");
  assert((td.arrays.lbsWords as Uint32Array)[0] === 0b01011, "lbsWords");

  const n = c.section("NSTY");
  const nd = decodeSection(buf, n.offset, n.length, NASTY_LAYOUT);
  assert(nd.arrays.shorts[2] === 30, "shorts[2]");
  assert(nd.arrays.words[2] === 300, "words[2]");
  // ゼロコピー: ビューは元バッファを直接指す。
  assert(nd.arrays.words.buffer === buf, "words がコピーされている");

  const r = c.section("READ");
  const rd = decodeSection(buf, r.offset, r.length, READ_LAYOUT);
  assert(
    String.fromCharCode(...(rd.arrays.pool as Uint16Array)) === "アイー",
    "READ pool 文字列",
  );
});

Deno.test("読み手は magic/version/欠損セクション/範囲外を fail loudly で拒否する", () => {
  const ok = writeContainer([{ name: "META", encoding: 0, bytes: new Uint8Array([123]) }]);
  const buf = ok.buffer.slice(0, ok.byteLength);

  // magic 破壊
  const bad1 = buf.slice(0);
  new DataView(bad1).setUint32(0, 0xdeadbeef, true);
  let threw = false;
  try {
    new JtdContainer(bad1);
  } catch {
    threw = true;
  }
  assert(threw, "magic 不一致で throw しない");

  // version 不一致
  const bad2 = buf.slice(0);
  new DataView(bad2).setUint32(4, 999, true);
  threw = false;
  try {
    new JtdContainer(bad2);
  } catch {
    threw = true;
  }
  assert(threw, "version 不一致で throw しない");

  // 欠損セクション
  const c = new JtdContainer(buf);
  threw = false;
  try {
    c.section("TRIE");
  } catch {
    threw = true;
  }
  assert(threw, "欠損セクションで throw しない");
});

Deno.test("encodeSection は配列長の不一致を拒否する（書き手のバグ検出）", () => {
  let threw = false;
  try {
    encodeSection(READ_LAYOUT, { poolLength: 3 }, { pool: [1, 2] });
  } catch {
    threw = true;
  }
  assert(threw, "長さ不一致で throw しない");
});

const expectThrow = (fn: () => unknown, label: string) => {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, `${label} で throw しない`);
};

Deno.test("読み手は 8B非境界オフセット/末尾超過長/過大sectionCount を fail loudly で拒否する", () => {
  const ok = writeContainer([{ name: "META", encoding: 0, bytes: new Uint8Array([1, 2, 3]) }]);
  const buf = ok.buffer.slice(0, ok.byteLength);
  const entryBase = 16; // HEADER_BYTES 直後 = 先頭セクションのテーブルエントリ。

  const misaligned = buf.slice(0);
  new DataView(misaligned).setUint32(entryBase + 8, 20, true); // offset を8の倍数以外へ改竄。
  expectThrow(() => new JtdContainer(misaligned), "8B非境界オフセット");

  const overrun = buf.slice(0);
  new DataView(overrun).setUint32(entryBase + 12, 0x7fffffff, true); // length を過大へ改竄。
  expectThrow(() => new JtdContainer(overrun), "末尾超過長");

  const hugeCount = buf.slice(0);
  new DataView(hugeCount).setUint32(8, 0x00ffffff, true); // sectionCount を過大へ改竄。
  expectThrow(() => new JtdContainer(hugeCount), "過大 sectionCount");
});

Deno.test("decodeSection はヘッダ未満/切り詰め/過長のセクション実長を拒否する（厳密一致）", () => {
  const payload = encodeSection(READ_LAYOUT, { poolLength: 3 }, { pool: [1, 2, 3] });
  // 余白つきバッファへコピー（過長 length を DataView 構築の RangeError でなく検証で落とすため）。
  const big = new ArrayBuffer(payload.byteLength + 16);
  new Uint8Array(big).set(payload);

  // 対照: 正常長は通る。
  const okDecoded = decodeSection(big, 0, payload.byteLength, READ_LAYOUT);
  assert(okDecoded.scalars.poolLength === 3, "正常長のデコード");

  expectThrow(() => decodeSection(big, 0, 2, READ_LAYOUT), "ヘッダ未満の実長");
  expectThrow(() => decodeSection(big, 0, payload.byteLength - 2, READ_LAYOUT), "切り詰め実長");
  expectThrow(() => decodeSection(big, 0, payload.byteLength + 8, READ_LAYOUT), "過長実長");
});
