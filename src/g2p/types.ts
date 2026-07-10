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

/**
 * 記号1文字とその正規形句読点の対。
 * surface は正規化後テキスト上の生の1文字（例 "！"）、punct は中立の正規形
 * （"!" / "?" / "…" / "," / "." / "'" / "-" のいずれか。punctuationMarks 参照）。
 */
export type PunctuationMark = {
  /** 正規化後の生の記号1文字（例 "！"）。 */
  surface: string;
  /** 正規形句読点（例 "!"）。 */
  punct: string;
};

/** アクセント句（1つのピッチ核を持つモーラ列と、句末のポーズ・実在記号）。 */
export type AccentPhrase = {
  /** 句を構成するモーラ列。 */
  moras: Mora[];
  /** 1-origin。0 = 平板（核なし）。 */
  accentNucleus: number;
  /**
   * 句末のポーズ長。品詞（読点=short / 句点=long）ベースの導出値で、文末の句は
   * 実在記号に関係なく long に強制される。実在した記号そのものは punctuations が持つ。
   */
  pauseAfter: "none" | "short" | "long";
  /**
   * 句の直後に実在した記号の正規形列（例: 「そう…？」 → ["…", "?"]、出現順）。
   * 実在記号のみを反映する（文末 long 強制では増えない）ので、「実在の句点で文が
   * 終わったか」は "." の有無で判定できる。正規形の字母と写像対象は punctuationMarks 参照。
   */
  punctuations: string[];
};

/** フロントエンドの最終出力（正規化テキストとアクセント句列）。 */
export type FrontendResult = {
  /** 解析に用いた正規化済みテキスト。 */
  normalizedText: string;
  /** アクセント句の列。 */
  accentPhrases: AccentPhrase[];
  /**
   * 先頭のアクセント句より前に実在した記号の正規形列（例: 「…こんにちは」 → ["…"]）。
   * 記号だけで句が1つも無い入力では、全記号がここに入る。
   */
  leadingPunctuations: string[];
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
  /** 句の直後に実在した記号（生の1文字と正規形の対、ノード順）。 */
  punctuations: PunctuationMark[];
};

/** 語アライメントの1要素（1 NJD ノード、または実在記号1文字）。 */
export type WordPhones = {
  /** 語の表層（NJD ノード表層）、または実在記号の生の1文字（例 "！"）。 */
  surface: string;
  /** その語が生む音素列（両端 "_" は含まない）。記号要素は正規形1個（例 ["!"]）。 */
  phones: string[];
};
