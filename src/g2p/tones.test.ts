// moraTones（tones.ts）の振る舞いテスト。アクセント核位置 → アクセント句内の各モーラ
// 高低（0/1）への変換規則を固定する。期待値はレビュー精査で導出した値をベタ書きし、
// 実装の写経ではなく仕様の表明とする。

import { moraTones } from "./tones.ts";

const eq = (got: number[], want: number[]) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) throw new Error(`got ${g} want ${w}`);
};

Deno.test("平板(核0)は句頭のみ低く、2モーラ目以降は下降せず高いまま", () => {
  eq(moraTones(0, 5), [0, 1, 1, 1, 1]);
});

Deno.test("頭高(核1)は1モーラ目だけ高く直後に下降する", () => {
  eq(moraTones(1, 5), [1, 0, 0, 0, 0]);
});

Deno.test("中高(核3)は句頭で立ち上がり核モーラの後で下降する", () => {
  eq(moraTones(3, 5), [0, 1, 1, 0, 0]);
});

Deno.test("尾高(核=モーラ数)は最終モーラまで高い（下降は次句で実現）", () => {
  eq(moraTones(5, 5), [0, 1, 1, 1, 1]);
});

Deno.test("範囲外核(核>モーラ数)は尾高相当にクランプされる（意図的な縮退）", () => {
  eq(moraTones(7, 5), [0, 1, 1, 1, 1]);
  // クランプ結果が尾高(核=モーラ数)と完全一致することも固定する。
  eq(moraTones(7, 5), moraTones(5, 5));
});

Deno.test("1モーラ: 平板は[0]、頭高は[1]", () => {
  eq(moraTones(0, 1), [0]);
  eq(moraTones(1, 1), [1]);
});

Deno.test("0モーラは空配列", () => {
  eq(moraTones(0, 0), []);
});

Deno.test("負核(核-1)は全モーラ低に縮退する（現挙動の固定）", () => {
  eq(moraTones(-1, 5), [0, 0, 0, 0, 0]);
});
