// char.def / unk.def / matrix.def のパーサ。
// フォーマットは MeCab 由来（naist-jdic v0.1.3 同梱の実ファイルで確認済み）。

import { CONTEXT_ID_DIMENSION } from "@hdae/yomi";

export type CharCategory = {
  name: string;
  invoke: 0 | 1; // 1 = 既知語があっても常に未知語処理を起動
  group: 0 | 1; // 1 = 同カテゴリ連続文字を1語に束ねる候補を出す
  length: number; // 1..n 文字の未知語候補を出す（0 = 出さない）
};

export type CharDef = {
  categories: CharCategory[];
  /**
   * BMP コードポイント → 順序付きカテゴリ列（nibble×4、値は catId+1、0=終端）。
   * 順序 = char.def の範囲行出現順に重複排除で連結（lindera lookup_categories と同一）。
   * どの範囲にも入らない文字は [DEFAULT]。
   */
  catsPacked: Uint16Array;
};

export const parseCharDef = (text: string): CharDef => {
  const categories: CharCategory[] = [];
  const catId = new Map<string, number>();
  const mappings: { from: number; to: number; catIds: number[] }[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line.length === 0) continue;
    const fields = line.split(/\s+/);
    if (fields[0].startsWith("0x")) {
      // コードポイントマッピング: 0xXXXX[..0xYYYY] CAT [CAT2 ...]
      const range = fields[0].split("..");
      const from = parseInt(range[0], 16);
      const to = range.length === 2 ? parseInt(range[1], 16) : from;
      if (!(from <= to && to <= 0xffff)) throw new Error(`範囲が不正: ${fields[0]}`);
      const catIds = fields.slice(1).map((c) => {
        const id = catId.get(c);
        // MUST: カテゴリ定義行が範囲行より先に全て現れる前提（lindera の
        // id 割当は初出順で、naist-jdic はこの前提を満たす）。崩れたら fail loudly。
        if (id === undefined) throw new Error(`範囲行が未定義カテゴリを参照: ${c}`);
        return id;
      });
      mappings.push({ from, to, catIds });
    } else {
      // カテゴリ定義: NAME INVOKE GROUP LENGTH
      if (fields.length !== 4) throw new Error(`カテゴリ定義が4要素でない: ${line}`);
      const [name, invoke, group, length] = fields;
      if (catId.has(name)) throw new Error(`カテゴリ重複: ${name}`);
      catId.set(name, categories.length);
      categories.push({
        name,
        invoke: Number(invoke) as 0 | 1,
        group: Number(group) as 0 | 1,
        length: Number(length),
      });
    }
  }

  if (categories.length > 15) {
    // nibble (catId+1 ≦ 15) の前提。naist-jdic は 11 カテゴリ。
    throw new Error(`カテゴリ数 ${categories.length} が15を超える（nibble パックの前提が崩れる）`);
  }
  const defaultId = catId.get("DEFAULT");
  if (defaultId === undefined) throw new Error("DEFAULT カテゴリがない");

  const catsPacked = new Uint16Array(0x10000);
  for (const m of mappings) {
    for (let cp = m.from; cp <= m.to; cp++) {
      let packed = catsPacked[cp];
      for (const id of m.catIds) {
        // 既に含まれていれば追加しない（出現順・重複排除）。
        let present = false;
        let count = 0;
        for (let s = 0; s < 16; s += 4) {
          const v = (packed >> s) & 0xf;
          if (v === 0) break;
          count++;
          if (v === id + 1) present = true;
        }
        if (present) continue;
        if (count >= 4) throw new Error(`カテゴリ数>4: U+${cp.toString(16)}`);
        packed |= (id + 1) << (count * 4);
      }
      catsPacked[cp] = packed;
    }
  }
  for (let cp = 0; cp < 0x10000; cp++) {
    if (catsPacked[cp] === 0) catsPacked[cp] = defaultId + 1;
  }
  return { categories, catsPacked };
};

export type UnkRecord = {
  category: string;
  leftId: number;
  rightId: number;
  cost: number;
  features: readonly [string, string, string, string, string, string];
};

/** unk.def: category,leftId,rightId,cost,品詞4,活用型,活用形,原形(*) の11列。 */
export const parseUnkDef = (text: string): UnkRecord[] => {
  const records: UnkRecord[] = [];
  for (const line of text.split("\n")) {
    if (line.length === 0) continue;
    const f = line.split(",");
    if (f.length !== 11) throw new Error(`unk.def の列数が11でない: ${line}`);
    records.push({
      category: f[0],
      leftId: Number(f[1]),
      rightId: Number(f[2]),
      cost: Number(f[3]),
      features: [f[4], f[5], f[6], f[7], f[8], f[9]],
    });
  }
  return records;
};

/** matrix.def: ヘッダ "R L" の後、"rightId leftId cost" 行。 */
export const parseMatrixDef = (text: string): Int16Array => {
  const nl = text.indexOf("\n");
  const header = text.slice(0, nl).trim().split(/\s+/);
  const rightSize = Number(header[0]);
  const leftSize = Number(header[1]);
  if (rightSize !== CONTEXT_ID_DIMENSION || leftSize !== CONTEXT_ID_DIMENSION) {
    throw new Error(`matrix 次元 ${rightSize}x${leftSize} が想定 ${CONTEXT_ID_DIMENSION} と違う`);
  }
  const data = new Int16Array(rightSize * leftSize);
  const seen = new Uint8Array(rightSize * leftSize);

  // 1,896,129 行を split(",") せず手書きスキャンで読む（ビルド時間短縮）。
  let i = nl + 1;
  const n = text.length;
  const readInt = (): number => {
    while (i < n && text.charCodeAt(i) === 32) i++;
    let neg = false;
    if (text.charCodeAt(i) === 45 /* - */) {
      neg = true;
      i++;
    }
    let v = 0;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c < 48 || c > 57) break;
      v = v * 10 + (c - 48);
      i++;
    }
    return neg ? -v : v;
  };
  while (i < n) {
    if (text.charCodeAt(i) === 10) {
      i++;
      continue;
    }
    const r = readInt();
    const l = readInt();
    const cost = readInt();
    if (r >= rightSize || l >= leftSize) throw new Error(`matrix ID が範囲外: ${r} ${l}`);
    if (cost < -32768 || cost > 32767) throw new Error(`matrix コストが i16 範囲外: ${cost}`);
    data[r * leftSize + l] = cost;
    seen[r * leftSize + l] = 1;
    while (i < n && text.charCodeAt(i) !== 10) i++;
  }
  // 欠けセルは黙って 0 にしない（fail loudly）。
  for (let k = 0; k < seen.length; k++) {
    if (seen[k] === 0) {
      throw new Error(`matrix セル欠落: rightId=${(k / leftSize) | 0} leftId=${k % leftSize}`);
    }
  }
  return data;
};
