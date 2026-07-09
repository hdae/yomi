// parseMatrixDef / parseUnkDef の単体テスト（レビュー指摘 W-A-6）。
//
// 主眼は matrix.def の「転置事故」の固定: 各入力行 "rightId leftId cost" が
// data[rightId * leftSize + leftId] に入る（消費側 dictionary.ts connectionCost の
// data[prevRightId * leftSize + nextLeftId] と同じ添字）。転置すると必ず落ちる
// 非対称値でフィクスチャを組む。
//
// NOTE: parseMatrixDef はヘッダ次元を CONTEXT_ID_DIMENSION に固定検証するため、
// 小さな 3x3 の合成 matrix は受け付けられない（次元ガードで throw）。よって
// 正常系・セル欠落系は 1377x1377 の完全フィクスチャで検証する。

import { parseMatrixDef, parseUnkDef } from "./defs.ts";
import { CONTEXT_ID_DIMENSION } from "@hdae/yomi/format";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const assertThrows = (fn: () => unknown, includes: string, label: string) => {
  let msg: string | null = null;
  try {
    fn();
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e);
  }
  if (msg === null) throw new Error(`${label}: throw しなかった`);
  if (!msg.includes(includes)) throw new Error(`${label}: メッセージが想定外: ${msg}`);
};

const DIM = CONTEXT_ID_DIMENSION;

// セル値: 非対称かつ i16 範囲内。cost(r,l) - cost(l,r) = 9*(r-l) なので、
// 対角以外の全セルで転置を検出できる。範囲: [-6000, 9136] ⊂ i16。
// 6000 のオフセットで大半のセルが負になり readInt の負数スキャンも通す。
const cost = (r: number, l: number): number => r * 10 + l - 6000;

const buildMatrixText = (omit?: { r: number; l: number }): string => {
  const parts: string[] = [`${DIM} ${DIM}`];
  for (let r = 0; r < DIM; r++) {
    for (let l = 0; l < DIM; l++) {
      if (omit && omit.r === r && omit.l === l) continue;
      parts.push(`${r} ${l} ${cost(r, l)}`);
    }
  }
  return parts.join("\n") + "\n";
};

Deno.test("matrix.def: 行 'rightId leftId cost' が data[rightId*leftSize+leftId] に入る（転置しない）", () => {
  const data = parseMatrixDef(buildMatrixText());
  assert(data.length === DIM * DIM, `data 長: ${data.length}`);

  // 非対称の実値スポット確認: 転置していれば (r=1,l=2) セルは (2,1) の値になり落ちる。
  // cost(1,2) = 10 + 2 - 6000 = -5988 / cost(2,1) = 20 + 1 - 6000 = -5979。
  assert(data[1 * DIM + 2] === -5988, `(r=1,l=2) の格納値: ${data[1 * DIM + 2]}`);
  assert(data[2 * DIM + 1] === -5979, `(r=2,l=1) の格納値: ${data[2 * DIM + 1]}`);
  assert(data[0] === -6000, `(0,0)=BOS/EOS セル: ${data[0]}`);

  // 全セル走査: 1つでも転置・添字ずれがあれば最初の不一致で落とす。
  let mismatch: string | null = null;
  for (let r = 0; r < DIM && mismatch === null; r++) {
    for (let l = 0; l < DIM; l++) {
      const got = data[r * DIM + l];
      const want = cost(r, l);
      if (got !== want) {
        mismatch = `data[${r}*${DIM}+${l}]=${got}, 期待 ${want}`;
        break;
      }
    }
  }
  assert(mismatch === null, `セル不一致: ${mismatch}`);
});

Deno.test("matrix.def: ヘッダ次元が想定と違えば throw（小さな 3x3 等は受け付けない）", () => {
  assertThrows(() => parseMatrixDef("3 3\n0 0 0\n"), "想定", "3x3 ヘッダ");
  assertThrows(() => parseMatrixDef(`${DIM} ${DIM - 1}\n0 0 0\n`), "想定", "leftSize 不一致");
});

Deno.test("matrix.def: セル欠落は黙って0にせず throw（fail loudly・欠落セルを明示）", () => {
  // 完全フィクスチャから (r=5,l=7) の1行だけ落とす → seen 未設定で末尾検査が落とす。
  assertThrows(
    () => parseMatrixDef(buildMatrixText({ r: 5, l: 7 })),
    "rightId=5 leftId=7",
    "セル(5,7)欠落",
  );
});

Deno.test("matrix.def: 文脈ID が次元以上なら throw", () => {
  assertThrows(() => parseMatrixDef(`${DIM} ${DIM}\n${DIM} 0 5\n`), "範囲外", "rightId=DIM");
  assertThrows(() => parseMatrixDef(`${DIM} ${DIM}\n0 ${DIM} 5\n`), "範囲外", "leftId=DIM");
});

Deno.test("matrix.def: cost が i16 範囲外なら throw", () => {
  assertThrows(() => parseMatrixDef(`${DIM} ${DIM}\n0 0 40000\n`), "i16 範囲外", "cost>32767");
  assertThrows(() => parseMatrixDef(`${DIM} ${DIM}\n0 0 -40000\n`), "i16 範囲外", "cost<-32768");
});

Deno.test("unk.def: カテゴリ行が入力順どおりに全フィールド保持で取り出せる（CSR バケツ化の前段）", () => {
  // 空行・末尾改行はスキップ、カテゴリは連続していなくてよい（build 側で id 順に束ねる）。
  const text = [
    "KANJI,11,22,-33,名詞,固有名詞,地域,一般,*,*,*",
    "KANJI,44,55,-66,名詞,サ変接続,*,*,*,*,*",
    "NUMERIC,77,88,99,名詞,数,*,*,*,*,*",
    "", // 空行はスキップ
    "DEFAULT,100,200,300,記号,一般,*,*,*,*,*",
    "", // 末尾改行相当
  ].join("\n");
  const recs = parseUnkDef(text);

  assert(recs.length === 4, `件数: ${recs.length}`);
  // 入力順・カテゴリ保持（consumer のバケツ化が push 順に依存する不変）。
  assert(
    recs.map((r) => r.category).join(",") === "KANJI,KANJI,NUMERIC,DEFAULT",
    `カテゴリ順: ${recs.map((r) => r.category)}`,
  );

  // leftId≠rightId の非対称値: col1↔col2 の取り違えなら落ちる。
  assert(
    recs[0].leftId === 11 && recs[0].rightId === 22 && recs[0].cost === -33,
    `rec0 left/right/cost: ${recs[0].leftId}/${recs[0].rightId}/${recs[0].cost}`,
  );
  // features = col4..col9（col10 原形は含めない）。
  assert(
    recs[0].features.join(",") === "名詞,固有名詞,地域,一般,*,*",
    `rec0 features: ${recs[0].features}`,
  );
  assert(
    recs[1].leftId === 44 && recs[1].rightId === 55 && recs[1].cost === -66,
    `rec1 数値: ${recs[1].leftId}/${recs[1].rightId}/${recs[1].cost}`,
  );
  assert(
    recs[2].category === "NUMERIC" && recs[2].leftId === 77 && recs[2].rightId === 88,
    `rec2: ${recs[2].category} ${recs[2].leftId}/${recs[2].rightId}`,
  );
  assert(
    recs[3].leftId === 100 && recs[3].rightId === 200 && recs[3].cost === 300,
    `rec3 数値: ${recs[3].leftId}/${recs[3].rightId}/${recs[3].cost}`,
  );
  assert(
    recs[3].features.join(",") === "記号,一般,*,*,*,*",
    `rec3 features: ${recs[3].features}`,
  );
});

Deno.test("unk.def: 列数が11でなければ throw", () => {
  // 10列（末尾 col10 欠落）。
  assertThrows(
    () => parseUnkDef("KANJI,11,22,-33,名詞,一般,*,*,*,*"),
    "列数が11でない",
    "10列",
  );
  // 12列（余分な列）。
  assertThrows(
    () => parseUnkDef("KANJI,11,22,-33,名詞,一般,*,*,*,*,*,余分"),
    "列数が11でない",
    "12列",
  );
});
