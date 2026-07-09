/**
 * `@hdae/yomi/g2p` — 中立 G2P 出力（読み・アクセント句）と音素・トーン建材。
 *
 * NJD ノード列を `FrontendResult`（アクセント句列）へまとめる `buildResult` と、
 * モデル非依存の建材（`moraToPhones` / `moraTones` / `pausePunct` /
 * `wordPhoneAlignment`）。モデル固有の音素・トーン梱包は呼び出し側で組む
 * （docs/decisions/0001）。
 *
 * @module
 */

export * from "./types.ts";
export * from "./phonemes.ts";
export * from "./tones.ts";
export * from "./result.ts";
export * from "./word_alignment.ts";
