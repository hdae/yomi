// Token 列 → NJD ノード列（jpreprocess NJD::from_tokens / NJDNode::load 相当）。
// 既知語は辞書の生発音列（’ 含む）をモーラ化し、未知語は空モーラで作る
// （表層からのモーラ化は njd_set_pronunciation の責務）。

import type { Token } from "../tokenizer/types.ts";
import { splitMorasWithRanges } from "../text/mora_table.ts";
import { parseChainRules } from "./chain_rules.ts";
import { makeMoras } from "./node.ts";
import type { NjdNode } from "./types.ts";

/** Token 列 → NJD ノード列（jpreprocess NJD::from_tokens / NJDNode::load 相当）。 */
export const nodesFromTokens = (tokens: readonly Token[]): NjdNode[] => {
  const nodes: NjdNode[] = [];
  for (const t of tokens) {
    if (t.isUnknown || t.pronRaw === undefined) {
      nodes.push({
        surface: t.surface,
        pos: [...t.pos],
        moras: [],
        pronOrig: "",
        accent: 0,
        chainRule: null,
        chainFlag: undefined,
        isUnknown: true,
      });
      continue;
    }

    // 辞書の発音列は単一 range でモーラ化できることをビルド時データが保証している
    // （jpreprocess parse_csv_pron は複数 range をエラーにする）。崩れたら fail loudly。
    const segs = t.pronRaw === "*" ? [] : splitMorasWithRanges(t.pronRaw);
    if (segs.length > 1) {
      throw new Error(`辞書発音列が単一rangeでない: ${t.surface} / ${t.pronRaw}`);
    }
    const seg = segs[0];
    nodes.push({
      surface: t.surface,
      pos: [...t.pos],
      moras: seg === undefined ? [] : makeMoras(seg.moras, seg.devoiced),
      pronOrig: seg === undefined ? "" : seg.moras.map((m) => m.kana).join(""),
      accent: t.accType ?? 0,
      chainRule: t.chainRule !== undefined ? parseChainRules(t.chainRule) : null,
      chainFlag: t.chainFlag,
      isUnknown: false,
    });
  }
  return nodes;
};
