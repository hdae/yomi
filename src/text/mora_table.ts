// カナ文字列 → モーラ列への分割・音素対応表。
//
// jpreprocess (Rust) crates/jpreprocess-core/src/pronunciation/ の
// mora_dict.rs（カナ→MoraEnum の4表: カタカナ・ひらがな・全角アルファベット・
// 不規則カタカナ）・phoneme.rs（MoraEnum→子音/母音）・mod.rs の
// parse_mora_str（Aho-Corasick LeftmostLongest 走査ロジック）を移植したもの。
//
// naist-jdic の発音列（col13）はカタカナのみで構成されるが、この表は
// 正規化後の「表層」文字列の解析（未知語・記号のかなフィラー化）にも使うため、
// mora_dict.rs の4表すべてを移植対象にする。表層にはひらがな・全角英字が
// 普通に現れうる（正規化で半角英字は全角化されるため全角アルファベット表が効く）。

import type { MoraSegment, MoraSpec, MoraTableEntry } from "./types.ts";

// 2文字キー表（カタカナ・ひらがなの拗音・外来音）。
// 各キーの expansion は長さ1（1キー=1モーラ）。
const TWO_CHAR_ENTRIES: readonly MoraTableEntry[] = [
  { key: "いぇ", expansion: [{ kana: "イェ", consonant: "y", vowel: "e" }] },
  { key: "うぃ", expansion: [{ kana: "ウィ", consonant: "w", vowel: "i" }] },
  { key: "うぇ", expansion: [{ kana: "ウェ", consonant: "w", vowel: "e" }] },
  { key: "うぉ", expansion: [{ kana: "ウォ", consonant: "w", vowel: "o" }] },
  { key: "きぇ", expansion: [{ kana: "キェ", consonant: "ky", vowel: "e" }] },
  { key: "きゃ", expansion: [{ kana: "キャ", consonant: "ky", vowel: "a" }] },
  { key: "きゅ", expansion: [{ kana: "キュ", consonant: "ky", vowel: "u" }] },
  { key: "きょ", expansion: [{ kana: "キョ", consonant: "ky", vowel: "o" }] },
  { key: "ぎぇ", expansion: [{ kana: "ギェ", consonant: "gy", vowel: "e" }] },
  { key: "ぎゃ", expansion: [{ kana: "ギャ", consonant: "gy", vowel: "a" }] },
  { key: "ぎゅ", expansion: [{ kana: "ギュ", consonant: "gy", vowel: "u" }] },
  { key: "ぎょ", expansion: [{ kana: "ギョ", consonant: "gy", vowel: "o" }] },
  { key: "しぇ", expansion: [{ kana: "シェ", consonant: "sh", vowel: "e" }] },
  { key: "しゃ", expansion: [{ kana: "シャ", consonant: "sh", vowel: "a" }] },
  { key: "しゅ", expansion: [{ kana: "シュ", consonant: "sh", vowel: "u" }] },
  { key: "しょ", expansion: [{ kana: "ショ", consonant: "sh", vowel: "o" }] },
  { key: "じぇ", expansion: [{ kana: "ジェ", consonant: "j", vowel: "e" }] },
  { key: "じゃ", expansion: [{ kana: "ジャ", consonant: "j", vowel: "a" }] },
  { key: "じゅ", expansion: [{ kana: "ジュ", consonant: "j", vowel: "u" }] },
  { key: "じょ", expansion: [{ kana: "ジョ", consonant: "j", vowel: "o" }] },
  { key: "すぃ", expansion: [{ kana: "スィ", consonant: "s", vowel: "i" }] },
  { key: "ずぃ", expansion: [{ kana: "ズィ", consonant: "z", vowel: "i" }] },
  { key: "ちぇ", expansion: [{ kana: "チェ", consonant: "ch", vowel: "e" }] },
  { key: "ちゃ", expansion: [{ kana: "チャ", consonant: "ch", vowel: "a" }] },
  { key: "ちゅ", expansion: [{ kana: "チュ", consonant: "ch", vowel: "u" }] },
  { key: "ちょ", expansion: [{ kana: "チョ", consonant: "ch", vowel: "o" }] },
  { key: "つぁ", expansion: [{ kana: "ツァ", consonant: "ts", vowel: "a" }] },
  { key: "つぃ", expansion: [{ kana: "ツィ", consonant: "ts", vowel: "i" }] },
  { key: "つぇ", expansion: [{ kana: "ツェ", consonant: "ts", vowel: "e" }] },
  { key: "つぉ", expansion: [{ kana: "ツォ", consonant: "ts", vowel: "o" }] },
  { key: "てぃ", expansion: [{ kana: "ティ", consonant: "t", vowel: "i" }] },
  { key: "てゃ", expansion: [{ kana: "テャ", consonant: "ty", vowel: "a" }] },
  { key: "てゅ", expansion: [{ kana: "テュ", consonant: "ty", vowel: "u" }] },
  { key: "てょ", expansion: [{ kana: "テョ", consonant: "ty", vowel: "o" }] },
  { key: "でぃ", expansion: [{ kana: "ディ", consonant: "d", vowel: "i" }] },
  { key: "でゃ", expansion: [{ kana: "デャ", consonant: "dy", vowel: "a" }] },
  { key: "でゅ", expansion: [{ kana: "デュ", consonant: "dy", vowel: "u" }] },
  { key: "でょ", expansion: [{ kana: "デョ", consonant: "dy", vowel: "o" }] },
  { key: "とぅ", expansion: [{ kana: "トゥ", consonant: "t", vowel: "u" }] },
  { key: "どぅ", expansion: [{ kana: "ドゥ", consonant: "d", vowel: "u" }] },
  { key: "にぇ", expansion: [{ kana: "ニェ", consonant: "ny", vowel: "e" }] },
  { key: "にゃ", expansion: [{ kana: "ニャ", consonant: "ny", vowel: "a" }] },
  { key: "にゅ", expansion: [{ kana: "ニュ", consonant: "ny", vowel: "u" }] },
  { key: "にょ", expansion: [{ kana: "ニョ", consonant: "ny", vowel: "o" }] },
  { key: "ひぇ", expansion: [{ kana: "ヒェ", consonant: "hy", vowel: "e" }] },
  { key: "ひゃ", expansion: [{ kana: "ヒャ", consonant: "hy", vowel: "a" }] },
  { key: "ひゅ", expansion: [{ kana: "ヒュ", consonant: "hy", vowel: "u" }] },
  { key: "ひょ", expansion: [{ kana: "ヒョ", consonant: "hy", vowel: "o" }] },
  { key: "びぇ", expansion: [{ kana: "ビェ", consonant: "by", vowel: "e" }] },
  { key: "びゃ", expansion: [{ kana: "ビャ", consonant: "by", vowel: "a" }] },
  { key: "びゅ", expansion: [{ kana: "ビュ", consonant: "by", vowel: "u" }] },
  { key: "びょ", expansion: [{ kana: "ビョ", consonant: "by", vowel: "o" }] },
  { key: "ぴぇ", expansion: [{ kana: "ピェ", consonant: "py", vowel: "e" }] },
  { key: "ぴゃ", expansion: [{ kana: "ピャ", consonant: "py", vowel: "a" }] },
  { key: "ぴゅ", expansion: [{ kana: "ピュ", consonant: "py", vowel: "u" }] },
  { key: "ぴょ", expansion: [{ kana: "ピョ", consonant: "py", vowel: "o" }] },
  { key: "ふぁ", expansion: [{ kana: "ファ", consonant: "f", vowel: "a" }] },
  { key: "ふぃ", expansion: [{ kana: "フィ", consonant: "f", vowel: "i" }] },
  { key: "ふぇ", expansion: [{ kana: "フェ", consonant: "f", vowel: "e" }] },
  { key: "ふぉ", expansion: [{ kana: "フォ", consonant: "f", vowel: "o" }] },
  { key: "みぇ", expansion: [{ kana: "ミェ", consonant: "my", vowel: "e" }] },
  { key: "みゃ", expansion: [{ kana: "ミャ", consonant: "my", vowel: "a" }] },
  { key: "みゅ", expansion: [{ kana: "ミュ", consonant: "my", vowel: "u" }] },
  { key: "みょ", expansion: [{ kana: "ミョ", consonant: "my", vowel: "o" }] },
  { key: "りぇ", expansion: [{ kana: "リェ", consonant: "ry", vowel: "e" }] },
  { key: "りゃ", expansion: [{ kana: "リャ", consonant: "ry", vowel: "a" }] },
  { key: "りゅ", expansion: [{ kana: "リュ", consonant: "ry", vowel: "u" }] },
  { key: "りょ", expansion: [{ kana: "リョ", consonant: "ry", vowel: "o" }] },
  { key: "ゔぁ", expansion: [{ kana: "ヴァ", consonant: "v", vowel: "a" }] },
  { key: "ゔぃ", expansion: [{ kana: "ヴィ", consonant: "v", vowel: "i" }] },
  { key: "ゔぇ", expansion: [{ kana: "ヴェ", consonant: "v", vowel: "e" }] },
  { key: "ゔぉ", expansion: [{ kana: "ヴォ", consonant: "v", vowel: "o" }] },
  { key: "ゔゃ", expansion: [{ kana: "ヴャ", consonant: "by", vowel: "a" }] },
  { key: "ゔゅ", expansion: [{ kana: "ヴュ", consonant: "by", vowel: "u" }] },
  { key: "ゔょ", expansion: [{ kana: "ヴョ", consonant: "by", vowel: "o" }] },
  { key: "イェ", expansion: [{ kana: "イェ", consonant: "y", vowel: "e" }] },
  { key: "ウィ", expansion: [{ kana: "ウィ", consonant: "w", vowel: "i" }] },
  { key: "ウェ", expansion: [{ kana: "ウェ", consonant: "w", vowel: "e" }] },
  { key: "ウォ", expansion: [{ kana: "ウォ", consonant: "w", vowel: "o" }] },
  { key: "キェ", expansion: [{ kana: "キェ", consonant: "ky", vowel: "e" }] },
  { key: "キャ", expansion: [{ kana: "キャ", consonant: "ky", vowel: "a" }] },
  { key: "キュ", expansion: [{ kana: "キュ", consonant: "ky", vowel: "u" }] },
  { key: "キョ", expansion: [{ kana: "キョ", consonant: "ky", vowel: "o" }] },
  { key: "ギェ", expansion: [{ kana: "ギェ", consonant: "gy", vowel: "e" }] },
  { key: "ギャ", expansion: [{ kana: "ギャ", consonant: "gy", vowel: "a" }] },
  { key: "ギュ", expansion: [{ kana: "ギュ", consonant: "gy", vowel: "u" }] },
  { key: "ギョ", expansion: [{ kana: "ギョ", consonant: "gy", vowel: "o" }] },
  { key: "クヮ", expansion: [{ kana: "クヮ", consonant: "kw", vowel: "a" }] },
  { key: "グヮ", expansion: [{ kana: "グヮ", consonant: "gw", vowel: "a" }] },
  { key: "シェ", expansion: [{ kana: "シェ", consonant: "sh", vowel: "e" }] },
  { key: "シャ", expansion: [{ kana: "シャ", consonant: "sh", vowel: "a" }] },
  { key: "シュ", expansion: [{ kana: "シュ", consonant: "sh", vowel: "u" }] },
  { key: "ショ", expansion: [{ kana: "ショ", consonant: "sh", vowel: "o" }] },
  { key: "ジェ", expansion: [{ kana: "ジェ", consonant: "j", vowel: "e" }] },
  { key: "ジャ", expansion: [{ kana: "ジャ", consonant: "j", vowel: "a" }] },
  { key: "ジュ", expansion: [{ kana: "ジュ", consonant: "j", vowel: "u" }] },
  { key: "ジョ", expansion: [{ kana: "ジョ", consonant: "j", vowel: "o" }] },
  { key: "スィ", expansion: [{ kana: "スィ", consonant: "s", vowel: "i" }] },
  { key: "ズィ", expansion: [{ kana: "ズィ", consonant: "z", vowel: "i" }] },
  { key: "チェ", expansion: [{ kana: "チェ", consonant: "ch", vowel: "e" }] },
  { key: "チャ", expansion: [{ kana: "チャ", consonant: "ch", vowel: "a" }] },
  { key: "チュ", expansion: [{ kana: "チュ", consonant: "ch", vowel: "u" }] },
  { key: "チョ", expansion: [{ kana: "チョ", consonant: "ch", vowel: "o" }] },
  { key: "ツァ", expansion: [{ kana: "ツァ", consonant: "ts", vowel: "a" }] },
  { key: "ツィ", expansion: [{ kana: "ツィ", consonant: "ts", vowel: "i" }] },
  { key: "ツェ", expansion: [{ kana: "ツェ", consonant: "ts", vowel: "e" }] },
  { key: "ツォ", expansion: [{ kana: "ツォ", consonant: "ts", vowel: "o" }] },
  { key: "ティ", expansion: [{ kana: "ティ", consonant: "t", vowel: "i" }] },
  { key: "テャ", expansion: [{ kana: "テャ", consonant: "ty", vowel: "a" }] },
  { key: "テュ", expansion: [{ kana: "テュ", consonant: "ty", vowel: "u" }] },
  { key: "テョ", expansion: [{ kana: "テョ", consonant: "ty", vowel: "o" }] },
  { key: "ディ", expansion: [{ kana: "ディ", consonant: "d", vowel: "i" }] },
  { key: "デャ", expansion: [{ kana: "デャ", consonant: "dy", vowel: "a" }] },
  { key: "デュ", expansion: [{ kana: "デュ", consonant: "dy", vowel: "u" }] },
  { key: "デョ", expansion: [{ kana: "デョ", consonant: "dy", vowel: "o" }] },
  { key: "トゥ", expansion: [{ kana: "トゥ", consonant: "t", vowel: "u" }] },
  { key: "ドゥ", expansion: [{ kana: "ドゥ", consonant: "d", vowel: "u" }] },
  { key: "ニェ", expansion: [{ kana: "ニェ", consonant: "ny", vowel: "e" }] },
  { key: "ニャ", expansion: [{ kana: "ニャ", consonant: "ny", vowel: "a" }] },
  { key: "ニュ", expansion: [{ kana: "ニュ", consonant: "ny", vowel: "u" }] },
  { key: "ニョ", expansion: [{ kana: "ニョ", consonant: "ny", vowel: "o" }] },
  { key: "ヒェ", expansion: [{ kana: "ヒェ", consonant: "hy", vowel: "e" }] },
  { key: "ヒャ", expansion: [{ kana: "ヒャ", consonant: "hy", vowel: "a" }] },
  { key: "ヒュ", expansion: [{ kana: "ヒュ", consonant: "hy", vowel: "u" }] },
  { key: "ヒョ", expansion: [{ kana: "ヒョ", consonant: "hy", vowel: "o" }] },
  { key: "ビェ", expansion: [{ kana: "ビェ", consonant: "by", vowel: "e" }] },
  { key: "ビャ", expansion: [{ kana: "ビャ", consonant: "by", vowel: "a" }] },
  { key: "ビュ", expansion: [{ kana: "ビュ", consonant: "by", vowel: "u" }] },
  { key: "ビョ", expansion: [{ kana: "ビョ", consonant: "by", vowel: "o" }] },
  { key: "ピェ", expansion: [{ kana: "ピェ", consonant: "py", vowel: "e" }] },
  { key: "ピャ", expansion: [{ kana: "ピャ", consonant: "py", vowel: "a" }] },
  { key: "ピュ", expansion: [{ kana: "ピュ", consonant: "py", vowel: "u" }] },
  { key: "ピョ", expansion: [{ kana: "ピョ", consonant: "py", vowel: "o" }] },
  { key: "ファ", expansion: [{ kana: "ファ", consonant: "f", vowel: "a" }] },
  { key: "フィ", expansion: [{ kana: "フィ", consonant: "f", vowel: "i" }] },
  { key: "フェ", expansion: [{ kana: "フェ", consonant: "f", vowel: "e" }] },
  { key: "フォ", expansion: [{ kana: "フォ", consonant: "f", vowel: "o" }] },
  { key: "ミェ", expansion: [{ kana: "ミェ", consonant: "my", vowel: "e" }] },
  { key: "ミャ", expansion: [{ kana: "ミャ", consonant: "my", vowel: "a" }] },
  { key: "ミュ", expansion: [{ kana: "ミュ", consonant: "my", vowel: "u" }] },
  { key: "ミョ", expansion: [{ kana: "ミョ", consonant: "my", vowel: "o" }] },
  { key: "リェ", expansion: [{ kana: "リェ", consonant: "ry", vowel: "e" }] },
  { key: "リャ", expansion: [{ kana: "リャ", consonant: "ry", vowel: "a" }] },
  { key: "リュ", expansion: [{ kana: "リュ", consonant: "ry", vowel: "u" }] },
  { key: "リョ", expansion: [{ kana: "リョ", consonant: "ry", vowel: "o" }] },
  { key: "ヴァ", expansion: [{ kana: "ヴァ", consonant: "v", vowel: "a" }] },
  { key: "ヴィ", expansion: [{ kana: "ヴィ", consonant: "v", vowel: "i" }] },
  { key: "ヴェ", expansion: [{ kana: "ヴェ", consonant: "v", vowel: "e" }] },
  { key: "ヴォ", expansion: [{ kana: "ヴォ", consonant: "v", vowel: "o" }] },
  { key: "ヴャ", expansion: [{ kana: "ヴャ", consonant: "by", vowel: "a" }] },
  { key: "ヴュ", expansion: [{ kana: "ヴュ", consonant: "by", vowel: "u" }] },
  { key: "ヴョ", expansion: [{ kana: "ヴョ", consonant: "by", vowel: "o" }] },
];

// 1文字キー表。カタカナ・ひらがな・不規則カタカナ・長音（expansion 長さ1）に
// 加え、全角アルファベット（expansion 長さ2〜4。1文字が複数モーラに展開される
// jpreprocess の特殊表）を含む。
const ONE_CHAR_ENTRIES: readonly MoraTableEntry[] = [
  { key: "ぁ", expansion: [{ kana: "ァ", consonant: null, vowel: "a" }] },
  { key: "あ", expansion: [{ kana: "ア", consonant: null, vowel: "a" }] },
  { key: "ぃ", expansion: [{ kana: "ィ", consonant: null, vowel: "i" }] },
  { key: "い", expansion: [{ kana: "イ", consonant: null, vowel: "i" }] },
  { key: "ぅ", expansion: [{ kana: "ゥ", consonant: null, vowel: "u" }] },
  { key: "う", expansion: [{ kana: "ウ", consonant: null, vowel: "u" }] },
  { key: "ぇ", expansion: [{ kana: "ェ", consonant: null, vowel: "e" }] },
  { key: "え", expansion: [{ kana: "エ", consonant: null, vowel: "e" }] },
  { key: "ぉ", expansion: [{ kana: "ォ", consonant: null, vowel: "o" }] },
  { key: "お", expansion: [{ kana: "オ", consonant: null, vowel: "o" }] },
  { key: "か", expansion: [{ kana: "カ", consonant: "k", vowel: "a" }] },
  { key: "が", expansion: [{ kana: "ガ", consonant: "g", vowel: "a" }] },
  { key: "き", expansion: [{ kana: "キ", consonant: "k", vowel: "i" }] },
  { key: "ぎ", expansion: [{ kana: "ギ", consonant: "g", vowel: "i" }] },
  { key: "く", expansion: [{ kana: "ク", consonant: "k", vowel: "u" }] },
  { key: "ぐ", expansion: [{ kana: "グ", consonant: "g", vowel: "u" }] },
  { key: "け", expansion: [{ kana: "ケ", consonant: "k", vowel: "e" }] },
  { key: "げ", expansion: [{ kana: "ゲ", consonant: "g", vowel: "e" }] },
  { key: "こ", expansion: [{ kana: "コ", consonant: "k", vowel: "o" }] },
  { key: "ご", expansion: [{ kana: "ゴ", consonant: "g", vowel: "o" }] },
  { key: "さ", expansion: [{ kana: "サ", consonant: "s", vowel: "a" }] },
  { key: "ざ", expansion: [{ kana: "ザ", consonant: "z", vowel: "a" }] },
  { key: "し", expansion: [{ kana: "シ", consonant: "sh", vowel: "i" }] },
  { key: "じ", expansion: [{ kana: "ジ", consonant: "j", vowel: "i" }] },
  { key: "す", expansion: [{ kana: "ス", consonant: "s", vowel: "u" }] },
  { key: "ず", expansion: [{ kana: "ズ", consonant: "z", vowel: "u" }] },
  { key: "せ", expansion: [{ kana: "セ", consonant: "s", vowel: "e" }] },
  { key: "ぜ", expansion: [{ kana: "ゼ", consonant: "z", vowel: "e" }] },
  { key: "そ", expansion: [{ kana: "ソ", consonant: "s", vowel: "o" }] },
  { key: "ぞ", expansion: [{ kana: "ゾ", consonant: "z", vowel: "o" }] },
  { key: "た", expansion: [{ kana: "タ", consonant: "t", vowel: "a" }] },
  { key: "だ", expansion: [{ kana: "ダ", consonant: "d", vowel: "a" }] },
  { key: "ち", expansion: [{ kana: "チ", consonant: "ch", vowel: "i" }] },
  { key: "ぢ", expansion: [{ kana: "ヂ", consonant: "j", vowel: "i" }] },
  { key: "っ", expansion: [{ kana: "ッ", consonant: "cl", vowel: "cl" }] },
  { key: "つ", expansion: [{ kana: "ツ", consonant: "ts", vowel: "u" }] },
  { key: "づ", expansion: [{ kana: "ヅ", consonant: "z", vowel: "u" }] },
  { key: "て", expansion: [{ kana: "テ", consonant: "t", vowel: "e" }] },
  { key: "で", expansion: [{ kana: "デ", consonant: "d", vowel: "e" }] },
  { key: "と", expansion: [{ kana: "ト", consonant: "t", vowel: "o" }] },
  { key: "ど", expansion: [{ kana: "ド", consonant: "d", vowel: "o" }] },
  { key: "な", expansion: [{ kana: "ナ", consonant: "n", vowel: "a" }] },
  { key: "に", expansion: [{ kana: "ニ", consonant: "n", vowel: "i" }] },
  { key: "ぬ", expansion: [{ kana: "ヌ", consonant: "n", vowel: "u" }] },
  { key: "ね", expansion: [{ kana: "ネ", consonant: "n", vowel: "e" }] },
  { key: "の", expansion: [{ kana: "ノ", consonant: "n", vowel: "o" }] },
  { key: "は", expansion: [{ kana: "ハ", consonant: "h", vowel: "a" }] },
  { key: "ば", expansion: [{ kana: "バ", consonant: "b", vowel: "a" }] },
  { key: "ぱ", expansion: [{ kana: "パ", consonant: "p", vowel: "a" }] },
  { key: "ひ", expansion: [{ kana: "ヒ", consonant: "h", vowel: "i" }] },
  { key: "び", expansion: [{ kana: "ビ", consonant: "b", vowel: "i" }] },
  { key: "ぴ", expansion: [{ kana: "ピ", consonant: "p", vowel: "i" }] },
  { key: "ふ", expansion: [{ kana: "フ", consonant: "f", vowel: "u" }] },
  { key: "ぶ", expansion: [{ kana: "ブ", consonant: "b", vowel: "u" }] },
  { key: "ぷ", expansion: [{ kana: "プ", consonant: "p", vowel: "u" }] },
  { key: "へ", expansion: [{ kana: "ヘ", consonant: "h", vowel: "e" }] },
  { key: "べ", expansion: [{ kana: "ベ", consonant: "b", vowel: "e" }] },
  { key: "ぺ", expansion: [{ kana: "ペ", consonant: "p", vowel: "e" }] },
  { key: "ほ", expansion: [{ kana: "ホ", consonant: "h", vowel: "o" }] },
  { key: "ぼ", expansion: [{ kana: "ボ", consonant: "b", vowel: "o" }] },
  { key: "ぽ", expansion: [{ kana: "ポ", consonant: "p", vowel: "o" }] },
  { key: "ま", expansion: [{ kana: "マ", consonant: "m", vowel: "a" }] },
  { key: "み", expansion: [{ kana: "ミ", consonant: "m", vowel: "i" }] },
  { key: "む", expansion: [{ kana: "ム", consonant: "m", vowel: "u" }] },
  { key: "め", expansion: [{ kana: "メ", consonant: "m", vowel: "e" }] },
  { key: "も", expansion: [{ kana: "モ", consonant: "m", vowel: "o" }] },
  { key: "ゃ", expansion: [{ kana: "ャ", consonant: "y", vowel: "a" }] },
  { key: "や", expansion: [{ kana: "ヤ", consonant: "y", vowel: "a" }] },
  { key: "ゅ", expansion: [{ kana: "ュ", consonant: "y", vowel: "u" }] },
  { key: "ゆ", expansion: [{ kana: "ユ", consonant: "y", vowel: "u" }] },
  { key: "ょ", expansion: [{ kana: "ョ", consonant: "y", vowel: "o" }] },
  { key: "よ", expansion: [{ kana: "ヨ", consonant: "y", vowel: "o" }] },
  { key: "ら", expansion: [{ kana: "ラ", consonant: "r", vowel: "a" }] },
  { key: "り", expansion: [{ kana: "リ", consonant: "r", vowel: "i" }] },
  { key: "る", expansion: [{ kana: "ル", consonant: "r", vowel: "u" }] },
  { key: "れ", expansion: [{ kana: "レ", consonant: "r", vowel: "e" }] },
  { key: "ろ", expansion: [{ kana: "ロ", consonant: "r", vowel: "o" }] },
  { key: "わ", expansion: [{ kana: "ワ", consonant: "w", vowel: "a" }] },
  { key: "ゐ", expansion: [{ kana: "ヰ", consonant: null, vowel: "i" }] },
  { key: "ゑ", expansion: [{ kana: "ヱ", consonant: null, vowel: "e" }] },
  { key: "を", expansion: [{ kana: "ヲ", consonant: null, vowel: "o" }] },
  { key: "ん", expansion: [{ kana: "ン", consonant: "N", vowel: "N" }] },
  { key: "ゔ", expansion: [{ kana: "ヴ", consonant: "v", vowel: "u" }] },
  { key: "ァ", expansion: [{ kana: "ァ", consonant: null, vowel: "a" }] },
  { key: "ア", expansion: [{ kana: "ア", consonant: null, vowel: "a" }] },
  { key: "ィ", expansion: [{ kana: "ィ", consonant: null, vowel: "i" }] },
  { key: "イ", expansion: [{ kana: "イ", consonant: null, vowel: "i" }] },
  { key: "ゥ", expansion: [{ kana: "ゥ", consonant: null, vowel: "u" }] },
  { key: "ウ", expansion: [{ kana: "ウ", consonant: null, vowel: "u" }] },
  { key: "ェ", expansion: [{ kana: "ェ", consonant: null, vowel: "e" }] },
  { key: "エ", expansion: [{ kana: "エ", consonant: null, vowel: "e" }] },
  { key: "ォ", expansion: [{ kana: "ォ", consonant: null, vowel: "o" }] },
  { key: "オ", expansion: [{ kana: "オ", consonant: null, vowel: "o" }] },
  { key: "カ", expansion: [{ kana: "カ", consonant: "k", vowel: "a" }] },
  { key: "ガ", expansion: [{ kana: "ガ", consonant: "g", vowel: "a" }] },
  { key: "キ", expansion: [{ kana: "キ", consonant: "k", vowel: "i" }] },
  { key: "ギ", expansion: [{ kana: "ギ", consonant: "g", vowel: "i" }] },
  { key: "ク", expansion: [{ kana: "ク", consonant: "k", vowel: "u" }] },
  { key: "グ", expansion: [{ kana: "グ", consonant: "g", vowel: "u" }] },
  { key: "ケ", expansion: [{ kana: "ケ", consonant: "k", vowel: "e" }] },
  { key: "ゲ", expansion: [{ kana: "ゲ", consonant: "g", vowel: "e" }] },
  { key: "コ", expansion: [{ kana: "コ", consonant: "k", vowel: "o" }] },
  { key: "ゴ", expansion: [{ kana: "ゴ", consonant: "g", vowel: "o" }] },
  { key: "サ", expansion: [{ kana: "サ", consonant: "s", vowel: "a" }] },
  { key: "ザ", expansion: [{ kana: "ザ", consonant: "z", vowel: "a" }] },
  { key: "シ", expansion: [{ kana: "シ", consonant: "sh", vowel: "i" }] },
  { key: "ジ", expansion: [{ kana: "ジ", consonant: "j", vowel: "i" }] },
  { key: "ス", expansion: [{ kana: "ス", consonant: "s", vowel: "u" }] },
  { key: "ズ", expansion: [{ kana: "ズ", consonant: "z", vowel: "u" }] },
  { key: "セ", expansion: [{ kana: "セ", consonant: "s", vowel: "e" }] },
  { key: "ゼ", expansion: [{ kana: "ゼ", consonant: "z", vowel: "e" }] },
  { key: "ソ", expansion: [{ kana: "ソ", consonant: "s", vowel: "o" }] },
  { key: "ゾ", expansion: [{ kana: "ゾ", consonant: "z", vowel: "o" }] },
  { key: "タ", expansion: [{ kana: "タ", consonant: "t", vowel: "a" }] },
  { key: "ダ", expansion: [{ kana: "ダ", consonant: "d", vowel: "a" }] },
  { key: "チ", expansion: [{ kana: "チ", consonant: "ch", vowel: "i" }] },
  { key: "ヂ", expansion: [{ kana: "ヂ", consonant: "j", vowel: "i" }] },
  { key: "ッ", expansion: [{ kana: "ッ", consonant: "cl", vowel: "cl" }] },
  { key: "ツ", expansion: [{ kana: "ツ", consonant: "ts", vowel: "u" }] },
  { key: "ヅ", expansion: [{ kana: "ヅ", consonant: "z", vowel: "u" }] },
  { key: "テ", expansion: [{ kana: "テ", consonant: "t", vowel: "e" }] },
  { key: "デ", expansion: [{ kana: "デ", consonant: "d", vowel: "e" }] },
  { key: "ト", expansion: [{ kana: "ト", consonant: "t", vowel: "o" }] },
  { key: "ド", expansion: [{ kana: "ド", consonant: "d", vowel: "o" }] },
  { key: "ナ", expansion: [{ kana: "ナ", consonant: "n", vowel: "a" }] },
  { key: "ニ", expansion: [{ kana: "ニ", consonant: "n", vowel: "i" }] },
  { key: "ヌ", expansion: [{ kana: "ヌ", consonant: "n", vowel: "u" }] },
  { key: "ネ", expansion: [{ kana: "ネ", consonant: "n", vowel: "e" }] },
  { key: "ノ", expansion: [{ kana: "ノ", consonant: "n", vowel: "o" }] },
  { key: "ハ", expansion: [{ kana: "ハ", consonant: "h", vowel: "a" }] },
  { key: "バ", expansion: [{ kana: "バ", consonant: "b", vowel: "a" }] },
  { key: "パ", expansion: [{ kana: "パ", consonant: "p", vowel: "a" }] },
  { key: "ヒ", expansion: [{ kana: "ヒ", consonant: "h", vowel: "i" }] },
  { key: "ビ", expansion: [{ kana: "ビ", consonant: "b", vowel: "i" }] },
  { key: "ピ", expansion: [{ kana: "ピ", consonant: "p", vowel: "i" }] },
  { key: "フ", expansion: [{ kana: "フ", consonant: "f", vowel: "u" }] },
  { key: "ブ", expansion: [{ kana: "ブ", consonant: "b", vowel: "u" }] },
  { key: "プ", expansion: [{ kana: "プ", consonant: "p", vowel: "u" }] },
  { key: "ヘ", expansion: [{ kana: "ヘ", consonant: "h", vowel: "e" }] },
  { key: "ベ", expansion: [{ kana: "ベ", consonant: "b", vowel: "e" }] },
  { key: "ペ", expansion: [{ kana: "ペ", consonant: "p", vowel: "e" }] },
  { key: "ホ", expansion: [{ kana: "ホ", consonant: "h", vowel: "o" }] },
  { key: "ボ", expansion: [{ kana: "ボ", consonant: "b", vowel: "o" }] },
  { key: "ポ", expansion: [{ kana: "ポ", consonant: "p", vowel: "o" }] },
  { key: "マ", expansion: [{ kana: "マ", consonant: "m", vowel: "a" }] },
  { key: "ミ", expansion: [{ kana: "ミ", consonant: "m", vowel: "i" }] },
  { key: "ム", expansion: [{ kana: "ム", consonant: "m", vowel: "u" }] },
  { key: "メ", expansion: [{ kana: "メ", consonant: "m", vowel: "e" }] },
  { key: "モ", expansion: [{ kana: "モ", consonant: "m", vowel: "o" }] },
  { key: "ャ", expansion: [{ kana: "ャ", consonant: "y", vowel: "a" }] },
  { key: "ヤ", expansion: [{ kana: "ヤ", consonant: "y", vowel: "a" }] },
  { key: "ュ", expansion: [{ kana: "ュ", consonant: "y", vowel: "u" }] },
  { key: "ユ", expansion: [{ kana: "ユ", consonant: "y", vowel: "u" }] },
  { key: "ョ", expansion: [{ kana: "ョ", consonant: "y", vowel: "o" }] },
  { key: "ヨ", expansion: [{ kana: "ヨ", consonant: "y", vowel: "o" }] },
  { key: "ラ", expansion: [{ kana: "ラ", consonant: "r", vowel: "a" }] },
  { key: "リ", expansion: [{ kana: "リ", consonant: "r", vowel: "i" }] },
  { key: "ル", expansion: [{ kana: "ル", consonant: "r", vowel: "u" }] },
  { key: "レ", expansion: [{ kana: "レ", consonant: "r", vowel: "e" }] },
  { key: "ロ", expansion: [{ kana: "ロ", consonant: "r", vowel: "o" }] },
  { key: "ヮ", expansion: [{ kana: "ヮ", consonant: "w", vowel: "a" }] },
  { key: "ワ", expansion: [{ kana: "ワ", consonant: "w", vowel: "a" }] },
  { key: "ヰ", expansion: [{ kana: "ヰ", consonant: null, vowel: "i" }] },
  { key: "ヱ", expansion: [{ kana: "ヱ", consonant: null, vowel: "e" }] },
  { key: "ヲ", expansion: [{ kana: "ヲ", consonant: null, vowel: "o" }] },
  { key: "ン", expansion: [{ kana: "ン", consonant: "N", vowel: "N" }] },
  { key: "ヴ", expansion: [{ kana: "ヴ", consonant: "v", vowel: "u" }] },
  // ヵ は本家（jpreprocess mora_dict.rs）に無い意図的拡張（docs/limitations.md 参照）。
  { key: "ヵ", expansion: [{ kana: "ヵ", consonant: "k", vowel: "a" }] },
  { key: "ヶ", expansion: [{ kana: "ヶ", consonant: "k", vowel: "e" }] },
  { key: "ー", expansion: [{ kana: "ー", consonant: "-", vowel: "long" }] },
  // 全角アルファベット（1キー=複数モーラ）。小文字・大文字とも同じ展開。
  {
    key: "Ａ",
    expansion: [{ kana: "エ", consonant: null, vowel: "e" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｂ",
    expansion: [{ kana: "ビ", consonant: "b", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｃ",
    expansion: [{ kana: "シ", consonant: "sh", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｄ",
    expansion: [{ kana: "ディ", consonant: "d", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｅ",
    expansion: [{ kana: "イ", consonant: null, vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｆ",
    expansion: [{ kana: "エ", consonant: null, vowel: "e" }, {
      kana: "フ",
      consonant: "f",
      vowel: "u",
    }],
  },
  {
    key: "Ｇ",
    expansion: [{ kana: "ジ", consonant: "j", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｈ",
    expansion: [
      { kana: "エ", consonant: null, vowel: "e" },
      { kana: "イ", consonant: null, vowel: "i" },
      { kana: "チ", consonant: "ch", vowel: "i" },
    ],
  },
  {
    key: "Ｉ",
    expansion: [{ kana: "ア", consonant: null, vowel: "a" }, {
      kana: "イ",
      consonant: null,
      vowel: "i",
    }],
  },
  {
    key: "Ｊ",
    expansion: [{ kana: "ジェ", consonant: "j", vowel: "e" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｋ",
    expansion: [{ kana: "ケ", consonant: "k", vowel: "e" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｌ",
    expansion: [{ kana: "エ", consonant: null, vowel: "e" }, {
      kana: "ル",
      consonant: "r",
      vowel: "u",
    }],
  },
  {
    key: "Ｍ",
    expansion: [{ kana: "エ", consonant: null, vowel: "e" }, {
      kana: "ム",
      consonant: "m",
      vowel: "u",
    }],
  },
  {
    key: "Ｎ",
    expansion: [{ kana: "エ", consonant: null, vowel: "e" }, {
      kana: "ヌ",
      consonant: "n",
      vowel: "u",
    }],
  },
  {
    key: "Ｏ",
    expansion: [{ kana: "オ", consonant: null, vowel: "o" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｐ",
    expansion: [{ kana: "ピ", consonant: "p", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｑ",
    expansion: [{ kana: "キュ", consonant: "ky", vowel: "u" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｒ",
    expansion: [
      { kana: "ア", consonant: null, vowel: "a" },
      { kana: "ー", consonant: "-", vowel: "long" },
      { kana: "ル", consonant: "r", vowel: "u" },
    ],
  },
  {
    key: "Ｓ",
    expansion: [{ kana: "エ", consonant: null, vowel: "e" }, {
      kana: "ス",
      consonant: "s",
      vowel: "u",
    }],
  },
  {
    key: "Ｔ",
    expansion: [{ kana: "ティ", consonant: "t", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｕ",
    expansion: [{ kana: "ユ", consonant: "y", vowel: "u" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "Ｖ",
    expansion: [{ kana: "ブ", consonant: "b", vowel: "u" }, {
      kana: "イ",
      consonant: null,
      vowel: "i",
    }],
  },
  {
    key: "Ｗ",
    expansion: [
      { kana: "ダ", consonant: "d", vowel: "a" },
      { kana: "ブ", consonant: "b", vowel: "u" },
      { kana: "リュ", consonant: "ry", vowel: "u" },
      { kana: "ー", consonant: "-", vowel: "long" },
    ],
  },
  {
    key: "Ｘ",
    expansion: [
      { kana: "エ", consonant: null, vowel: "e" },
      { kana: "ッ", consonant: "cl", vowel: "cl" },
      { kana: "ク", consonant: "k", vowel: "u" },
      { kana: "ス", consonant: "s", vowel: "u" },
    ],
  },
  {
    key: "Ｙ",
    expansion: [{ kana: "ワ", consonant: "w", vowel: "a" }, {
      kana: "イ",
      consonant: null,
      vowel: "i",
    }],
  },
  {
    key: "Ｚ",
    expansion: [{ kana: "ズィ", consonant: "z", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ａ",
    expansion: [{ kana: "エ", consonant: null, vowel: "e" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｂ",
    expansion: [{ kana: "ビ", consonant: "b", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｃ",
    expansion: [{ kana: "シ", consonant: "sh", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｄ",
    expansion: [{ kana: "ディ", consonant: "d", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｅ",
    expansion: [{ kana: "イ", consonant: null, vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｆ",
    expansion: [{ kana: "エ", consonant: null, vowel: "e" }, {
      kana: "フ",
      consonant: "f",
      vowel: "u",
    }],
  },
  {
    key: "ｇ",
    expansion: [{ kana: "ジ", consonant: "j", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｈ",
    expansion: [
      { kana: "エ", consonant: null, vowel: "e" },
      { kana: "イ", consonant: null, vowel: "i" },
      { kana: "チ", consonant: "ch", vowel: "i" },
    ],
  },
  {
    key: "ｉ",
    expansion: [{ kana: "ア", consonant: null, vowel: "a" }, {
      kana: "イ",
      consonant: null,
      vowel: "i",
    }],
  },
  {
    key: "ｊ",
    expansion: [{ kana: "ジェ", consonant: "j", vowel: "e" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｋ",
    expansion: [{ kana: "ケ", consonant: "k", vowel: "e" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｌ",
    expansion: [{ kana: "エ", consonant: null, vowel: "e" }, {
      kana: "ル",
      consonant: "r",
      vowel: "u",
    }],
  },
  {
    key: "ｍ",
    expansion: [{ kana: "エ", consonant: null, vowel: "e" }, {
      kana: "ム",
      consonant: "m",
      vowel: "u",
    }],
  },
  {
    key: "ｎ",
    expansion: [{ kana: "エ", consonant: null, vowel: "e" }, {
      kana: "ヌ",
      consonant: "n",
      vowel: "u",
    }],
  },
  {
    key: "ｏ",
    expansion: [{ kana: "オ", consonant: null, vowel: "o" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｐ",
    expansion: [{ kana: "ピ", consonant: "p", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｑ",
    expansion: [{ kana: "キュ", consonant: "ky", vowel: "u" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｒ",
    expansion: [
      { kana: "ア", consonant: null, vowel: "a" },
      { kana: "ー", consonant: "-", vowel: "long" },
      { kana: "ル", consonant: "r", vowel: "u" },
    ],
  },
  {
    key: "ｓ",
    expansion: [{ kana: "エ", consonant: null, vowel: "e" }, {
      kana: "ス",
      consonant: "s",
      vowel: "u",
    }],
  },
  {
    key: "ｔ",
    expansion: [{ kana: "ティ", consonant: "t", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｕ",
    expansion: [{ kana: "ユ", consonant: "y", vowel: "u" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
  {
    key: "ｖ",
    expansion: [{ kana: "ブ", consonant: "b", vowel: "u" }, {
      kana: "イ",
      consonant: null,
      vowel: "i",
    }],
  },
  {
    key: "ｗ",
    expansion: [
      { kana: "ダ", consonant: "d", vowel: "a" },
      { kana: "ブ", consonant: "b", vowel: "u" },
      { kana: "リュ", consonant: "ry", vowel: "u" },
      { kana: "ー", consonant: "-", vowel: "long" },
    ],
  },
  {
    key: "ｘ",
    expansion: [
      { kana: "エ", consonant: null, vowel: "e" },
      { kana: "ッ", consonant: "cl", vowel: "cl" },
      { kana: "ク", consonant: "k", vowel: "u" },
      { kana: "ス", consonant: "s", vowel: "u" },
    ],
  },
  {
    key: "ｙ",
    expansion: [{ kana: "ワ", consonant: "w", vowel: "a" }, {
      kana: "イ",
      consonant: null,
      vowel: "i",
    }],
  },
  {
    key: "ｚ",
    expansion: [{ kana: "ズィ", consonant: "z", vowel: "i" }, {
      kana: "ー",
      consonant: "-",
      vowel: "long",
    }],
  },
];

/** kana(2文字) → expansion。最長一致の第一段で参照する。 */
const TWO_CHAR_MAP: ReadonlyMap<string, MoraSpec[]> = new Map(
  TWO_CHAR_ENTRIES.map((e) => [e.key, e.expansion]),
);

/** kana(1文字) → expansion。 */
const ONE_CHAR_MAP: ReadonlyMap<string, MoraSpec[]> = new Map(
  ONE_CHAR_ENTRIES.map((e) => [e.key, e.expansion]),
);

/** 全カナ表エントリ（テスト・検証用に外部公開）。 */
export const ALL_MORA_TABLE_ENTRIES: readonly MoraTableEntry[] = [
  ...TWO_CHAR_ENTRIES,
  ...ONE_CHAR_ENTRIES,
];

/**
 * s が「カナ表のキー1個そのもの」と完全一致するか（jpreprocess
 * Pronunciation::is_mora_convertable = MORA_STR_LIST.contains(&s) 相当）。
 * MORA_STR_LIST はカタカナ・ひらがな・全角アルファベット・不規則カタカナの
 * 4表すべてのキーを含むため、こちらも同じ4表を対象にする。
 * 連続かなフィラーの併合条件などに使う。
 */
export const isMoraString = (s: string): boolean => TWO_CHAR_MAP.has(s) || ONE_CHAR_MAP.has(s);

/**
 * 「？」単独の全角疑問符。jpreprocess の parse_mora_str は文字列全体が
 * "？" と完全一致する場合のみ Question 擬似モーラとして特別扱いする
 * （それ以外の文脈に現れる「？」は通常の非マッチ文字として Touten 化される）。
 */
const QUESTION = "？";

/** Touten 擬似モーラの正準カナ表示（jpreprocess mora.rs の Display: TOUTEN = "、"）。 */
const TOUTEN_KANA = "、";

/**
 * 無声化マーク（U+2019 RIGHT SINGLE QUOTATION MARK）。
 *
 * jpreprocess mod.rs の parse_mora_str は、カナ表にマッチした直後の位置に
 * この文字が続くかを判定し（`quotation`）、そのマッチで生成する全モーラを
 * `is_voiced: !quotation` として作る。つまりマークは独立モーラを作らず、
 * カーソル位置を1文字分余分に進めるだけ（マーク自体は出力に現れない）。
 * 全角アルファベットのように1キーが複数モーラへ展開される場合も、
 * 展開された全モーラが同じ無声化フラグを共有する（Rust 実装が
 * `.map(|mora_enum| Mora { mora_enum, is_voiced: !quotation })` で
 * 展開後の各モーラに同一の quotation を適用しているため）。
 */
const DEVOICE_MARK = "’";

/**
 * カナ文字列を jpreprocess parse_mora_str と同じアルゴリズムで走査し、
 * range セグメント列を返す共通実装。
 *
 * mora_dict::MORA_DICT_AHO_CORASICK は MatchKind::LeftmostLongest で構築
 * されている。本テーブルのキーは全て1文字または2文字のみ（3文字以上のキー
 * は存在しない）ため、「2文字キーを先に試し、なければ1文字キーを試す」
 * という決定的な走査で LeftmostLongest と等価な結果になる
 * （2文字キー同士・1文字キーとの間で prefix 衝突は存在しないことを
 * 生成データで確認済み: 373 キー全てユニーク、長さは 1 か 2 のみ）。
 *
 * - マッチしない文字が連続する区間は 1 つの pseudo:"touten" セグメント
 *   （モーラ1個。kana は原文の断片ではなく正準形 "、" 固定 — jpreprocess の
 *   Mora { mora_enum: Touten } は原文を保持せず、Display も常に "、" を
 *   返すため）にまとめる。mora_dict.rs のカナ→MoraEnum 表に Touten は
 *   存在せず、この動的な非マッチ区間の扱いが唯一の発生源であることを
 *   ソース（mod.rs の parse_mora_str）で確認済み。
 * - 文字列全体が "？" と完全一致する場合のみ pseudo:"question" の1セグメント
 *   として扱う（jpreprocess と同じ特別扱い）。
 * - マッチ直後に無声化マーク "’" が続く場合、そのマッチが生む全モーラの
 *   index をそのセグメントの devoiced に積み、マーク自体はモーラとして
 *   生成しない（DEVOICE_MARK のコメント参照）。
 * - マッチしたモーラ列とそれに続く Touten は連続していても別セグメントに
 *   分かれる（jpreprocess 原典と同じ区分。セグメント境界を保持したい
 *   呼び出し側のために range を公開する）。
 */
const scanMoraSegments = (kana: string): MoraSegment[] => {
  if (kana === QUESTION) {
    return [{
      start: 0,
      end: kana.length,
      moras: [{ kana: QUESTION, consonant: null, vowel: "", pseudo: "question" }],
      devoiced: [],
    }];
  }

  const segments: MoraSegment[] = [];
  let segmentStart = 0;
  let currentMoras: MoraSpec[] = [];
  let currentDevoiced: number[] = [];
  let currentPosition = 0;

  const flushMoraSegment = (end: number) => {
    if (currentMoras.length === 0) return;
    segments.push({ start: segmentStart, end, moras: currentMoras, devoiced: currentDevoiced });
    currentMoras = [];
    currentDevoiced = [];
    segmentStart = end;
  };
  const pushToutenSegment = (start: number, end: number) => {
    segments.push({
      start,
      end,
      moras: [{ kana: TOUTEN_KANA, consonant: null, vowel: "", pseudo: "touten" }],
      devoiced: [],
    });
  };

  let i = 0;
  while (i < kana.length) {
    const two = kana.length - i >= 2 ? kana.slice(i, i + 2) : undefined;
    const expansion = (two !== undefined ? TWO_CHAR_MAP.get(two) : undefined) ??
      ONE_CHAR_MAP.get(kana[i]);

    if (expansion === undefined) {
      i += 1;
      continue;
    }

    const matchedLength = two !== undefined && TWO_CHAR_MAP.has(two) ? 2 : 1;

    // マッチ位置の直前に非マッチ文字があれば、そこまでを1つの Touten にする。
    if (currentPosition !== i) {
      flushMoraSegment(currentPosition);
      pushToutenSegment(segmentStart, i);
      segmentStart = i;
    }

    const quotation = kana[i + matchedLength] === DEVOICE_MARK;
    if (quotation) {
      for (let k = 0; k < expansion.length; k++) currentDevoiced.push(currentMoras.length + k);
    }
    currentMoras.push(...expansion);

    currentPosition = i + matchedLength + (quotation ? DEVOICE_MARK.length : 0);
    i = currentPosition;
  }

  flushMoraSegment(currentPosition);
  if (currentPosition !== kana.length) {
    pushToutenSegment(currentPosition, kana.length);
  }

  return segments;
};

/**
 * カナ文字列をモーラ列へ最長一致分割する（jpreprocess parse_mora_str の
 * セグメント列をフラットな1本のモーラ列にまとめた簡易 API）。
 * セグメント境界（parse_mora_str の Range 単位）が必要な呼び出し側は
 * splitMorasWithRanges を使うこと。
 */
export const splitMoras = (
  kana: string,
): { moras: MoraSpec[]; devoiced: number[]; unparseable: string[] } => {
  const moras: MoraSpec[] = [];
  const devoiced: number[] = [];
  const unparseable: string[] = [];

  for (const seg of scanMoraSegments(kana)) {
    const offset = moras.length;
    moras.push(...seg.moras);
    for (const d of seg.devoiced) devoiced.push(offset + d);
    if (seg.moras.length === 1 && seg.moras[0].pseudo === "touten") {
      unparseable.push(kana.slice(seg.start, seg.end));
    }
  }

  return { moras, devoiced, unparseable };
};

/**
 * カナ文字列を jpreprocess parse_mora_str と同じ range セグメント列に分割する。
 * 各セグメントはモーラ表にマッチした連続区間、または非マッチ文字がまとまった
 * 1個の pseudo:"touten" 区間のいずれか（1セグメント1種類。混在しない）。
 */
export const splitMorasWithRanges = (kana: string): MoraSegment[] => scanMoraSegments(kana);
