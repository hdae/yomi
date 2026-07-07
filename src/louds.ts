// LOUDS トライ（読み取り専用）: 表層形 → surfaceId の索引。
//
// ## 符号化（builder 側と共有する契約）
//
// - ノードは BFS 順に 0..nodeCount-1 の id を持つ（0 = 根）
// - LBS: ノード v の子数 d_v を BFS 順に unary（'1'*d_v + '0'）で並べる。
//   スーパールートは置かない。ブロック v（v番目の0の直後〜v+1番目の0）が
//   ノード v の子エッジ列
// - エッジラベルは UTF-16 コードユニット。labels[childId] がそのノードへの
//   入エッジのラベル（根 labels[0] は未使用の 0）
// - 同一ノードの子はラベル昇順 → 子 id は連続 → ラベル配列上で二分探索できる
// - terminal[v] = 1 なら表層形の終端。surfaceId = terminal の rank1 順（BFS 順）
//
// サロゲートペアは 2 コードユニットの2エッジとして自然に扱える（分割しても
// 完全一致検索の正しさは保たれるため、非BMPを特別扱いしない）。

import type { BitVector } from "./bits.ts";

export type PrefixHit = {
  surfaceId: number;
  /** 検索開始位置からではなく、文字列先頭からの終端 index（排他）。 */
  end: number;
};

export class LoudsTrie {
  readonly nodeCount: number;
  readonly surfaceCount: number;
  private readonly lbs: BitVector;
  private readonly labels: Uint16Array;
  private readonly terminal: BitVector;

  constructor(
    lbs: BitVector,
    labels: Uint16Array,
    terminal: BitVector,
    nodeCount: number,
    surfaceCount: number,
  ) {
    if (labels.length !== nodeCount) {
      throw new Error(`labels 長 ${labels.length} != nodeCount ${nodeCount}`);
    }
    if (terminal.ones !== surfaceCount) {
      throw new Error(`terminal の 1 の数 ${terminal.ones} != surfaceCount ${surfaceCount}`);
    }
    this.lbs = lbs;
    this.labels = labels;
    this.terminal = terminal;
    this.nodeCount = nodeCount;
    this.surfaceCount = surfaceCount;
  }

  /** ノード v の子ブロックの開始ビット位置。 */
  private blockStart(v: number): number {
    return v === 0 ? 0 : this.lbs.select0(v) + 1;
  }

  /** ノード v の、ラベル c を持つ子ノード id。無ければ -1。 */
  child(v: number, c: number): number {
    const start = this.blockStart(v);
    const end = this.lbs.select0(v + 1); // ブロック終端の 0 の位置
    const degree = end - start;
    if (degree <= 0) return -1;
    const first = this.lbs.rank1(start) + 1; // 子 id は連続
    // labels[first .. first+degree) はラベル昇順 → 二分探索。
    let lo = 0, hi = degree - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const l = this.labels[first + mid];
      if (l === c) return first + mid;
      if (l < c) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  /** ノード v が表層形の終端なら surfaceId、でなければ -1。 */
  surfaceIdAt(v: number): number {
    if (!this.terminal.get(v)) return -1;
    return this.terminal.rank1(v + 1) - 1;
  }

  /**
   * common prefix search: text[from..] を接頭辞に持つ登録表層形をすべて列挙する。
   * ラティス構築のホットパスなので割り当てを避け、コールバックで返す。
   */
  commonPrefixSearch(
    text: string,
    from: number,
    onHit: (surfaceId: number, end: number) => void,
  ): void {
    let v = 0;
    for (let i = from; i < text.length; i++) {
      v = this.child(v, text.charCodeAt(i));
      if (v < 0) return;
      const sid = this.surfaceIdAt(v);
      if (sid >= 0) onHit(sid, i + 1);
    }
  }

  /** 完全一致検索（テスト・デバッグ用）。 */
  exactMatch(surface: string): number {
    let v = 0;
    for (let i = 0; i < surface.length; i++) {
      v = this.child(v, surface.charCodeAt(i));
      if (v < 0) return -1;
    }
    return this.surfaceIdAt(v);
  }
}
