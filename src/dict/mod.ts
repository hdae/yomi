/**
 * `@hdae/yomi/dict` — ランタイム辞書オブジェクトと修正辞書オーバーレイ。
 *
 * JTD1 コンテナから読み込んだ `JtdDictionary`（jpreprocess `Dictionary` 相当）と、
 * 誤読を差し替える `OverlayDictionary`（jpreprocess `UserDictionary` 相当）。
 * JTD1 バイナリの低レベルコーデックは `@hdae/yomi/format`。
 *
 * @module
 */

export * from "./types.ts";
export * from "./dictionary.ts";
export * from "./overlay.ts";
