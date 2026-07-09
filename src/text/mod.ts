/**
 * `@hdae/yomi/text` — テキスト正規化とモーラ分割の言語プリミティブ。
 *
 * `normalizeForDict`（jpreprocess `normalize_text_for_naist_jdic` 相当）と、
 * カナ列 → モーラ列への分割（jpreprocess `pronunciation::parse_mora_str` 相当）。
 * 辞書・トークナイザ・NJD 後段が共有する下位建材。
 *
 * @module
 */

export * from "./types.ts";
export * from "./normalize.ts";
export * from "./mora_table.ts";
