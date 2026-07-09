// g2p ドメインの型定義（値・実装から分離）。
// これらを最下層に置くことで result.ts ↔ phonemes.ts の循環を構造的に断つ。

import type { NjdNode } from "../njd/types.ts";

/** 1モーラ分の読み・音素・無声化。アクセント句を構成する最小単位。 */
export type Mora = {
  /** カタカナ1モーラ（拗音は1モーラ）。 */
  kana: string;
  /** 音素（例 "ky"）。母音のみのモーラは undefined。 */
  consonant?: string;
  /** "a|i|u|e|o|N|cl" ほか。長音は直前モーラの母音を引き継ぐ。 */
  vowel: string;
  /** 母音無声化。 */
  devoiced?: boolean;
};

/** アクセント句（1つのピッチ核を持つモーラ列と、句末のポーズ）。 */
export type AccentPhrase = {
  /** 句を構成するモーラ列。 */
  moras: Mora[];
  /** 1-origin。0 = 平板（核なし）。 */
  accentNucleus: number;
  /** 句末のポーズ長。読点=short / 句点・文末=long。 */
  pauseAfter: "none" | "short" | "long";
};

/** フロントエンドの最終出力（正規化テキストとアクセント句列）。 */
export type FrontendResult = {
  /** 解析に用いた正規化済みテキスト。 */
  normalizedText: string;
  /** アクセント句の列。 */
  accentPhrases: AccentPhrase[];
};

/** アクセント句内の1語（実モーラを持つ NJD ノードと、句内文脈で解決済みのモーラ列）。 */
export type PhraseWord = {
  /** 元の NJD ノード（表層・品詞・語アクセント等の参照用）。 */
  node: NjdNode;
  /** この語が生むモーラ列（長音の直前母音を句内で解決済み）。 */
  moras: Mora[];
};

/**
 * 句セグメンテーションの1句。buildResult / wordPhoneAlignment が共有する
 * 中間表現で、「句の区切り・核・ポーズ」の決定はここに一元化される。
 */
export type PhraseSegment = {
  /** 句を構成する語の列（ノード順）。 */
  words: PhraseWord[];
  /** 1-origin。0 = 平板（核なし）。句先頭ノードの語アクセント。 */
  accentNucleus: number;
  /** 句末のポーズ長。読点=short / 句点・文末=long。 */
  pauseAfter: "none" | "short" | "long";
};

/** 語アライメントの1要素（1 NJD ノード、または句読点1個）。 */
export type WordPhones = {
  /** 語の表層（NJD ノード表層）、または句読点記号（","/"."）。 */
  surface: string;
  /** その語が生む音素列（両端 "_" は含まない）。 */
  phones: string[];
};
