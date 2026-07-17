// ソート済み表層形リスト → LOUDS トライの各配列を構築する。
// 符号化契約は src/format/louds.ts の冒頭コメントを正とする。

import { BitWriter } from "@hdae/yomi/format";

export type LoudsBuild = {
  nodeCount: number;
  surfaceCount: number;
  lbsWords: Uint32Array;
  lbsBitLength: number;
  labels: Uint16Array;
  terminalWords: Uint32Array;
  terminalBitLength: number;
  /** surfaceOrder[surfaceId] = 入力配列（ソート済み）の index。LEXI の並び替えに使う。 */
  surfaceOrder: Uint32Array;
};

type Range = { start: number; end: number; depth: number };

/**
 * surfaces は UTF-16 コードユニット順にソート済み・重複なしであること（違反は throw）。
 * BFS でトライを走査しながら LBS・ラベル・終端ビットを一度に吐く。
 */
export const buildLouds = (surfaces: readonly string[]): LoudsBuild => {
  for (let i = 1; i < surfaces.length; i++) {
    if (surfaces[i - 1] >= surfaces[i]) {
      throw new Error(`surfaces がソート済み・重複なしでない: [${i - 1}]=${surfaces[i - 1]}`);
    }
  }
  if (surfaces.some((s) => s.length === 0)) {
    throw new Error("空文字列の表層形は登録できない");
  }

  const lbs = new BitWriter();
  const terminal = new BitWriter();
  const labels: number[] = [0]; // 根のラベルは未使用
  const surfaceOrder: number[] = [];

  // BFS キュー。ノード id はキューへの投入順（= labels への push 順）と一致する。
  const queue: Range[] = [{ start: 0, end: surfaces.length, depth: 0 }];
  let head = 0;

  while (head < queue.length) {
    const { start, end, depth } = queue[head++];

    // このノードで終端する表層形（ソート済みなので範囲先頭にしか現れない）。
    const isTerminal = start < end && surfaces[start].length === depth;
    terminal.push(isTerminal);
    if (isTerminal) surfaceOrder.push(start);

    // 子: depth 位置のコードユニットでグルーピング（ソート済みなので連続区間）。
    let i = start + (isTerminal ? 1 : 0);
    while (i < end) {
      const c = surfaces[i].charCodeAt(depth);
      let j = i + 1;
      while (j < end && surfaces[j].charCodeAt(depth) === c) j++;
      lbs.push(true);
      labels.push(c);
      queue.push({ start: i, end: j, depth: depth + 1 });
      i = j;
    }
    lbs.push(false);
  }

  const nodeCount = queue.length;
  return {
    nodeCount,
    surfaceCount: surfaces.length,
    lbsWords: lbs.toWords(),
    lbsBitLength: lbs.bitLength,
    labels: Uint16Array.from(labels),
    terminalWords: terminal.toWords(),
    terminalBitLength: terminal.bitLength,
    surfaceOrder: Uint32Array.from(surfaceOrder),
  };
};
