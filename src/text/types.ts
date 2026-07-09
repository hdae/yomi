// text ドメインの型定義（値・実装から分離）。モーラ分割の入出力型。

/**
 * 1モーラの音韻情報。
 * - vowel: 通常モーラは "a" | "i" | "u" | "e" | "o"、撥音は "N"、促音は "cl"、
 *   長音は "long"。擬似モーラは vowel を "" にする。
 * - consonant: 子音なし（母音のみ／撥音／促音／長音の一部区分）は null。
 * - pseudo: jpreprocess の MoraEnum::Touten / MoraEnum::Question に対応する
 *   擬似モーラ種別。カナ→MoraEnum のテーブル（mora_dict.rs の4表）にはこの
 *   2種は存在せず、parse_mora_str が非マッチ文字区間を動的に Touten 化し、
 *   文字列全体が「？」と完全一致する場合のみ Question 化する（詳細は
 *   splitMorasWithRanges の実装コメント）。それ以外の通常モーラでは pseudo
 *   は付与しない。
 */
export type MoraSpec = {
  kana: string;
  consonant: string | null;
  vowel: string;
  pseudo?: "touten" | "question";
};

/** カナ表の1エントリ。1キーが複数モーラに展開されるのは全角アルファベットのみ。 */
export type MoraTableEntry = { key: string; expansion: MoraSpec[] };

/** 1つの range セグメント（jpreprocess parse_mora_str の Vec<(Range, Vec<Mora>)> の1要素）。 */
export type MoraSegment = { start: number; end: number; moras: MoraSpec[]; devoiced: number[] };
