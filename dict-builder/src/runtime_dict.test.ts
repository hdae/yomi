// JtdDictionary / OverlayDictionary のランタイム単体テスト（レビュー指摘 W-A-8 / W-F-7）。
//
// これまで実辞書ゲート付き統合テストでしか（あるいは一切）実行されていなかった経路
// —— load() 自身の CRC 検証ループ・unitPron の U+2019 除去・charCategoriesOf の非BMP
// フォールバック・connectionCost・overlay の resolveContextIds / lookup / fail-loud ——
// を、dict-builder の buildDictionary で数語の合成辞書をメモリ内に組んで無条件に縛る
// （辞書 fixture 不要）。
//
// 期待値は下で組む合成 CSV / char.def / matrix の「書いた値」から導出する。
// load した dict の列を、ビルダの中間値ではなくこのソースの数値と突き合わせる。

import { buildDictionary } from "./build.ts";
import { JtdDictionary, loadOverlay } from "@hdae/yomi";
import { CONTEXT_ID_DIMENSION, JtdContainer } from "@hdae/yomi/format";

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

// ---- 合成入力（すべての期待値の真実源） ----

const DIM = CONTEXT_ID_DIMENSION;

// 非対称セル: cost(r,l) - cost(l,r) = 9*(r-l) なので対角以外は転置で必ず落ちる。
// 範囲 [-6000, 9136] ⊂ i16（defs.test.ts と同じ生成式）。
const matrixCost = (r: number, l: number): number => r * 10 + l - 6000;

const buildMatrixText = (): string => {
  const parts: string[] = [`${DIM} ${DIM}`];
  for (let r = 0; r < DIM; r++) {
    for (let l = 0; l < DIM; l++) parts.push(`${r} ${l} ${matrixCost(r, l)}`);
  }
  return parts.join("\n") + "\n";
};

// 発音「デス’」の ’ は U+2019（無声化マーク）。unitPron は除去、unitPronRaw は保持。
const DESU_PRON = `デス’`;

// 各行 15 列: surface,leftId,rightId,cost,pos,pos1,pos2,pos3,ctype,cform,orig,read,pron,acc,chain
const CSV = [
  // 単純語（leftId≠rightId で列取り違えを検出）。
  "あい,10,20,100,名詞,一般,*,*,*,*,あい,アイ,アイ,1/2,C1",
  "あ,30,40,200,名詞,一般,*,*,*,*,あ,ア,ア,0/1,*",
  // 複合語（ORIG ':' 分割 → 2 ユニット。surfLen/pron/accType が並列分割される）。
  "かきく,12,34,50,名詞,一般,*,*,*,*,かき:く,カキ:ク,カキ:ク,3/2:1/1,C1",
  // 発音に U+2019 を含む語。
  `です,11,22,60,名詞,一般,*,*,*,*,です,デス,${DESU_PRON},0/2,*`,
  // overlay の既定 pos ["名詞","固有名詞","一般"] が一意に借用する代表エントリ。
  "固有名,55,66,300,名詞,固有名詞,一般,*,*,*,固有名,コユウメイ,コユウメイ,0/5,*",
  // overlay の明示 pos ["動詞"] が一意に借用する代表エントリ。
  "行く,77,88,400,動詞,自立,*,*,五段・カ行促音便,基本形,行く,イク,イク,2/2,C1",
].join("\n") + "\n";

// カテゴリ順: DEFAULT=0, KANJI=1, HIRAGANA=2, KATAKANA=3。
const CHAR_DEF = [
  "DEFAULT 0 1 0",
  "KANJI 0 0 2",
  "HIRAGANA 0 1 0",
  "KATAKANA 0 1 0",
  "0x3041..0x3096 HIRAGANA",
  "0x30A1..0x30FA KATAKANA",
  "0x4E00..0x9FFF KANJI",
].join("\n") + "\n";

// DEFAULT を欠いた char.def（fail-loud の対象）。KANJI 参照行は定義済みで通す。
const CHAR_DEF_NO_DEFAULT = [
  "KANJI 0 0 2",
  "HIRAGANA 0 1 0",
  "0x4E00..0x9FFF KANJI",
].join("\n") + "\n";

const UNK_DEF = "DEFAULT,1,1,1000,記号,一般,*,*,*,*,*\n";

const MATRIX_DEF = buildMatrixText();

const built = buildDictionary({
  csv: CSV,
  matrixDef: MATRIX_DEF,
  charDef: CHAR_DEF,
  unkDef: UNK_DEF,
  license: "TEST-LICENSE",
});

// verifyChecksums 既定(true) で読む。整形式なら CRC ループを素通りしてロードできる。
const dict = JtdDictionary.load(built.file.buffer);

// ---- 索引ヘルパ（load した trie で実検索し、単一エントリを取り出す） ----

const entryOf = (surface: string): number => {
  const sid = dict.trie.exactMatch(surface);
  assert(sid >= 0, `surface 未登録: ${surface}`);
  const start = dict.entryIndex[sid];
  const end = dict.entryIndex[sid + 1];
  assert(end - start === 1, `${surface} は単一エントリ想定だが ${end - start} 件`);
  return start;
};

// ---- テスト ----

Deno.test("load: 整形式コンテナは verifyChecksums 既定(true) で読め、メタが書いた通り", () => {
  assert(dict.trie.surfaceCount === 6, `surfaceCount: ${dict.trie.surfaceCount}`);
  // 本体 6 セクションすべてに CRC が記録され、検証ループを通っている。
  assert(
    Object.keys(dict.meta.checksums).sort().join(",") === "CHAR,CONN,LEXI,READ,TRIE,UNKD",
    `checksums keys: ${Object.keys(dict.meta.checksums)}`,
  );
  assert(
    dict.meta.charCategories.join(",") === "DEFAULT,KANJI,HIRAGANA,KATAKANA",
    `charCategories: ${dict.meta.charCategories}`,
  );
  assert(dict.defaultCategoryId === 0, `defaultCategoryId: ${dict.defaultCategoryId}`);
});

Deno.test("load: 本体セクション1バイト改竄で load 自身のCRC検証ループが throw（verifyChecksums:false では通る）", () => {
  const tampered = built.file.slice();
  const conn = new JtdContainer(tampered.buffer).section("CONN");
  const at = conn.offset + (conn.length >> 1);
  tampered[at] = tampered[at] ^ 0xff; // 1 バイト反転 → CRC は必ず変わる

  // 既定 true: dictionary.ts:load 内の検証ループが該当セクション名を挙げて throw
  // （src/browser の verifyJtd ではなくロード経路自身が検出することを縛る）。
  let msg: string | null = null;
  try {
    JtdDictionary.load(tampered.buffer);
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e);
  }
  assert(msg !== null, "改竄後も throw しなかった");
  assert(
    msg!.includes("CONN") && msg!.includes("CRC不一致"),
    `想定外メッセージ: ${msg}`,
  );

  // verifyChecksums:false なら検証を飛ばして構築が通る（= throw の原因が CRC 検証だと特定できる）。
  let ok = true;
  try {
    JtdDictionary.load(tampered.buffer, { verifyChecksums: false });
  } catch {
    ok = false;
  }
  assert(ok, "verifyChecksums:false でも throw した（CRC 以外の破壊が疑われる）");
});

/** [from, to) の範囲から ASCII バイト列 needle の開始位置を探す（無ければ -1）。 */
const findBytes = (haystack: Uint8Array, from: number, to: number, needle: Uint8Array): number => {
  for (let i = from; i + needle.length <= to; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
};

Deno.test("load: META の構造破損は validateDictMeta が fail loud（検証の配線を固定）", () => {
  const tampered = built.file.slice();
  const meta = new JtdContainer(tampered.buffer).section("META");
  // META は CRC 対象外（checksums の自己参照になるため）なので、JSON が整形式のままの
  // 等長パッチは CRC 検証を素通りする。キー "dictName" の末尾1バイトを書き換えて
  // "dictNamX" にすると、必須キー欠落として構造検証だけが発火するはず。
  const key = new TextEncoder().encode('"dictName"');
  const at = findBytes(tampered, meta.offset, meta.offset + meta.length, key);
  assert(at >= 0, 'META 内に "dictName" キーが見つからない');
  tampered[at + 8] = "X".charCodeAt(0); // "dictName" → "dictNamX"

  assertThrows(
    () => JtdDictionary.load(tampered.buffer),
    "META 検証失敗",
    "META 構造破損",
  );
});

Deno.test("lookup: commonPrefixSearch → entryIndex で単純語の全列が書いた値で引ける", () => {
  // commonPrefixSearch("あい") は "あ"(end=1) と "あい"(end=2) を両方ヒットする。
  const hits: [number, number][] = [];
  dict.trie.commonPrefixSearch("あい", 0, (sid, end) => hits.push([sid, end]));
  const sidA = dict.trie.exactMatch("あ");
  const sidAi = dict.trie.exactMatch("あい");
  assert(hits.length === 2, `ヒット数: ${hits.length}`);
  const has = (sid: number, end: number) => hits.some((h) => h[0] === sid && h[1] === end);
  assert(has(sidA, 1), "あ の前方一致(end=1)がない");
  assert(has(sidAi, 2), "あい の前方一致(end=2)がない");

  // "あい": leftId=10 rightId=20 cost=100 pos=名詞,一般 発音=アイ acc=1
  const eAi = entryOf("あい");
  assert(dict.leftId[eAi] === 10, `あい leftId: ${dict.leftId[eAi]}`);
  assert(dict.rightId[eAi] === 20, `あい rightId: ${dict.rightId[eAi]}`);
  assert(dict.cost[eAi] === 100, `あい cost: ${dict.cost[eAi]}`);
  assert(
    dict.meta.posTable[dict.posId[eAi]].join(",") === "名詞,一般,*,*,*,*",
    `あい pos: ${dict.meta.posTable[dict.posId[eAi]]}`,
  );
  const uAi = dict.unitIndex[eAi];
  assert(dict.unitIndex[eAi + 1] - uAi === 1, "あい は単一ユニット想定");
  assert(dict.unitPron(uAi) === "アイ", `あい pron: ${dict.unitPron(uAi)}`);
  assert(dict.unitAccType[uAi] === 1, `あい accType: ${dict.unitAccType[uAi]}`);
  assert(dict.unitSurfLen[uAi] === 0, `あい surfLen(単一=0/残り): ${dict.unitSurfLen[uAi]}`);

  // "あ": leftId=30 rightId=40 cost=200 acc=0
  const eA = entryOf("あ");
  assert(
    dict.leftId[eA] === 30 && dict.rightId[eA] === 40,
    `あ left/right: ${dict.leftId[eA]}/${dict.rightId[eA]}`,
  );
  assert(dict.cost[eA] === 200, `あ cost: ${dict.cost[eA]}`);
  assert(dict.unitAccType[dict.unitIndex[eA]] === 0, "あ accType=0");
});

Deno.test("lookup: 複合語は unitSurfLen/unitAccType/unitPron が並列分割どおり", () => {
  // "かきく" orig=かき:く → unit0(surfLen=2,pron=カキ,acc=3) / unit1(surfLen=0=残り,pron=ク,acc=1)
  const e = entryOf("かきく");
  const u0 = dict.unitIndex[e];
  const u1 = dict.unitIndex[e + 1];
  assert(u1 - u0 === 2, `ユニット数: ${u1 - u0}`);
  assert(dict.unitSurfLen[u0] === 2, `unit0 surfLen: ${dict.unitSurfLen[u0]}`);
  assert(dict.unitSurfLen[u0 + 1] === 0, `unit1 surfLen(残り): ${dict.unitSurfLen[u0 + 1]}`);
  assert(dict.unitPron(u0) === "カキ", `unit0 pron: ${dict.unitPron(u0)}`);
  assert(dict.unitPron(u0 + 1) === "ク", `unit1 pron: ${dict.unitPron(u0 + 1)}`);
  assert(dict.unitAccType[u0] === 3, `unit0 accType: ${dict.unitAccType[u0]}`);
  assert(dict.unitAccType[u0 + 1] === 1, `unit1 accType: ${dict.unitAccType[u0 + 1]}`);
});

Deno.test("unitPron: U+2019 無声化マークは unitPron で除去・unitPronRaw で保持", () => {
  const e = entryOf("です");
  const u = dict.unitIndex[e];
  // 生の発音列は「デス’」(U+2019 込み3文字)、公開発音は「デス」(2文字)。
  assert(dict.unitPronRaw(u) === DESU_PRON, `unitPronRaw: ${dict.unitPronRaw(u)}`);
  assert(dict.unitPronRaw(u).length === 3, `raw 長(マーク込み): ${dict.unitPronRaw(u).length}`);
  assert(dict.unitPron(u) === "デス", `unitPron: ${dict.unitPron(u)}`);
  assert(dict.unitPron(u).length === 2, `pron 長(マーク除去): ${dict.unitPron(u).length}`);
});

Deno.test("connectionCost(r,l): 合成 matrix の非対称値を返す（転置検出）", () => {
  // cost(r,l)=r*10+l-6000。転置なら (1,2)≠(2,1) で落ちる。
  assert(dict.connectionCost(0, 0) === -6000, `(0,0): ${dict.connectionCost(0, 0)}`);
  assert(dict.connectionCost(1, 2) === -5988, `(1,2): ${dict.connectionCost(1, 2)}`);
  assert(dict.connectionCost(2, 1) === -5979, `(2,1): ${dict.connectionCost(2, 1)}`);
  // 代表エントリの ID を使った実連接（55*10+66-6000）。
  assert(dict.connectionCost(55, 66) === -5384, `(55,66): ${dict.connectionCost(55, 66)}`);
});

Deno.test("charCategoriesOf: BMP はカテゴリ列、非BMP コードポイントは DEFAULT フォールバック", () => {
  const out: number[] = [];
  // BMP: char.def の範囲行どおり。
  assert(dict.charCategoriesOf(0x3042, out) === 1 && out[0] === 2, "あ→HIRAGANA(2)");
  assert(dict.charCategoriesOf(0x30a2, out) === 1 && out[0] === 3, "ア→KATAKANA(3)");
  assert(dict.charCategoriesOf(0x4e00, out) === 1 && out[0] === 1, "一→KANJI(1)");
  assert(dict.charCategoriesOf(0x0041, out) === 1 && out[0] === 0, "未定義 A→DEFAULT(0)");
  // 非BMP（char.def で表現不能）→ DEFAULT の1件。
  const n = dict.charCategoriesOf(0x1f600, out);
  assert(n === 1 && out[0] === dict.defaultCategoryId, `非BMP→DEFAULT: n=${n} out0=${out[0]}`);
  assert(dict.charCategories[out[0]].name === "DEFAULT", "非BMP フォールバック先が DEFAULT");
});

Deno.test("char.def: DEFAULT カテゴリ欠落は build 時に fail loud（parseCharDef で検出）", () => {
  // 実挙動: buildDictionary は parseCharDef を parseMatrixDef より先に呼ぶため、
  // DEFAULT 欠落は load 前（build）で throw する。黙って通らないことが本質。
  assertThrows(
    () =>
      buildDictionary({
        csv: CSV,
        matrixDef: MATRIX_DEF,
        charDef: CHAR_DEF_NO_DEFAULT,
        unkDef: "",
        license: "TEST-LICENSE",
      }),
    "DEFAULT",
    "DEFAULT 欠落 char.def",
  );
});

Deno.test("overlay: 既定/明示 pos の代表エントリから leftId/rightId を借用する（resolveContextIds）", () => {
  const overlay = loadOverlay(
    dict,
    JSON.stringify([
      // 既定 pos ["名詞","固有名詞","一般"] → 一意な代表「固有名」(55/66) を借用。
      { surface: "東京", reading: "トウキョウ", accentType: 0 },
      // 明示 pos ["動詞"] → 一意な代表「行く」(77/88) を借用し、pos は代表の完全形になる。
      { surface: "走", reading: "ハシル", accentType: 2, pos: ["動詞"] },
    ]),
  );

  const e0 = overlay.entries[0];
  assert(e0.surface === "東京" && e0.reading === "トウキョウ" && e0.accentType === 0, "e0 基本値");
  assert(e0.leftId === 55 && e0.rightId === 66, `e0 借用 left/right: ${e0.leftId}/${e0.rightId}`);
  assert(e0.cost === -10000, `e0 既定 cost: ${e0.cost}`);
  assert(e0.chainRule === "*", `e0 既定 chainRule: ${e0.chainRule}`);
  assert(e0.pos.join(",") === "名詞,固有名詞,一般,*,*,*", `e0 pos: ${e0.pos}`);

  const e1 = overlay.entries[1];
  assert(e1.leftId === 77 && e1.rightId === 88, `e1 借用 left/right: ${e1.leftId}/${e1.rightId}`);
  assert(
    e1.pos.join(",") === "動詞,自立,*,*,五段・カ行促音便,基本形",
    `e1 代表 pos の完全形: ${e1.pos}`,
  );
});

Deno.test("overlay: lookup が正規化済み表層で from を尊重して引ける", () => {
  const overlay = loadOverlay(
    dict,
    JSON.stringify([{ surface: "東京", reading: "トウキョウ", accentType: 0 }]),
  );

  const hits: [number, number][] = [];
  overlay.lookup("東京", 0, (i, end) => hits.push([i, end]));
  assert(
    hits.length === 1 && hits[0][0] === 0 && hits[0][1] === 2,
    `from=0: ${JSON.stringify(hits)}`,
  );

  // from を尊重: 接頭辞を跨がず、slice(from,end) が表層と一致した位置だけヒットする。
  const hits2: [number, number][] = [];
  overlay.lookup("z東京", 1, (i, end) => hits2.push([i, end]));
  assert(
    hits2.length === 1 && hits2[0][0] === 0 && hits2[0][1] === 3,
    `from=1: ${JSON.stringify(hits2)}`,
  );
});

Deno.test("overlay: 壊れたエントリは resolveEntry の各検証で fail loud", () => {
  const cases: { entry: Record<string, unknown>; includes: string; label: string }[] = [
    {
      entry: { surface: "", reading: "ア", accentType: 0 },
      includes: "surface が空",
      label: "空 surface",
    },
    {
      entry: { surface: "A", reading: "エー", accentType: 0 },
      includes: "正規化済み",
      label: "未正規化 surface（A→Ａ）",
    },
    {
      entry: { surface: "山", reading: "ア。イ", accentType: 0 },
      includes: "モーラ分割できない",
      label: "reading が単一モーラ区間にならない",
    },
    {
      entry: { surface: "川", reading: "カワ", accentType: 5 },
      includes: "範囲外",
      label: "accentType がモーラ数超過",
    },
    {
      entry: { surface: "雨", reading: "アメ", accentType: 0, pos: ["形容詞"] },
      includes: "posTable に存在しない",
      label: "未知品詞",
    },
  ];
  for (const c of cases) {
    assertThrows(() => loadOverlay(dict, JSON.stringify([c.entry])), c.includes, c.label);
  }
});
