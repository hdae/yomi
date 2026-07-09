// ルール定数（jpreprocess の NJDNode::new_single に渡される CSV 行）から
// NjdNode を生成する。Rust 側の定数文字列を改変せずそのまま使うための互換パーサ。
// 形式: surface,品詞,細1,細2,細3,活用型,活用形,原形,読み,発音,核/モーラ数,結合規則[,chain_flag]

import { splitMorasWithRanges } from "../text/mora_table.ts";
import { parseChainRules } from "./chain_rules.ts";
import { makeMoras } from "./node.ts";
import type { NjdNode } from "./types.ts";

/** ルール定数（CSV 行）から NjdNode を生成する（jpreprocess NJDNode::new_single 互換）。 */
export const makeRuleNode = (line: string): NjdNode => {
  const f = line.split(",");
  if (f.length < 12 || f.length > 13) {
    throw new Error(`ルール行の列数が不正: ${line}`);
  }
  const pron = f[9];
  const accHead = f[10].split("/")[0];
  const accent = accHead === "*" || accHead === "" ? 0 : Number(accHead);
  if (!Number.isInteger(accent)) throw new Error(`ルール行の核が不正: ${line}`);

  const segs = pron === "*" ? [] : splitMorasWithRanges(pron);
  if (segs.length > 1) throw new Error(`ルール行の発音が単一rangeでない: ${line}`);

  const chainFlag = f[12] === "1" ? true : f[12] === "0" ? false : undefined;

  return {
    surface: f[0],
    pos: [f[1], f[2], f[3], f[4], f[5], f[6]],
    moras: segs.length === 1 ? makeMoras(segs[0].moras, segs[0].devoiced) : [],
    pronOrig: segs.length === 1 ? segs[0].moras.map((m) => m.kana).join("") : "",
    accent,
    chainRule: parseChainRules(f[11] ?? "*"),
    chainFlag,
    isUnknown: false,
  };
};

/** ノードを無音化する（Rust NJDNode::reset。remove_silent で除去される状態）。 */
export const resetNode = (node: NjdNode): void => {
  node.surface = "";
  node.moras = [];
  node.pronOrig = "";
  node.accent = 0;
  node.chainRule = null;
  node.chainFlag = undefined;
  node.pos = ["*", "*", "*", "*", "*", "*"];
};

/** 発音をカナ文字列＋核で置き換える（Rust set_pron(pron!(...)) 相当）。 */
export const setPron = (node: NjdNode, kana: string, accent: number): void => {
  const segs = splitMorasWithRanges(kana);
  if (segs.length !== 1) throw new Error(`内部エラー: ${kana} がモーラ分割できない`);
  node.moras = makeMoras(segs[0].moras, segs[0].devoiced);
  node.accent = accent;
};
