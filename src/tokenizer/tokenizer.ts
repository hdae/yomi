// 公開トークナイザ API: ラティス最小コスト経路 → トークン列。
//
// 複合語エントリ（複数ユニット）は jpreprocess の WordEntry::Multiple と同様に
// ユニットごとの別トークンへ展開する（golden の NJD ノード単位と1:1になる）。

import type { JtdDictionary } from "../dict/dictionary.ts";
import type { OverlayDictionary } from "../dict/overlay.ts";
import type { Token } from "./types.ts";
import { tokenizeToNodes } from "./lattice.ts";
import { normalizeForDict, splitFragments } from "../text/normalize.ts";

const NO_ACCENT = 255;

/**
 * テキスト → トークン列。内部で jpreprocess 互換の正規化（normalizeForDict）と
 * 文分割（。、\n\t、断片ごとに BOS/EOS リセット）を行う。
 * Token.start/end は**正規化後テキスト**上のオフセット（正規化は文字を増減させ
 * うるため原文オフセットとは一致しない。原文対応が要る場合は normalizeForDict を
 * 呼び出し側でも適用する）。
 */
export const tokenize = (
  dict: JtdDictionary,
  text: string,
  overlay?: OverlayDictionary,
): Token[] => {
  const normalized = normalizeForDict(text);
  const spaceCatId = dict.charCategories.findIndex((c) => c.name === "SPACE");
  // lindera keep_whitespace=false 互換: 全文字が SPACE カテゴリを持つトークンは
  // 出力から除去する（正規化後の入力では \t 等のみが該当。U+3000 は SYMBOL なので残る）。
  const catsBuf: number[] = [0, 0, 0, 0];
  const isSpaceOnly = (s: string): boolean => {
    if (spaceCatId < 0) return false;
    for (const ch of s) {
      const n = dict.charCategoriesOf(ch.codePointAt(0)!, catsBuf);
      let has = false;
      for (let i = 0; i < n; i++) if (catsBuf[i] === spaceCatId) has = true;
      if (!has) return false;
    }
    return s.length > 0;
  };

  const path: ReturnType<typeof tokenizeToNodes> = [];
  for (const f of splitFragments(normalized)) {
    for (const node of tokenizeToNodes(dict, normalized.slice(f.start, f.end), overlay)) {
      if (isSpaceOnly(normalized.slice(node.start + f.start, node.end + f.start))) continue;
      path.push({ ...node, start: node.start + f.start, end: node.end + f.start });
    }
  }
  const tokens: Token[] = [];

  for (const node of path) {
    if (node.overlayIdx >= 0 && overlay !== undefined) {
      // 修正辞書エントリ: 1エントリ = 1トークン（複合語ユニットなし）。
      const e = overlay.entries[node.overlayIdx];
      tokens.push({
        surface: normalized.slice(node.start, node.end),
        start: node.start,
        end: node.end,
        pos: e.pos,
        pron: e.reading.replaceAll("’", ""),
        pronRaw: e.reading,
        accType: e.accentType,
        chainRule: e.chainRule === "*" ? undefined : e.chainRule,
        isUnknown: false,
      });
      continue;
    }
    if (node.entryIdx < 0) {
      // 未知語: unk.def テンプレートの素性のみ。
      tokens.push({
        surface: normalized.slice(node.start, node.end),
        start: node.start,
        end: node.end,
        pos: dict.meta.posTable[dict.unkPosId[node.unkIdx]],
        isUnknown: true,
      });
      continue;
    }

    const e = node.entryIdx;
    const uFrom = dict.unitIndex[e];
    const uTo = dict.unitIndex[e + 1];
    const pos = dict.meta.posTable[dict.posId[e]];
    const chainRule = dict.meta.chainRuleTable[dict.chainRuleId[e]];

    let cursor = node.start;
    for (let u = uFrom; u < uTo; u++) {
      // unitSurfLen=0 は「残り全部」（最終ユニット）。
      const len = dict.unitSurfLen[u];
      const end = len === 0 ? node.end : cursor + len;
      const accType = dict.unitAccType[u];
      tokens.push({
        surface: normalized.slice(cursor, end),
        start: cursor,
        end,
        pos,
        pron: dict.unitPron(u),
        pronRaw: dict.unitPronRaw(u),
        accType: accType === NO_ACCENT ? undefined : accType,
        chainRule: chainRule === "*" ? undefined : chainRule,
        chainFlag: u === uFrom ? undefined : false,
        isUnknown: false,
      });
      cursor = end;
    }
  }

  return tokens;
};
