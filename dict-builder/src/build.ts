// naist-jdic → JTD1 コンテナのビルド本体。
// 使い方: deno task build-dict（data/naist-jdic → fixtures/naist-jdic.jtd）

import {
  CHAR_LAYOUT,
  CONN_LAYOUT,
  CONTEXT_ID_DIMENSION,
  crc32Hex,
  ENCODING_NAIVE,
  LEXI_LAYOUT,
  READ_LAYOUT,
  TRIE_LAYOUT,
  UNKD_LAYOUT,
} from "@hdae/yomi/format";
import { FEATURE_SEP, featureKey, Interner, type LexicalEntry, parseCsv } from "./csv.ts";
import { parseCharDef, parseMatrixDef, parseUnkDef } from "./defs.ts";
import { buildLouds } from "./louds_builder.ts";
import { encodeSection, type SectionPayload, writeContainer } from "./container_writer.ts";

const NO_ACCENT = 255;

export type BuildResult = {
  file: Uint8Array<ArrayBuffer>;
  sectionSizes: Record<string, number>;
  stats: Record<string, number>;
};

export const buildDictionary = (src: {
  csv: string;
  matrixDef: string;
  charDef: string;
  unkDef: string;
  license: string;
}): BuildResult => {
  const allEntries = parseCsv(src.csv);

  // lindera 3.0.7 互換: ビルダーは表層を trim() し、空になった行を黙って捨てる
  // （builder/prefix_dictionary.rs get_field_value。Rust の trim は U+3000 も除く）。
  // naist-jdic では全角空白 U+3000 の1行のみが該当し、これにより空白は常に
  // 未知語(SYMBOL)として解析される（オラクルの「?+空白」併合挙動の根源）。
  // trim で変形する未知のケースは互換の判断がつかないので fail loudly。
  const entries = allEntries.filter((e) => {
    const trimmed = e.surface.trim();
    if (trimmed === e.surface) return true;
    if (trimmed === "") return false;
    throw new Error(`表層が trim で変形する未知ケース: ${JSON.stringify(e.surface)}`);
  });

  // ---- 検証（フォーマットのビット幅前提を黙って超えない） ----
  for (const e of entries) {
    if (e.leftId <= 0 || e.leftId >= CONTEXT_ID_DIMENSION) {
      throw new Error(`leftId 範囲外: ${e.leftId} (${e.surface})`);
    }
    if (e.rightId <= 0 || e.rightId >= CONTEXT_ID_DIMENSION) {
      throw new Error(`rightId 範囲外: ${e.rightId} (${e.surface})`);
    }
    if (e.cost < -32768 || e.cost > 32767) throw new Error(`cost i16 範囲外: ${e.surface}`);
    for (const u of e.units) {
      if (u.pron.length > 255) throw new Error(`pron 長 u8 範囲外: ${e.surface}`);
      if (u.surfLen > 255) throw new Error(`surfLen u8 範囲外: ${e.surface}`);
      if (u.accType !== null && (u.accType < 0 || u.accType >= NO_ACCENT)) {
        throw new Error(`accType u8 範囲外: ${e.surface} ${u.accType}`);
      }
    }
  }

  // ---- 表層形の集約とトライ構築 ----
  // MUST: 同一表層のエントリ列は CSV 行順のまま保持する（push 追加のみ・sort/reverse 禁止）。
  // Viterbi 同点タイブレーク（先着＝先頭行が勝つ）が jpreprocess オラクルと一致する前提
  // （src/tokenizer/lattice.ts の既知語追加コメントと対）。
  const bySurface = new Map<string, LexicalEntry[]>();
  for (const e of entries) {
    const list = bySurface.get(e.surface);
    if (list) list.push(e);
    else bySurface.set(e.surface, [e]);
  }
  const surfaces = [...bySurface.keys()].sort();
  const louds = buildLouds(surfaces);

  // ---- LEXI/READ を surfaceId 順に構築 ----
  const posInterner = new Interner();
  const chainInterner = new Interner();
  chainInterner.intern("*"); // id 0 = 規則なし（LEXI の既定値が 0 で安全側になるよう先頭に）

  const entryIndex: number[] = [0];
  const leftId: number[] = [];
  const rightId: number[] = [];
  const cost: number[] = [];
  const posId: number[] = [];
  const chainRuleId: number[] = [];
  const unitIndex: number[] = [0];
  const unitAccType: number[] = [];
  const unitSurfLen: number[] = [];
  const unitPronLen: number[] = [];
  const unitPronOffset: number[] = [];

  // 発音文字列プール（完全一致 dedup）。
  const pool: number[] = [];
  const pronOffsets = new Map<string, number>();
  const internPron = (pron: string): number => {
    const hit = pronOffsets.get(pron);
    if (hit !== undefined) return hit;
    const off = pool.length;
    for (let i = 0; i < pron.length; i++) pool.push(pron.charCodeAt(i));
    pronOffsets.set(pron, off);
    return off;
  };

  for (let sid = 0; sid < surfaces.length; sid++) {
    const surface = surfaces[louds.surfaceOrder[sid]];
    for (const e of bySurface.get(surface)!) {
      leftId.push(e.leftId);
      rightId.push(e.rightId);
      cost.push(e.cost);
      posId.push(posInterner.intern(featureKey(e.features)));
      chainRuleId.push(chainInterner.intern(e.chainRule));
      for (const u of e.units) {
        unitAccType.push(u.accType ?? NO_ACCENT);
        unitSurfLen.push(u.surfLen);
        unitPronLen.push(u.pron.length);
        unitPronOffset.push(internPron(u.pron));
      }
      unitIndex.push(unitAccType.length);
    }
    entryIndex.push(leftId.length);
  }

  if (posInterner.size > 0xffff) throw new Error(`posTable ${posInterner.size} が u16 を超えた`);
  if (chainInterner.size > 0xff) {
    throw new Error(`chainRuleTable ${chainInterner.size} が u8 を超えた`);
  }

  // ---- 文字種・未知語・連接行列 ----
  const charDef = parseCharDef(src.charDef);
  const unkRecords = parseUnkDef(src.unkDef);
  const catName2Id = new Map(charDef.categories.map((c, i) => [c.name, i]));
  // unk.def はカテゴリごとに連続していない可能性に備え、カテゴリ id 順に並べ替える。
  const unkByCat: { leftId: number; rightId: number; cost: number; posId: number }[][] = charDef
    .categories.map(() => []);
  for (const r of unkRecords) {
    const cid = catName2Id.get(r.category);
    if (cid === undefined) throw new Error(`unk.def に未知のカテゴリ: ${r.category}`);
    unkByCat[cid].push({
      leftId: r.leftId,
      rightId: r.rightId,
      cost: r.cost,
      posId: posInterner.intern(featureKey(r.features)),
    });
  }
  // MUST: 全カテゴリに未知語生成規則が1行以上あること。0 行カテゴリはランタイムの
  // unknownWordEnd 更新ガード（rTo > rFrom）を偽にし、lindera（行数に関わらず無条件前進）と
  // 静かに乖離する（docs/limitations.md の lindera 節）。naist-jdic は全カテゴリ ≥1 行を
  // 満たすため、満たさない辞書ソースへの差し替えはここで露見させる。
  unkByCat.forEach((records, cid) => {
    if (records.length === 0) {
      throw new Error(
        `unk.def にカテゴリ ${
          charDef.categories[cid].name
        } の行が無い（0行カテゴリは未知語処理が lindera と乖離する。docs/limitations.md 参照）`,
      );
    }
  });

  const unkCatIndex: number[] = [0];
  const unkLeft: number[] = [];
  const unkRight: number[] = [];
  const unkCost: number[] = [];
  const unkPosId: number[] = [];
  for (const records of unkByCat) {
    for (const r of records) {
      unkLeft.push(r.leftId);
      unkRight.push(r.rightId);
      unkCost.push(r.cost);
      unkPosId.push(r.posId);
    }
    unkCatIndex.push(unkLeft.length);
  }

  const matrix = parseMatrixDef(src.matrixDef);

  // ---- 各セクションの直列化 ----
  const trie = encodeSection(TRIE_LAYOUT, {
    nodeCount: louds.nodeCount,
    surfaceCount: louds.surfaceCount,
    lbsBitLength: louds.lbsBitLength,
    lbsWordCount: louds.lbsWords.length,
    terminalBitLength: louds.terminalBitLength,
    terminalWordCount: louds.terminalWords.length,
  }, {
    lbsWords: louds.lbsWords,
    terminalWords: louds.terminalWords,
    labels: louds.labels,
  });

  const lexi = encodeSection(LEXI_LAYOUT, {
    surfaceCount: surfaces.length,
    entryCount: leftId.length,
    unitCount: unitAccType.length,
  }, {
    entryIndex,
    unitIndex,
    unitPronOffset,
    leftId,
    rightId,
    cost,
    posId,
    chainRuleId,
    unitAccType,
    unitSurfLen,
    unitPronLen,
  });

  const read = encodeSection(READ_LAYOUT, { poolLength: pool.length }, { pool });

  const conn = encodeSection(CONN_LAYOUT, {
    rightSize: CONTEXT_ID_DIMENSION,
    leftSize: CONTEXT_ID_DIMENSION,
  }, { data: matrix });

  const catTable: number[] = [];
  for (const c of charDef.categories) catTable.push(c.invoke, c.group, c.length, 0);
  const char = encodeSection(CHAR_LAYOUT, { catCount: charDef.categories.length }, {
    catTable,
    catsPacked: charDef.catsPacked,
  });

  const unkd = encodeSection(UNKD_LAYOUT, {
    catCount: charDef.categories.length,
    recordCount: unkLeft.length,
  }, {
    catIndex: unkCatIndex,
    leftId: unkLeft,
    rightId: unkRight,
    cost: unkCost,
    posId: unkPosId,
  });

  const bodySections: SectionPayload[] = [
    { name: "TRIE", encoding: ENCODING_NAIVE, bytes: trie },
    { name: "LEXI", encoding: ENCODING_NAIVE, bytes: lexi },
    { name: "READ", encoding: ENCODING_NAIVE, bytes: read },
    { name: "CONN", encoding: ENCODING_NAIVE, bytes: conn },
    { name: "CHAR", encoding: ENCODING_NAIVE, bytes: char },
    { name: "UNKD", encoding: ENCODING_NAIVE, bytes: unkd },
  ];

  const meta = {
    dictName: "naist-jdic",
    source: { repo: "jpreprocess/naist-jdic", tag: "v0.1.3" },
    builderVersion: "0.0.1",
    buildDate: new Date().toISOString(),
    counts: {
      surfaces: surfaces.length,
      entries: leftId.length,
      units: unitAccType.length,
      poolLength: pool.length,
    },
    posTable: posInterner.values.map((v) => v.split(FEATURE_SEP)),
    chainRuleTable: chainInterner.values,
    charCategories: charDef.categories.map((c) => c.name),
    checksums: Object.fromEntries(bodySections.map((s) => [s.name, crc32Hex(s.bytes)])),
    license: src.license,
  };
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));

  const sections: SectionPayload[] = [
    { name: "META", encoding: ENCODING_NAIVE, bytes: metaBytes },
    ...bodySections,
  ];
  const file = writeContainer(sections);

  return {
    file,
    sectionSizes: Object.fromEntries(sections.map((s) => [s.name, s.bytes.length])),
    stats: {
      surfaces: surfaces.length,
      entries: leftId.length,
      units: unitAccType.length,
      trieNodes: louds.nodeCount,
      posTable: posInterner.size,
      chainRuleTable: chainInterner.size,
    },
  };
};

if (import.meta.main) {
  // repo ルートは dict-builder/src/ の2つ上。CSV は fetch_dict.ts が data/naist-jdic に配置する。
  const repoRoot = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
  const srcDir = `${repoRoot}/data/naist-jdic`;
  // 統合テストが読む既定パス（fixtures/naist-jdic.jtd）へ出力する。
  const outDir = `${repoRoot}/fixtures`;

  console.log("読み込み中...");
  const result = buildDictionary({
    csv: await Deno.readTextFile(`${srcDir}/naist-jdic.csv`),
    matrixDef: await Deno.readTextFile(`${srcDir}/matrix.def`),
    charDef: await Deno.readTextFile(`${srcDir}/char.def`),
    unkDef: await Deno.readTextFile(`${srcDir}/unk.def`),
    license: await Deno.readTextFile(`${srcDir}/COPYING`),
  });

  await Deno.mkdir(outDir, { recursive: true });
  const outPath = `${outDir}/naist-jdic.jtd`;
  await Deno.writeFile(outPath, result.file);

  console.log("stats:", result.stats);
  for (const [name, size] of Object.entries(result.sectionSizes)) {
    console.log(`  ${name}: ${size.toLocaleString()} B`);
  }
  console.log(`total: ${result.file.length.toLocaleString()} B -> ${outPath}`);
}
