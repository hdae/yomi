// ラティス構築 + Viterbi 最小コスト経路（lindera 3.0.7 viterbi.rs 互換）。
// 仕様の根拠: jp-oracle が使う lindera の実装を精査した互換仕様
// （オラクル互換の MUST。要点は以下に列挙、詳細は docs/tokenizer-compat.md）。
//
// - 入力は normalize.ts の正規化・文分割済み「断片」。BOS/EOS は断片ごとにリセット
// - 到達不能な開始位置（そこで終わるエッジが無い）では既知語・未知語とも生成しない
// - 未知語は invoke=1(常時) / invoke=0(既知語ゼロの位置のみ)。group=1 は同カテゴリ
//   （同じ category_ord 位置に同じカテゴリを持つ文字）を長さ上限なしで1語化、
//   group=0 は1文字。候補長は「1文字 or group最大長」の1通りのみ
// - unknown_word_end: 未知語で埋めた区間の内側では未知語を再生成しない（既知語は張る）
// - コスト: conn(左エッジ.rightId, 注目エッジ.leftId) + 語コスト。同点は先に追加された
//   エッジが勝つ（厳密 < 比較）。BOS/EOS の文脈 ID = 0

import type { JtdDictionary } from "./dictionary.ts";
import type { OverlayDictionary } from "./overlay.ts";

export type LatticeNode = {
  start: number;
  end: number;
  /** LEXI エントリ index。未知語は -1。 */
  entryIdx: number;
  /** UNKD レコード index。既知語は -1。 */
  unkIdx: number;
  /** 修正辞書エントリ index。オーバーレイ由来のみ >=0。 */
  overlayIdx: number;
  leftId: number;
  rightId: number;
  wordCost: number;
};

/** サロゲートペア先頭なら 2、それ以外 1（コードポイント単位の歩幅）。 */
const charLen = (text: string, p: number): number => {
  const c = text.charCodeAt(p);
  if (c >= 0xd800 && c <= 0xdbff && p + 1 < text.length) {
    const d = text.charCodeAt(p + 1);
    if (d >= 0xdc00 && d <= 0xdfff) return 2;
  }
  return 1;
};

/**
 * 正規化済み断片を解析し、最小コスト経路のノード列を返す（BOS/EOS は含まない）。
 */
export const tokenizeToNodes = (
  dict: JtdDictionary,
  text: string,
  overlay?: OverlayDictionary,
): LatticeNode[] => {
  const n = text.length;
  if (n === 0) return [];

  const nodes: LatticeNode[] = [];
  // endsAt[p] = 位置 p で終わるノードの index 列（push 順 = 追加順 = タイブレーク順）。
  const endsAt: number[][] = Array.from({ length: n + 1 }, () => []);
  const total: number[] = [];
  const prev: number[] = [];

  // ノード追加と同時に前向き Viterbi の緩和を行う（lindera add_edge_in_lattice 相当。
  // 開始位置昇順で追加するため、先行ノードのコストは確定済み）。
  const addNode = (node: LatticeNode) => {
    let best = Infinity;
    let bestPrev = -2;
    if (node.start === 0) {
      // BOS: rightId=0, path_cost=0。endsAt[0] の唯一の要素として最初に評価される。
      best = dict.connectionCost(0, node.leftId);
      bestPrev = -1;
    } else {
      for (const pi of endsAt[node.start]) {
        const c = total[pi] + dict.connectionCost(nodes[pi].rightId, node.leftId);
        if (c < best) {
          best = c;
          bestPrev = pi;
        }
      }
    }
    if (bestPrev === -2) throw new Error("到達不能位置へのノード追加（内部不変条件違反）");
    const i = nodes.length;
    nodes.push(node);
    total.push(best + node.wordCost);
    prev.push(bestPrev);
    endsAt[node.end].push(i);
  };

  const catsBuf: number[] = [0, 0, 0, 0];
  let unknownWordEnd = -1;

  let p = 0;
  while (p < n) {
    const step = charLen(text, p);
    // 到達不能な開始位置では何も生成しない（unknownWordEnd の進行も lindera と一致させる）。
    if (p > 0 && endsAt[p].length === 0) {
      p += step;
      continue;
    }

    // ---- 既知語 ----
    let found = false;
    dict.trie.commonPrefixSearch(text, p, (surfaceId, end) => {
      const from = dict.entryIndex[surfaceId];
      const to = dict.entryIndex[surfaceId + 1];
      for (let e = from; e < to; e++) {
        addNode({
          start: p,
          end,
          entryIdx: e,
          unkIdx: -1,
          overlayIdx: -1,
          leftId: dict.leftId[e],
          rightId: dict.rightId[e],
          wordCost: dict.cost[e],
        });
        found = true;
      }
    });

    // ---- 修正辞書オーバーレイ（本辞書と同格の既知語として参加）----
    if (overlay !== undefined) {
      overlay.lookup(text, p, (oi, end) => {
        const e = overlay.entries[oi];
        addNode({
          start: p,
          end,
          entryIdx: -1,
          unkIdx: -1,
          overlayIdx: oi,
          leftId: e.leftId,
          rightId: e.rightId,
          wordCost: e.cost,
        });
        found = true;
      });
    }

    // ---- 未知語 ----
    if (unknownWordEnd <= p) {
      const cp = step === 2 ? text.codePointAt(p)! : text.charCodeAt(p);
      const catCount = dict.charCategoriesOf(cp, catsBuf);
      for (let ord = 0; ord < catCount; ord++) {
        const catId = catsBuf[ord];
        const cat = dict.charCategories[catId];
        if (!cat.invoke && found) continue;

        // 候補長は1通り: group=1 なら同カテゴリ連続の最大長、group=0 なら1文字。
        let end = p + step;
        if (cat.group) {
          const qBuf: number[] = [0, 0, 0, 0];
          let q = end;
          while (q < n) {
            const qStep = charLen(text, q);
            const qcp = qStep === 2 ? text.codePointAt(q)! : text.charCodeAt(q);
            const qCount = dict.charCategoriesOf(qcp, qBuf);
            // 継続判定は「同じ category_ord 位置に同じカテゴリがあるか」。
            if (ord < qCount && qBuf[ord] === catId) q += qStep;
            else break;
          }
          end = q;
        }

        const rFrom = dict.unkCatIndex[catId];
        const rTo = dict.unkCatIndex[catId + 1];
        for (let r = rFrom; r < rTo; r++) {
          addNode({
            start: p,
            end,
            entryIdx: -1,
            unkIdx: r,
            overlayIdx: -1,
            leftId: dict.unkLeftId[r],
            rightId: dict.unkRightId[r],
            wordCost: dict.unkCost[r],
          });
        }
        if (rTo > rFrom) unknownWordEnd = end;
      }
    }

    p += step;
  }

  // ---- EOS（leftId=0）へ接続 ----
  let best = -1;
  let bestCost = Infinity;
  for (const i of endsAt[n]) {
    const c = total[i] + dict.connectionCost(nodes[i].rightId, 0);
    if (c < bestCost) {
      bestCost = c;
      best = i;
    }
  }
  if (best < 0) throw new Error(`経路が存在しない（内部不変条件違反）: ${text.slice(0, 30)}`);

  const path: LatticeNode[] = [];
  for (let i = best; i >= 0; i = prev[i]) path.push(nodes[i]);
  return path.reverse();
};
