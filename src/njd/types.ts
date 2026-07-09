// njd ドメインの型定義（値・実装から分離）。
// 品詞素性・アクセント結合規則・NJD ノードの言語モデル型。

import type { MoraSpec } from "../text/types.ts";

/** 辞書の品詞素性 [品詞, 細分類1, 細分類2, 細分類3, 活用型, 活用形] を表す文字列配列。 */
export type PosFeatures = string[];

/** アクセント結合型（jpreprocess AccentType 相当。F/C/P + 数字、または規則なしの "none"）。 */
export type AccentType =
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5"
  | "C1"
  | "C2"
  | "C3"
  | "C4"
  | "C5"
  | "P1"
  | "P2"
  | "P6"
  | "P14"
  | "none";

/** 1つの結合規則（結合型 + 加算値）。 */
export type ChainRule = {
  accentType: AccentType;
  addType: number;
};

/** 前語の品詞スロット別に選べるアクセント結合規則の集合（parseChainRules の戻り値）。 */
export type ChainRules = {
  default?: ChainRule;
  doushi?: ChainRule;
  joshi?: ChainRule;
  keiyoushi?: ChainRule;
  meishi?: ChainRule;
};

/** モーラ1個分の NJD 表現（音韻情報 + 無声化フラグ）。 */
export type NjdMora = {
  /** モーラの音韻情報（カナ・子音・母音・擬似モーラ種別）。 */
  spec: MoraSpec;
  /** 母音無声化。dict の ’ 由来は最初から false。njd_set_unvoiced_vowel が確定する。 */
  voiced: boolean;
};

/** NJD ノード。トークンを起点に品詞・モーラ・アクセントを可変に保持する後処理単位。 */
export type NjdNode = {
  /** 表層文字列（正規化後）。 */
  surface: string;
  /** 可変の品詞素性（convert_to_kigou が書き換える）。 */
  pos: PosFeatures;
  /** 擬似モーラ（読点・？等）を含むモーラ列。 */
  moras: NjdMora[];
  /**
   * ノード生成時点の発音カナ（不変）。Rust の read 欄の代用。
   * class3 照合（digit.ts）が使う — 現在の発音は class2 の連濁で変異するため、
   * 変異前の値をキーにしないと Rust（readキー）と挙動がずれる。
   */
  pronOrig: string;
  /** アクセント核位置（語単位 → njd_set_accent_type が句先頭ノードを更新）。 */
  accent: number;
  /** この語のアクセント結合規則（辞書の chain_rule 欄をパースしたもの）。null は規則なし。 */
  chainRule: ChainRules | null;
  /** undefined = 未設定(-1)。njd_set_accent_phrase が確定する。 */
  chainFlag: boolean | undefined;
  /** 未知語由来のノードか。 */
  isUnknown: boolean;
};
