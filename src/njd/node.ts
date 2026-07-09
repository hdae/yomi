// NJD ノード: トークン列に対する後処理（読み・アクセント確定）の作業単位。
// jpreprocess の NJDNode 相当。tokenizer の Token は不変だが、NJD 後段は
// ノードの分割・併合・品詞書き換えを行うため可変構造にする。

import type { MoraSpec } from "../mora_table.ts";
import type { AccentType, ChainRule, ChainRules } from "./chain_rules.ts";
import type { PosFeatures } from "./pos.ts";

// NjdNode の公開フィールドが構造的に参照するため、これらの型も公開型として再エクスポートする
// （JSR の public API 完全性チェック: 公開型が非公開型を参照することを禁止する private-type-ref 対策）。
export type { AccentType, ChainRule, ChainRules, MoraSpec, PosFeatures };

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

/** 実モーラ数（擬似モーラ Touten/Question を除く。Pronunciation::mora_size 相当）。 */
export const moraSize = (node: NjdNode): number => {
  let n = 0;
  for (const m of node.moras) if (!m.spec.pseudo) n++;
  return n;
};

/** 読点1モーラのみか（is_touten 相当。MoraEnum::Touten の種別判定）。 */
export const isTouten = (node: NjdNode): boolean =>
  node.moras.length === 1 && node.moras[0].spec.pseudo === "touten";

/** 疑問符1モーラのみか（is_question 相当）。 */
export const isQuestion = (node: NjdNode): boolean =>
  node.moras.length === 1 && node.moras[0].spec.pseudo === "question";

/** MoraSpec 列と無声化インデックス列（devoiced）から NjdMora 列を組み立てる。 */
export const makeMoras = (specs: readonly MoraSpec[], devoiced: readonly number[]): NjdMora[] => {
  const set = new Set(devoiced);
  return specs.map((spec, i) => ({ spec, voiced: !set.has(i) }));
};
