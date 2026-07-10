// 型境界の構造検証（JSON 由来の unknown 入力 → 型付き値）。
//
// 対象はコールドパスの2境界のみ: META セクション（JtdDictionary.load）と
// 修正辞書 JSON（loadOverlay）。ホットパスでは使わない。
// 実行時依存ゼロ（MUST）のため Zod ではなく手書き。未知キーは無視する
// （必須キーの欠落・型違いのみ throw = 書き手側の将来拡張を阻害しない）。
// 意味検証（accentType の範囲・surface の正規化等）は resolveEntry 側の責務で、
// ここは構造（型の形）だけを見る。

import type { DictMeta, OverlayEntry } from "./types.ts";

/** 検証失敗を「path は X であること（実際: Y）」形式で throw する。 */
const fail = (ctx: string, path: string, expected: string, v: unknown): never => {
  const actual = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  throw new Error(`${ctx} 検証失敗: ${path} は ${expected} であること（実際: ${actual}）`);
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const record = (ctx: string, v: unknown, path: string): Record<string, unknown> =>
  isRecord(v) ? v : fail(ctx, path, "オブジェクト", v);

const str = (ctx: string, v: unknown, path: string): string =>
  typeof v === "string" ? v : fail(ctx, path, "string", v);

// Number.isInteger は NaN / Infinity / 小数 / 数値以外をまとめて弾く。
const int = (ctx: string, v: unknown, path: string): number =>
  typeof v === "number" && Number.isInteger(v) ? v : fail(ctx, path, "整数", v);

const strArray = (ctx: string, v: unknown, path: string): string[] =>
  Array.isArray(v) ? v.map((x, i) => str(ctx, x, `${path}[${i}]`)) : fail(ctx, path, "配列", v);

/** 値が全て同型の Record を検証する。 */
const recordOf = <T>(
  ctx: string,
  v: unknown,
  path: string,
  elem: (v: unknown, path: string) => T,
): Record<string, T> => {
  const rec = record(ctx, v, path);
  const out: Record<string, T> = {};
  for (const [k, val] of Object.entries(rec)) out[k] = elem(val, `${path}.${k}`);
  return out;
};

// ランタイムが読む全セクション。checksums にこの全キーが無いと、該当セクションの
// CRC 検証が黙って抜ける（= 破損を検知できない）ため欠落を throw する。META 自身は
// 自己参照になるため対象外。
const REQUIRED_CHECKSUM_SECTIONS = ["CHAR", "CONN", "LEXI", "READ", "TRIE", "UNKD"] as const;

// posTable 1行の列数（品詞, 細分類1..3, 活用型, 活用形）。NJD の品詞述語が位置で参照する
// ため、列数が欠けると undefined 比較で黙って規則が外れる。
const POS_ROW_COLUMNS = 6;

/**
 * META セクションの JSON デコード結果を構造検証して `DictMeta` にする。
 * 必須キーの欠落・型違い・posTable の列数不足・checksums のセクション欠落は throw（fail loud）。
 */
export const validateDictMeta = (v: unknown): DictMeta => {
  const ctx = "META";
  const m = record(ctx, v, "(root)");
  const src = record(ctx, m.source, "source");

  const posTable = Array.isArray(m.posTable)
    ? m.posTable.map((row, i) => {
      const cols = strArray(ctx, row, `posTable[${i}]`);
      if (cols.length !== POS_ROW_COLUMNS) {
        throw new Error(
          `${ctx} 検証失敗: posTable[${i}] は ${POS_ROW_COLUMNS} 列であること（実際: ${cols.length} 列）`,
        );
      }
      return cols;
    })
    : fail(ctx, "posTable", "配列", m.posTable);

  const checksums = recordOf(ctx, m.checksums, "checksums", (x, p) => str(ctx, x, p));
  for (const name of REQUIRED_CHECKSUM_SECTIONS) {
    if (checksums[name] === undefined) {
      throw new Error(`${ctx} 検証失敗: checksums に ${name} が無い（CRC 検証が黙って抜ける）`);
    }
  }

  return {
    dictName: str(ctx, m.dictName, "dictName"),
    source: { repo: str(ctx, src.repo, "source.repo"), tag: str(ctx, src.tag, "source.tag") },
    builderVersion: str(ctx, m.builderVersion, "builderVersion"),
    buildDate: str(ctx, m.buildDate, "buildDate"),
    counts: recordOf(ctx, m.counts, "counts", (x, p) => int(ctx, x, p)),
    posTable,
    chainRuleTable: strArray(ctx, m.chainRuleTable, "chainRuleTable"),
    charCategories: strArray(ctx, m.charCategories, "charCategories"),
    checksums,
    license: str(ctx, m.license, "license"),
  };
};

/**
 * 修正辞書 JSON のデコード結果を構造検証して `OverlayEntry[]` にする。
 * 型違いは throw（fail loud）。特に cost / accentType の非整数は、通すとラティスの
 * コスト演算を黙って汚染する（文字列連結・NaN 伝播）ためここで止める。
 */
export const validateOverlayEntries = (v: unknown): OverlayEntry[] => {
  const ctx = "overlay";
  if (!Array.isArray(v)) return fail(ctx, "(root)", "エントリ配列", v);
  return v.map((e, i) => {
    const rec = record(ctx, e, `[${i}]`);
    const out: OverlayEntry = {
      surface: str(ctx, rec.surface, `[${i}].surface`),
      reading: str(ctx, rec.reading, `[${i}].reading`),
      accentType: int(ctx, rec.accentType, `[${i}].accentType`),
    };
    if (rec.accentConnRule !== undefined) {
      out.accentConnRule = str(ctx, rec.accentConnRule, `[${i}].accentConnRule`);
    }
    if (rec.pos !== undefined) out.pos = strArray(ctx, rec.pos, `[${i}].pos`);
    if (rec.cost !== undefined) out.cost = int(ctx, rec.cost, `[${i}].cost`);
    return out;
  });
};
