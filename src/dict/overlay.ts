// 修正辞書オーバーレイ: 誤読を JSON 1行で直すための追加語彙。
//
// - エントリはラティスに低コスト（既定 -10000、jpreprocess ユーザー辞書と同じ強さ）で
//   参加し、本辞書の候補より優先されやすくなる
// - 文脈ID（連接コスト行列の行/列）は「同じ品詞素性を持つ本辞書の代表エントリ」から
//   解決する（行列に無い新IDを発明しない = 連接コストが常に定義される）
// - ホットリロード: このオブジェクトは不変。エントリ数百程度なら構築は1ms級なので、
//   変更のたびに作り直して差し替える（可変状態を持たないことで競合を構造的に排除）

import type { JtdDictionary } from "./dictionary.ts";
import type { OverlayEntry, ResolvedOverlayEntry } from "./types.ts";
import { normalizeForDict } from "../text/normalize.ts";
import { splitMorasWithRanges } from "../text/mora_table.ts";

const DEFAULT_POS = ["名詞", "固有名詞", "一般"] as const;
const DEFAULT_COST = -10000;

/** 解決済み修正辞書。表層からのエントリ検索（common prefix search）を提供する。 */
export class OverlayDictionary {
  /** 解決済みエントリ列（ラティスノードの overlayIdx が指す配列）。 */
  readonly entries: ResolvedOverlayEntry[];
  /** 表層の最大長（UTF-16）。lookup の走査上限。 */
  private readonly maxLen: number;
  /** 表層 → エントリ index 列。 */
  private readonly bySurface: Map<string, number[]>;

  /** OverlayEntry 配列を本辞書に対して解決し、表層検索用の索引を構築する。 */
  constructor(dict: JtdDictionary, entries: readonly OverlayEntry[]) {
    this.entries = entries.map((e) => resolveEntry(dict, e));
    this.bySurface = new Map();
    let maxLen = 0;
    this.entries.forEach((e, i) => {
      const list = this.bySurface.get(e.surface);
      if (list) list.push(i);
      else this.bySurface.set(e.surface, [i]);
      maxLen = Math.max(maxLen, e.surface.length);
    });
    this.maxLen = maxLen;
  }

  /** text[from..] を接頭辞に持つ全エントリを列挙する（common prefix search 相当）。 */
  lookup(text: string, from: number, onHit: (entryIdx: number, end: number) => void): void {
    const limit = Math.min(text.length, from + this.maxLen);
    for (let end = from + 1; end <= limit; end++) {
      const hits = this.bySurface.get(text.slice(from, end));
      if (hits === undefined) continue;
      for (const i of hits) onHit(i, end);
    }
  }
}

const resolveEntry = (dict: JtdDictionary, e: OverlayEntry): ResolvedOverlayEntry => {
  // fail loudly の検証（黙って壊れた修正エントリを積まない）。
  if (e.surface.length === 0) throw new Error("overlay: surface が空");
  const normalized = normalizeForDict(e.surface);
  if (normalized !== e.surface) {
    throw new Error(
      `overlay: surface は正規化済み形で与えること: ${JSON.stringify(e.surface)} → ${
        JSON.stringify(normalized)
      }`,
    );
  }
  const segs = splitMorasWithRanges(e.reading);
  if (segs.length !== 1 || segs[0].start !== 0 || segs[0].end !== e.reading.length) {
    throw new Error(`overlay: reading がモーラ分割できない: ${e.surface} / ${e.reading}`);
  }
  const moraCount = segs[0].moras.filter((m) => !m.pseudo).length;
  if (!Number.isInteger(e.accentType) || e.accentType < 0 || e.accentType > moraCount) {
    throw new Error(
      `overlay: accentType ${e.accentType} が 0..${moraCount} の範囲外: ${e.surface}`,
    );
  }

  const pos = e.pos ?? DEFAULT_POS;
  const { posId, leftId, rightId } = resolveContextIds(dict, pos);
  const fullPos = dict.meta.posTable[posId];

  return {
    surface: e.surface,
    reading: e.reading,
    accentType: e.accentType,
    chainRule: e.accentConnRule ?? "*",
    pos: fullPos,
    cost: e.cost ?? DEFAULT_COST,
    leftId,
    rightId,
  };
};

/**
 * 品詞素性（前方一致、"*" はワイルドカード）に合う本辞書の代表エントリを探し、
 * その文脈IDを借りる。連接コスト行列に存在するIDのみ使うための設計。
 */
const resolveContextIds = (
  dict: JtdDictionary,
  pos: readonly string[],
): { posId: number; leftId: number; rightId: number } => {
  const matches = (candidate: readonly string[]): boolean => {
    for (let i = 0; i < pos.length; i++) {
      if (pos[i] !== "*" && candidate[i] !== pos[i]) return false;
    }
    return true;
  };
  const posId = dict.meta.posTable.findIndex(matches);
  if (posId < 0) {
    throw new Error(`overlay: 品詞 [${pos.join(",")}] が本辞書の posTable に存在しない`);
  }
  for (let e = 0; e < dict.posId.length; e++) {
    if (dict.posId[e] === posId) {
      return { posId, leftId: dict.leftId[e], rightId: dict.rightId[e] };
    }
  }
  throw new Error(`overlay: 品詞 [${pos.join(",")}] の代表エントリが見つからない`);
};

/** JSON 文字列からの構築（ファイル/ネットワーク経由のロード用）。 */
export const loadOverlay = (dict: JtdDictionary, json: string): OverlayDictionary => {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("overlay: JSON はエントリ配列であること");
  return new OverlayDictionary(dict, parsed as OverlayEntry[]);
};
