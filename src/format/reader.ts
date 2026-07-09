// JTD1 コンテナの低レベル読み手: ヘッダ検証とセクションのゼロコピー切り出し。
// レイアウトの正は docs/jtd1-format.md。書き手は dict-builder/src/container_writer.ts。
//
// MUST: ここでは一切コピーしない。呼び出し側が TypedArray ビューを作れるよう
// (buffer, byteOffset, length) を返すだけに徹する。

import {
  FORMAT_VERSION,
  HEADER_BYTES,
  MAGIC,
  SECTION_ALIGN,
  SECTION_ENTRY_BYTES,
} from "./constants.ts";
import type { SectionView } from "./types.ts";

/** JTD1 バイナリを受け取り、ヘッダ検証済みのセクション表を保持する低レベル読み手。 */
export class JtdContainer {
  /** 保持している JTD1 全体のバッファ。 */
  readonly buffer: ArrayBuffer;
  private readonly sections: Map<string, SectionView>;

  /** ヘッダ（magic/formatVersion）とセクション境界を検証して構築する（破損は throw）。 */
  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    const dv = new DataView(buffer);
    if (buffer.byteLength < HEADER_BYTES) throw new Error("JTD1: ヘッダが短すぎる");
    if (dv.getUint32(0, true) !== MAGIC) throw new Error("JTD1: magic 不一致");
    const version = dv.getUint32(4, true);
    if (version !== FORMAT_VERSION) {
      // 未リリース方針: マイグレーションせず fail loudly（CLAUDE.md）。
      throw new Error(`JTD1: formatVersion ${version} は非対応（期待: ${FORMAT_VERSION}）`);
    }
    const sectionCount = dv.getUint32(8, true);
    // 破損ヘッダの過大な sectionCount で生 RangeError に落ちる前に、表全体が収まるか検証する。
    if (HEADER_BYTES + sectionCount * SECTION_ENTRY_BYTES > buffer.byteLength) {
      throw new Error(`JTD1: sectionCount ${sectionCount} がファイルサイズに対して過大`);
    }

    this.sections = new Map();
    for (let i = 0; i < sectionCount; i++) {
      const base = HEADER_BYTES + i * SECTION_ENTRY_BYTES;
      const name = String.fromCharCode(
        dv.getUint8(base),
        dv.getUint8(base + 1),
        dv.getUint8(base + 2),
        dv.getUint8(base + 3),
      );
      const encoding = dv.getUint32(base + 4, true);
      const offset = dv.getUint32(base + 8, true);
      const length = dv.getUint32(base + 12, true);
      if (offset % SECTION_ALIGN !== 0) {
        throw new Error(`JTD1: セクション ${name} が ${SECTION_ALIGN}B 境界にない`);
      }
      if (offset + length > buffer.byteLength) {
        throw new Error(`JTD1: セクション ${name} がファイル末尾を超える`);
      }
      this.sections.set(name, { encoding, offset, length });
    }
  }

  /** セクションを取得。無ければ throw（黙って劣化しない）。 */
  section(name: string): SectionView {
    const s = this.sections.get(name);
    if (!s) throw new Error(`JTD1: セクション ${name} が存在しない`);
    return s;
  }

  /** セクションが存在するか。 */
  has(name: string): boolean {
    return this.sections.has(name);
  }
}
