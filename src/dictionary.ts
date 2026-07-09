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

/** JTD1 辞書のメタデータ（META セクションを JSON デコードしたもの）。 */
export type DictMeta = {
  /** 辞書名。 */
  dictName: string;
  /** 辞書のビルド元（リポジトリ・タグ）。 */
  source: { repo: string; tag: string };
  /** 辞書をビルドした dict-builder のバージョン。 */
  builderVersion: string;
  /** ビルド日時。 */
  buildDate: string;
  /** 各種要素数の集計（surfaceCount 等）。 */
  counts: Record<string, number>;
  /** posId → [品詞, 細分類1, 細分類2, 細分類3, 活用型, 活用形] */
  posTable: string[][];
  /** chainRuleId → 結合規則文字列（"*" = なし） */
  chainRuleTable: string[];
  /** 文字カテゴリ名の一覧（CHAR セクションの catTable と対応する順序）。 */
  charCategories: string[];
  /** セクション名 → CRC32 チェックサム（16進）。load() の破損検証に使う。 */
  checksums: Record<string, string>;
  /** 辞書データのライセンス表記。 */
  license: string;
};

/** 文字カテゴリ1件の定義（char.def 準拠）。 */
export type CharCategoryInfo = {
  /** カテゴリ名。 */
  name: string;
  /** true なら既知語があっても常に未知語処理を起動する。 */
  invoke: boolean;
  /** true なら同カテゴリの連続文字を1語にまとめる候補を出す。 */
  group: boolean;
  /** 生成する未知語候補の文字数（0 = 生成しない）。 */
  length: number;
};

/** JTD1 コンテナから読み込んだランタイム辞書オブジェクト（全列ゼロコピー参照）。 */
export class JtdDictionary {
  /** 表層形 → surfaceId を引く LOUDS トライ。 */
  readonly trie: LoudsTrie;
  // LEXI（surfaceId → エントリ範囲 → ユニット範囲）
  /** surfaceId → エントリ範囲 [entryIndex[i], entryIndex[i+1]) の開始位置索引（長さ surfaceCount+1）。 */
  readonly entryIndex: Uint32Array;
  /** エントリ index → ユニット範囲 [unitIndex[i], unitIndex[i+1]) の開始位置索引（長さ entryCount+1）。 */
  readonly unitIndex: Uint32Array;
  /** エントリごとの左文脈ID。 */
  readonly leftId: Uint16Array;
  /** エントリごとの右文脈ID。 */
  readonly rightId: Uint16Array;
  /** エントリごとの単語コスト。 */
  readonly cost: Int16Array;
  /** エントリごとの品詞ID（meta.posTable の index）。 */
  readonly posId: Uint16Array;
  /** エントリごとの活用連鎖規則ID（meta.chainRuleTable の index）。 */
  readonly chainRuleId: Uint8Array;
  /** ユニットごとのアクセント型（未指定は 255）。 */
  readonly unitAccType: Uint8Array;
  /** ユニットごとの表層形の文字数。 */
  readonly unitSurfLen: Uint8Array;
  /** ユニットごとの発音の文字数。 */
  readonly unitPronLen: Uint8Array;
  /** ユニットごとの発音の readPool 内オフセット。 */
  readonly unitPronOffset: Uint32Array;
  /** 発音コードポイントの共有プール（unitPron/unitPronRaw が参照）。 */
  readonly readPool: Uint16Array;
  // CONN
  private readonly connData: Int16Array;
  private readonly connLeftSize: number;
  // CHAR
  /** 文字カテゴリ定義の一覧（char.def 順）。 */
  readonly charCategories: CharCategoryInfo[];
  /** BMP コードポイント → 順序付きカテゴリ列（nibble×4、catId+1、0=終端）。 */
  readonly charCatsPacked: Uint16Array;
  /** DEFAULT カテゴリの id（非BMP文字のフォールバック）。 */
  readonly defaultCategoryId: number;
  // UNKD
  /** カテゴリID → 未知語生成規則の範囲 [unkCatIndex[i], unkCatIndex[i+1]) の開始位置索引（長さ catCount+1）。 */
  readonly unkCatIndex: Uint32Array;
  /** 未知語生成規則ごとの左文脈ID。 */
  readonly unkLeftId: Uint16Array;
  /** 未知語生成規則ごとの右文脈ID。 */
  readonly unkRightId: Uint16Array;
  /** 未知語生成規則ごとの単語コスト。 */
  readonly unkCost: Int16Array;
  /** 未知語生成規則ごとの品詞ID（meta.posTable の index）。 */
  readonly unkPosId: Uint16Array;

  /** 辞書のメタデータ。 */
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
