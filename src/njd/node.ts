// NJD ノード: トークン列に対する後処理（読み・アクセント確定）の作業単位。
// jpreprocess の NJDNode 相当。tokenizer の Token は不変だが、NJD 後段は
// ノードの分割・併合・品詞書き換えを行うため可変構造にする。

import type { MoraSpec } from "../text/types.ts";
import type { NjdMora, NjdNode } from "./types.ts";

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
