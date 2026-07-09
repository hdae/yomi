// フロントエンドの最上位 API: テキスト → 中間表現（読み＋アクセント＋句境界）。
// njd（NJD ノード生成）と g2p（結果組み立て）を合成する薄いパス。

import type { JtdDictionary } from "./dict/dictionary.ts";
import type { OverlayDictionary } from "./dict/overlay.ts";
import { normalizeForDict } from "./text/normalize.ts";
import { analyzeToNodes } from "./njd/frontend.ts";
import { buildResult } from "./g2p/result.ts";
import type { FrontendResult } from "./g2p/types.ts";

/** テキスト → FrontendResult（読み・アクセント核・句境界を持つ中間表現）。 */
export const analyze = (
  dict: JtdDictionary,
  text: string,
  overlay?: OverlayDictionary,
): FrontendResult => {
  return buildResult(normalizeForDict(text), analyzeToNodes(dict, text, overlay));
};
