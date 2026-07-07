// JTD1 コンテナ → ランタイム辞書オブジェクト（全列ゼロコピー参照）。
//
// ここは「ビューの組み立て」だけを行う。検索・ラティスはそれぞれ louds.ts /
// lattice.ts の責務（1モジュール1責務）。

import { BitVector } from "./bits.ts";
import { LoudsTrie } from "./louds.ts";
import { JtdContainer } from "./format/reader.ts";
import {
  CHAR_LAYOUT,
  CONN_LAYOUT,
  decodeSection,
  LEXI_LAYOUT,
  READ_LAYOUT,
  TRIE_LAYOUT,
  UNKD_LAYOUT,
} from "./format/layout.ts";
import { crc32Hex } from "./format/crc32.ts";

export type DictMeta = {
  dictName: string;
  source: { repo: string; tag: string };
  builderVersion: string;
  buildDate: string;
  counts: Record<string, number>;
  /** posId → [品詞, 細分類1, 細分類2, 細分類3, 活用型, 活用形] */
  posTable: string[][];
  /** chainRuleId → 結合規則文字列（"*" = なし） */
  chainRuleTable: string[];
  charCategories: string[];
  checksums: Record<string, string>;
  license: string;
};

export type CharCategoryInfo = {
  name: string;
  invoke: boolean;
  group: boolean;
  length: number;
};

export class JtdDictionary {
  readonly trie: LoudsTrie;
  // LEXI（surfaceId → エントリ範囲 → ユニット範囲）
  readonly entryIndex: Uint32Array;
  readonly unitIndex: Uint32Array;
  readonly leftId: Uint16Array;
  readonly rightId: Uint16Array;
  readonly cost: Int16Array;
  readonly posId: Uint16Array;
  readonly chainRuleId: Uint8Array;
  readonly unitAccType: Uint8Array;
  readonly unitSurfLen: Uint8Array;
  readonly unitPronLen: Uint8Array;
  readonly unitPronOffset: Uint32Array;
  readonly readPool: Uint16Array;
  // CONN
  private readonly connData: Int16Array;
  private readonly connLeftSize: number;
  // CHAR
  readonly charCategories: CharCategoryInfo[];
  /** BMP コードポイント → 順序付きカテゴリ列（nibble×4、catId+1、0=終端）。 */
  readonly charCatsPacked: Uint16Array;
  /** DEFAULT カテゴリの id（非BMP文字のフォールバック）。 */
  readonly defaultCategoryId: number;
  // UNKD
  readonly unkCatIndex: Uint32Array;
  readonly unkLeftId: Uint16Array;
  readonly unkRightId: Uint16Array;
  readonly unkCost: Int16Array;
  readonly unkPosId: Uint16Array;

  readonly meta: DictMeta;

  private constructor(fields: {
    trie: LoudsTrie;
    lexi: Record<string, Uint32Array | Uint16Array | Int16Array | Uint8Array>;
    readPool: Uint16Array;
    connData: Int16Array;
    connLeftSize: number;
    charCategories: CharCategoryInfo[];
    charCatsPacked: Uint16Array;
    unk: Record<string, Uint32Array | Uint16Array | Int16Array | Uint8Array>;
    meta: DictMeta;
  }) {
    this.trie = fields.trie;
    this.entryIndex = fields.lexi.entryIndex as Uint32Array;
    this.unitIndex = fields.lexi.unitIndex as Uint32Array;
    this.leftId = fields.lexi.leftId as Uint16Array;
    this.rightId = fields.lexi.rightId as Uint16Array;
    this.cost = fields.lexi.cost as Int16Array;
    this.posId = fields.lexi.posId as Uint16Array;
    this.chainRuleId = fields.lexi.chainRuleId as Uint8Array;
    this.unitAccType = fields.lexi.unitAccType as Uint8Array;
    this.unitSurfLen = fields.lexi.unitSurfLen as Uint8Array;
    this.unitPronLen = fields.lexi.unitPronLen as Uint8Array;
    this.unitPronOffset = fields.lexi.unitPronOffset as Uint32Array;
    this.readPool = fields.readPool;
    this.connData = fields.connData;
    this.connLeftSize = fields.connLeftSize;
    this.charCategories = fields.charCategories;
    this.charCatsPacked = fields.charCatsPacked;
    const def = fields.charCategories.findIndex((c) => c.name === "DEFAULT");
    if (def < 0) throw new Error("DEFAULT カテゴリが辞書にない");
    this.defaultCategoryId = def;
    this.unkCatIndex = fields.unk.catIndex as Uint32Array;
    this.unkLeftId = fields.unk.leftId as Uint16Array;
    this.unkRightId = fields.unk.rightId as Uint16Array;
    this.unkCost = fields.unk.cost as Int16Array;
    this.unkPosId = fields.unk.posId as Uint16Array;
    this.meta = fields.meta;
  }

  /**
   * ArrayBuffer からロードする。verifyChecksums は既定 true（破損を黙って通さない）。
   * 19MB 辞書の CRC 検証は数百ms かかるため、信頼できるキャッシュからの再ロード等
   * では false にできる。
   */
  static load(buf: ArrayBuffer, opts?: { verifyChecksums?: boolean }): JtdDictionary {
    const c = new JtdContainer(buf);

    const metaSec = c.section("META");
    const meta = JSON.parse(
      new TextDecoder().decode(new Uint8Array(buf, metaSec.offset, metaSec.length)),
    ) as DictMeta;

    if (opts?.verifyChecksums !== false) {
      for (const [name, expected] of Object.entries(meta.checksums)) {
        const s = c.section(name);
        const actual = crc32Hex(new Uint8Array(buf, s.offset, s.length));
        if (actual !== expected) {
          throw new Error(`セクション ${name} のCRC不一致: ${actual} != ${expected}`);
        }
      }
    }

    const trieSec = c.section("TRIE");
    const t = decodeSection(buf, trieSec.offset, trieSec.length, TRIE_LAYOUT);
    const trie = new LoudsTrie(
      new BitVector(t.arrays.lbsWords as Uint32Array, t.scalars.lbsBitLength),
      t.arrays.labels as Uint16Array,
      new BitVector(t.arrays.terminalWords as Uint32Array, t.scalars.terminalBitLength),
      t.scalars.nodeCount,
      t.scalars.surfaceCount,
    );

    const lexiSec = c.section("LEXI");
    const lexi = decodeSection(buf, lexiSec.offset, lexiSec.length, LEXI_LAYOUT);

    const readSec = c.section("READ");
    const read = decodeSection(buf, readSec.offset, readSec.length, READ_LAYOUT);

    const connSec = c.section("CONN");
    const conn = decodeSection(buf, connSec.offset, connSec.length, CONN_LAYOUT);

    const charSec = c.section("CHAR");
    const char = decodeSection(buf, charSec.offset, charSec.length, CHAR_LAYOUT);
    const catTable = char.arrays.catTable as Uint8Array;
    const charCategories: CharCategoryInfo[] = meta.charCategories.map((name, i) => ({
      name,
      invoke: catTable[i * 4] === 1,
      group: catTable[i * 4 + 1] === 1,
      length: catTable[i * 4 + 2],
    }));

    const unkSec = c.section("UNKD");
    const unk = decodeSection(buf, unkSec.offset, unkSec.length, UNKD_LAYOUT);

    return new JtdDictionary({
      trie,
      lexi: lexi.arrays,
      readPool: read.arrays.pool as Uint16Array,
      connData: conn.arrays.data as Int16Array,
      connLeftSize: conn.scalars.leftSize,
      charCategories,
      charCatsPacked: char.arrays.catsPacked as Uint16Array,
      unk: unk.arrays,
      meta,
    });
  }

  /** 連接コスト: 前語の rightId × 次語の leftId。 */
  connectionCost(prevRightId: number, nextLeftId: number): number {
    return this.connData[prevRightId * this.connLeftSize + nextLeftId];
  }

  /**
   * ユニットの発音形を materialize する（ホットパス外で使う）。
   * 辞書の発音列には母音無声化マーク U+2019 ’ が埋め込まれている（例: デス’）。
   * 公開する発音形はカタカナ列とし、マークは除去する。無声化フラグとしての利用は
   * Phase 2 のモーラ化で unitPronRaw 相当から行う。
   */
  unitPron(unitIdx: number): string {
    const off = this.unitPronOffset[unitIdx];
    const len = this.unitPronLen[unitIdx];
    let s = "";
    for (let i = 0; i < len; i++) {
      const c = this.readPool[off + i];
      if (c === 0x2019) continue;
      s += String.fromCharCode(c);
    }
    return s;
  }

  /** 無声化マーク ’ を含む生の発音列（NJD 後段のモーラ化が使う）。 */
  unitPronRaw(unitIdx: number): string {
    const off = this.unitPronOffset[unitIdx];
    const len = this.unitPronLen[unitIdx];
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(this.readPool[off + i]);
    return s;
  }

  /**
   * コードポイントの順序付きカテゴリ列を out に書き、個数を返す（割り当て回避）。
   * 非BMP は char.def で表現できないため [DEFAULT]（lindera と同挙動）。
   */
  charCategoriesOf(codePoint: number, out: number[]): number {
    if (codePoint > 0xffff) {
      out[0] = this.defaultCategoryId;
      return 1;
    }
    const packed = this.charCatsPacked[codePoint];
    let n = 0;
    for (let s = 0; s < 16; s += 4) {
      const v = (packed >> s) & 0xf;
      if (v === 0) break;
      out[n++] = v - 1;
    }
    return n;
  }
}
