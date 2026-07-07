import { BitVector, BitWriter, popcount32 } from "./bits.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

/** 素朴な参照実装と突き合わせるためのランダムビット列（シード付きで決定的）。 */
const makeRandomBits = (n: number, seed: number): boolean[] => {
  let s = seed >>> 0;
  const next = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, () => next() < 0.5);
};

const buildVector = (bits: boolean[]): BitVector => {
  const w = new BitWriter();
  for (const b of bits) w.push(b);
  return new BitVector(w.toWords(), w.bitLength);
};

Deno.test("popcount32 は全ビットパターンの代表値で正しい", () => {
  assert(popcount32(0) === 0, "0");
  assert(popcount32(0xffffffff) === 32, "全1");
  assert(popcount32(0x80000000) === 1, "最上位のみ");
  assert(popcount32(0x0f0f0f0f) === 16, "交互ニブル");
});

Deno.test("rank/select が素朴な参照実装と一致する（境界含む3サイズ×決定的ランダム）", () => {
  // 32/256 の境界をまたぐサイズを選ぶ（ワード境界・ブロック境界のオフバイワン検出）。
  for (const n of [1, 31, 32, 33, 255, 256, 257, 1000, 5000]) {
    const bits = makeRandomBits(n, n * 7 + 1);
    const bv = buildVector(bits);

    let ones = 0;
    for (let i = 0; i <= n; i++) {
      assert(bv.rank1(i) === ones, `rank1(${i}) n=${n}`);
      assert(bv.rank0(i) === i - ones, `rank0(${i}) n=${n}`);
      if (i < n && bits[i]) ones++;
    }

    let k1 = 0, k0 = 0;
    for (let i = 0; i < n; i++) {
      if (bits[i]) {
        k1++;
        assert(bv.select1(k1) === i, `select1(${k1}) n=${n}`);
      } else {
        k0++;
        assert(bv.select0(k0) === i, `select0(${k0}) n=${n}`);
      }
    }
    assert(bv.select1(k1 + 1) === -1, `select1 範囲外 n=${n}`);
    assert(bv.select0(k0 + 1) === -1, `select0 範囲外 n=${n}`);
    assert(bv.select1(0) === -1, "select1(0) は範囲外");
  }
});

Deno.test("rank と select は互いに逆演算（select1(k) の位置の rank1 は k-1）", () => {
  const bits = makeRandomBits(2048, 42);
  const bv = buildVector(bits);
  for (let k = 1; k <= bv.ones; k += 17) {
    const pos = bv.select1(k);
    assert(bv.rank1(pos) === k - 1, `rank1(select1(${k}))`);
    assert(bv.get(pos), "select1 の位置は 1");
  }
});

Deno.test("ビット長を超えた位置に 1 が立っていたら構築時に throw（fail loudly）", () => {
  const words = new Uint32Array([0b1111]);
  let threw = false;
  try {
    new BitVector(words, 2); // 有効ビットは下位2つのはずなのに bit2,3 が 1
  } catch {
    threw = true;
  }
  assert(threw, "throw しなかった");
});
