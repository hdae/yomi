// succinct ビット列: rank/select 付き読み取り専用ビットベクトル。
// LOUDS トライ（louds.ts）の土台。
//
// 設計: ビット本体は Uint32Array をゼロコピー参照し、rank ディレクトリ
// （256bit = 8ワードごとの累積 popcount）だけをロード時に構築する。
// 補助構造は本体の 12.5% 程度で、486k 語の辞書でも構築は 1ms 級 —
// ファイルに焼くよりフォーマットが単純になる方を取る（jtd1-format.md）。

/** 32bit ワードの popcount（ビット並列、分岐なし）。 */
export const popcount32 = (v: number): number => {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (v * 0x01010101) >>> 24;
};

const WORDS_PER_BLOCK = 8; // 256 bits

export class BitVector {
  readonly words: Uint32Array;
  readonly bitLength: number;
  /** blockRank1[b] = ブロック b の先頭までの 1 の総数。 */
  private readonly blockRank1: Uint32Array;
  private readonly totalOnes: number;

  constructor(words: Uint32Array, bitLength: number) {
    if (bitLength > words.length * 32) {
      throw new Error(`bitLength ${bitLength} が words の容量を超えている`);
    }
    // 末尾ワードの余りビットが 0 でないと rank/select が壊れる。
    // 書き手のバグを黙って通さない（fail loudly）。
    const rem = bitLength & 31;
    if (rem !== 0 && bitLength > 0) {
      const lastWord = words[(bitLength - 1) >>> 5];
      if ((lastWord >>> rem) !== 0) {
        throw new Error("ビット長を超えた位置に 1 が立っている（書き手のバグ）");
      }
    }
    this.words = words;
    this.bitLength = bitLength;

    const nBlocks = Math.ceil(words.length / WORDS_PER_BLOCK) + 1;
    this.blockRank1 = new Uint32Array(nBlocks);
    let acc = 0;
    for (let b = 0; b * WORDS_PER_BLOCK < words.length; b++) {
      this.blockRank1[b] = acc;
      const end = Math.min((b + 1) * WORDS_PER_BLOCK, words.length);
      for (let w = b * WORDS_PER_BLOCK; w < end; w++) acc += popcount32(words[w]);
    }
    this.blockRank1[this.blockRank1.length - 1] = acc;
    this.totalOnes = acc;
  }

  get(pos: number): boolean {
    return ((this.words[pos >>> 5] >>> (pos & 31)) & 1) === 1;
  }

  /** [0, pos) にある 1 の個数。pos は bitLength まで許す。 */
  rank1(pos: number): number {
    if (pos <= 0) return 0;
    if (pos >= this.bitLength) return this.totalOnes;
    const word = pos >>> 5;
    const block = (word / WORDS_PER_BLOCK) | 0;
    let r = this.blockRank1[block];
    for (let w = block * WORDS_PER_BLOCK; w < word; w++) r += popcount32(this.words[w]);
    const rem = pos & 31;
    if (rem !== 0) r += popcount32(this.words[word] & ((1 << rem) - 1));
    return r;
  }

  rank0(pos: number): number {
    const p = Math.min(Math.max(pos, 0), this.bitLength);
    return p - this.rank1(p);
  }

  get ones(): number {
    return this.totalOnes;
  }

  /** k 番目（1-indexed）の 1 のビット位置。存在しなければ -1。 */
  select1(k: number): number {
    if (k <= 0 || k > this.totalOnes) return -1;
    // ブロック二分探索 → ワード線形走査 → ワード内走査。
    let lo = 0, hi = this.blockRank1.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.blockRank1[mid] < k) lo = mid;
      else hi = mid;
    }
    let remaining = k - this.blockRank1[lo];
    for (let w = lo * WORDS_PER_BLOCK; w < this.words.length; w++) {
      const pc = popcount32(this.words[w]);
      if (remaining > pc) {
        remaining -= pc;
        continue;
      }
      return w * 32 + selectInWord(this.words[w], remaining);
    }
    return -1;
  }

  /** k 番目（1-indexed）の 0 のビット位置。存在しなければ -1。 */
  select0(k: number): number {
    if (k <= 0 || k > this.bitLength - this.totalOnes) return -1;
    // rank0 はブロック表から導ける: zeros(b) = b*256 - blockRank1[b]。
    let lo = 0, hi = this.blockRank1.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      const zerosBefore = mid * WORDS_PER_BLOCK * 32 - this.blockRank1[mid];
      if (zerosBefore < k) lo = mid;
      else hi = mid;
    }
    let remaining = k - (lo * WORDS_PER_BLOCK * 32 - this.blockRank1[lo]);
    for (let w = lo * WORDS_PER_BLOCK; w < this.words.length; w++) {
      const pc0 = 32 - popcount32(this.words[w]);
      if (remaining > pc0) {
        remaining -= pc0;
        continue;
      }
      return w * 32 + selectInWord(~this.words[w] >>> 0, remaining);
    }
    return -1;
  }
}

/** ワード内で k 番目（1-indexed）の 1 のビット位置（0..31）。 */
const selectInWord = (word: number, k: number): number => {
  let v = word;
  for (let i = 1; i < k; i++) v &= v - 1; // 下位の 1 を k-1 個消す
  // 最下位の 1 の位置
  return 31 - Math.clz32(v & -v);
};

/** ビット列の書き手（dict-builder 用）。push したビットを Uint32Array に固める。 */
export class BitWriter {
  private words: number[] = [];
  private len = 0;

  push(bit: boolean): void {
    const w = this.len >>> 5;
    if (w >= this.words.length) this.words.push(0);
    if (bit) this.words[w] |= 1 << (this.len & 31);
    this.len++;
  }

  get bitLength(): number {
    return this.len;
  }

  toWords(): Uint32Array {
    return Uint32Array.from(this.words);
  }
}
