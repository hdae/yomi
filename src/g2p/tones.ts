// 中立のピッチ（トーン）変換: アクセント核位置 → アクセント句内 各モーラの高低（0/1）。
// モデル非依存の一般表現（VOICEVOX/OpenJTalk 等と共通）。モデル固有のトーン梱包
// （PAD・反転規約・音素単位への割り当て等）は yomi では持たず、呼び出し側で組む
// （docs/decisions/0001）。

/**
 * アクセント句内の各モーラのトーン（0/1）を核位置から決める。
 * - 平板(k=0): 1モーラ目 0、以降 1
 * - 頭高(k=1): 1モーラ目 1、以降 0
 * - 中高/尾高(k>1): 1モーラ目 0、2..k 1、k+1 以降 0
 * 防御: 範囲外の核（辞書差・オーバーレイ由来）は尾高相当にクランプ（k = min(nucleus, len)）
 *       して fail loudly を避ける。
 */
export const moraTones = (accentNucleus: number, moraCount: number): number[] => {
  if (accentNucleus === 0) {
    // 平板: 句頭のみ低く、2モーラ目以降は高いまま下降しない。
    return Array.from({ length: moraCount }, (_, i) => (i === 0 ? 0 : 1));
  }
  // 範囲外核を尾高相当にクランプする。
  const k = Math.min(accentNucleus, moraCount);
  if (k === 1) {
    // 頭高: 1モーラ目が高く、直後に下降。
    return Array.from({ length: moraCount }, (_, i) => (i === 0 ? 1 : 0));
  }
  // 中高/尾高: 句頭で立ち上がり、核モーラ k の後で下降。
  return Array.from({ length: moraCount }, (_, i) => (i >= 1 && i + 1 <= k ? 1 : 0));
};
