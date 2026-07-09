// JTD1 コンテナの書き手: セクション列 → 1つの Uint8Array。
// セクション内レイアウトは frontend の computeLayout を共有する（オフセット計算の
// 二重実装禁止）。読み手は packages/frontend/src/format/reader.ts + layout.ts。

import {
  computeLayout,
  FORMAT_VERSION,
  fourCC,
  HEADER_BYTES,
  MAGIC,
  SECTION_ALIGN,
  SECTION_ENTRY_BYTES,
  type SectionLayout,
} from "@hdae/yomi/format";

export type SectionPayload = {
  name: string; // 4cc
  encoding: number;
  bytes: Uint8Array;
};

/** レイアウト定義に従ってセクションペイロードを直列化する。 */
export const encodeSection = (
  layout: SectionLayout,
  scalars: Record<string, number>,
  arrays: Record<string, ArrayLike<number>>,
): Uint8Array<ArrayBuffer> => {
  const plan = computeLayout(layout, scalars);
  const out = new Uint8Array(plan.totalBytes);
  const dv = new DataView(out.buffer);

  layout.header.forEach((name, i) => {
    const v = scalars[name];
    if (v < 0 || v > 0xffffffff) throw new Error(`スカラ ${name} が u32 範囲外: ${v}`);
    dv.setUint32(i * 4, v, true);
  });

  for (const f of plan.fields) {
    const src = arrays[f.name];
    if (!src) throw new Error(`配列 ${f.name} が未指定`);
    if (src.length !== f.elemCount) {
      throw new Error(`配列 ${f.name} の長さ ${src.length} != レイアウト要求 ${f.elemCount}`);
    }
    switch (f.type) {
      case "u32":
        new Uint32Array(out.buffer, f.byteOffset, f.elemCount).set(src);
        break;
      case "u16":
        new Uint16Array(out.buffer, f.byteOffset, f.elemCount).set(src);
        break;
      case "i16":
        new Int16Array(out.buffer, f.byteOffset, f.elemCount).set(src);
        break;
      case "u8":
        new Uint8Array(out.buffer, f.byteOffset, f.elemCount).set(src);
        break;
    }
  }
  return out;
};

/** コンテナ全体（ヘッダ＋セクションテーブル＋8Bアラインの各ペイロード）を書く。 */
export const writeContainer = (
  sections: readonly SectionPayload[],
): Uint8Array<ArrayBuffer> => {
  const tableBytes = HEADER_BYTES + sections.length * SECTION_ENTRY_BYTES;
  const align = (n: number) => Math.ceil(n / SECTION_ALIGN) * SECTION_ALIGN;

  let cursor = align(tableBytes);
  const offsets: number[] = [];
  for (const s of sections) {
    offsets.push(cursor);
    cursor = align(cursor + s.bytes.length);
  }

  const out = new Uint8Array(cursor);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, FORMAT_VERSION, true);
  dv.setUint32(8, sections.length, true);
  dv.setUint32(12, 0, true); // reserved

  sections.forEach((s, i) => {
    const base = HEADER_BYTES + i * SECTION_ENTRY_BYTES;
    dv.setUint32(base, fourCC(s.name), true);
    dv.setUint32(base + 4, s.encoding, true);
    dv.setUint32(base + 8, offsets[i], true);
    dv.setUint32(base + 12, s.bytes.length, true);
    out.set(s.bytes, offsets[i]);
  });

  return out;
};
