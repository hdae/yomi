// sbv2_bridge の挙動仕様。純関数テストは FrontendResult を手組みして検証（辞書不要）。
// 実辞書統合テストは overlay_integration_test.ts と同じ dictExists パターンで ignore 可。

import type { AccentPhrase, FrontendResult, Mora } from "./njd/result.ts";
import { toSbv2PhoneTone } from "./sbv2_bridge.ts";
import { JtdDictionary } from "./dictionary.ts";
import { analyze } from "./analyze.ts";
import { dictAvailable, dictPath } from "./_dict_path.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const assertEq = <T>(actual: T, expected: T, label: string) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: got ${a}, want ${e}`);
};

// 通常モーラの簡易コンストラクタ。
const m = (kana: string, consonant: string | undefined, vowel: string): Mora =>
  consonant !== undefined ? { kana, consonant, vowel } : { kana, vowel };

const phrase = (
  moras: Mora[],
  accentNucleus: number,
  pauseAfter: AccentPhrase["pauseAfter"] = "none",
): AccentPhrase => ({ moras, accentNucleus, pauseAfter });

const result = (accentPhrases: AccentPhrase[]): FrontendResult => ({
  normalizedText: "",
  accentPhrases,
});

Deno.test("sbv2_bridge: 全体構造", async (t) => {
  await t.step("先頭と末尾に PAD '_'(tone 0) が付く", () => {
    // カ(k a) 平板。pauseAfter none。
    const r = result([phrase([m("カ", "k", "a")], 0)]);
    const { phones, tones } = toSbv2PhoneTone(r);
    assertEq(phones, ["_", "k", "a", "_"], "phones");
    assertEq(tones, [0, 0, 0, 0], "tones");
    assert(phones[0] === "_" && phones.at(-1) === "_", "両端 PAD");
  });

  await t.step("空入力は両端 PAD のみへ縮退する", () => {
    const { phones, tones } = toSbv2PhoneTone(result([]));
    assertEq(phones, ["_", "_"], "phones");
    assertEq(tones, [0, 0], "tones");
  });

  await t.step("phones と tones は常に同じ長さ", () => {
    const r = result([
      phrase([m("ア", undefined, "a"), m("キ", "k", "i")], 2, "short"),
      phrase([m("ト", "t", "o")], 1, "long"),
    ]);
    const { phones, tones } = toSbv2PhoneTone(r);
    assert(phones.length === tones.length, `長さ不一致 ${phones.length} vs ${tones.length}`);
  });
});

Deno.test("sbv2_bridge: モーラ→音素の展開", async (t) => {
  await t.step("拗音 [ky, a] は2音素になり同一トーンを持つ", () => {
    // キャ(ky a) 平板 → 1モーラ目なので tone 0。2音素とも 0。
    const r = result([phrase([m("キャ", "ky", "a")], 0)]);
    const { phones, tones } = toSbv2PhoneTone(r);
    assertEq(phones, ["_", "ky", "a", "_"], "phones");
    assertEq(tones, [0, 0, 0, 0], "同一モーラの子音・母音は同トーン");
  });

  await t.step("促音は 'q' 1個（consonant は無視）", () => {
    // ッ の内部表記は vowel==="cl"。consonant があっても捨てて q 1個。
    const r = result([
      phrase([m("ア", undefined, "a"), { kana: "ッ", consonant: "cl", vowel: "cl" }], 0),
    ]);
    const { phones } = toSbv2PhoneTone(r);
    assertEq(phones, ["_", "a", "q", "_"], "促音 q");
  });

  await t.step("撥音は 'N' 1個（consonant は無視）", () => {
    const r = result([phrase([m("ホ", "h", "o"), { kana: "ン", consonant: "N", vowel: "N" }], 0)]);
    const { phones } = toSbv2PhoneTone(r);
    assertEq(phones, ["_", "h", "o", "N", "_"], "撥音 N");
  });

  await t.step("母音のみモーラは母音1個（長音の引き継ぎ母音もそのまま）", () => {
    // 長音は result.ts が直前母音に解決済みなので、ここでは vowel:"o" の普通のモーラとして来る。
    const r = result([phrase([m("ソ", "s", "o"), m("ー", undefined, "o")], 0)]);
    const { phones } = toSbv2PhoneTone(r);
    assertEq(phones, ["_", "s", "o", "o", "_"], "長音は母音反復（':' は使わない）");
  });

  await t.step("devoiced は音素・トーンに影響しない", () => {
    const r = result([phrase([{ kana: "シ", consonant: "sh", vowel: "i", devoiced: true }], 0)]);
    const { phones, tones } = toSbv2PhoneTone(r);
    assertEq(phones, ["_", "sh", "i", "_"], "無声化は phone に出ない");
    assertEq(tones, [0, 0, 0, 0], "無声化は tone に出ない");
  });
});

Deno.test("sbv2_bridge: 核位置→トーン(0/1)", async (t) => {
  // モーラ3個（各1音素: a, i, u）でトーンパターンを見る。中央 PAD を除いた核部分に注目。
  const three = (nucleus: number) =>
    toSbv2PhoneTone(
      result([
        phrase(
          [m("ア", undefined, "a"), m("イ", undefined, "i"), m("ウ", undefined, "u")],
          nucleus,
        ),
      ]),
    ).tones.slice(1, -1);

  await t.step("平板(0): 1モーラ目 0、以降 1", () => {
    assertEq(three(0), [0, 1, 1], "平板");
  });

  await t.step("頭高(1): 1モーラ目 1、以降 0", () => {
    assertEq(three(1), [1, 0, 0], "頭高");
  });

  await t.step("中高(2): 0, 1(=核), 0", () => {
    assertEq(three(2), [0, 1, 0], "中高");
  });

  await t.step("尾高(3=モーラ数): 0, 1, 1(=核末尾)", () => {
    assertEq(three(3), [0, 1, 1], "尾高");
  });

  await t.step("範囲外核は尾高扱いにクランプ（fail loudly せず）", () => {
    assertEq(three(99), [0, 1, 1], "範囲外核クランプ");
  });
});

Deno.test("sbv2_bridge: pauseAfter → punctuation", async (t) => {
  const withPause = (pause: AccentPhrase["pauseAfter"]) =>
    toSbv2PhoneTone(result([phrase([m("カ", "k", "a")], 0, pause)])).phones;

  await t.step("short → 句直後に ','(tone 0)", () => {
    const { phones, tones } = toSbv2PhoneTone(result([phrase([m("カ", "k", "a")], 0, "short")]));
    assertEq(phones, ["_", "k", "a", ",", "_"], "short=読点");
    assertEq(tones, [0, 0, 0, 0, 0], "punctuation は tone 0");
  });

  await t.step("long → 句直後に '.'（文末でも出る）", () => {
    assertEq(withPause("long"), ["_", "k", "a", ".", "_"], "long=句点。末尾 '.' '_'");
  });

  await t.step("none → 記号を挿入しない", () => {
    assertEq(withPause("none"), ["_", "k", "a", "_"], "none は句境界を tone の0戻りのみで表す");
  });
});

Deno.test("sbv2_bridge: 複数句", async (t) => {
  await t.step("句をまたぐとトーンは各句で独立に0から立ち上がる", () => {
    // 句1: ア(平板, tone 0,1) → short ',' → 句2: イ(頭高, tone 1,0)
    const r = result([
      phrase([m("ア", undefined, "a"), m("イ", undefined, "i")], 0, "short"),
      phrase([m("ウ", undefined, "u"), m("エ", undefined, "e")], 1, "long"),
    ]);
    const { phones, tones } = toSbv2PhoneTone(r);
    assertEq(phones, ["_", "a", "i", ",", "u", "e", ".", "_"], "phones");
    // 句1 平板=0,1 / ',' =0 / 句2 頭高=1,0 / '.'=0 / 両端=0
    assertEq(tones, [0, 0, 1, 0, 1, 0, 0, 0], "各句独立にリセット");
  });
});

// --- 実辞書統合テスト（辞書が無い環境では skip。src/_dict_path.ts） ---

const dictExists = dictAvailable();

const loadDict = () => {
  const bytes = Deno.readFileSync(dictPath());
  return JtdDictionary.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    { verifyChecksums: false },
  );
};

Deno.test({
  name: "sbv2_bridge(実辞書): 「音声合成のテストを行います。」を解析→変換",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    const r = analyze(dict, "音声合成のテストを行います。");
    const { phones, tones } = toSbv2PhoneTone(r);

    assert(phones.length === tones.length, "phones/tones 長さ一致");
    assert(phones[0] === "_" && phones.at(-1) === "_", "先頭・末尾が PAD '_'");
    // 句点由来の '.' が末尾 '_' の直前にある。
    assertEq(phones.slice(-2), [".", "_"], "文末は '.' '_'");
    // トーンは 0/1 のみ。
    assert(tones.every((t) => t === 0 || t === 1), `tones が 0/1 以外を含む: ${tones}`);
    // PAD 以外の '.' 位置は tone 0。
    for (let i = 0; i < phones.length; i++) {
      if (phones[i] === "." || phones[i] === "," || phones[i] === "_") {
        assert(tones[i] === 0, `punctuation/PAD の tone が 0 でない at ${i}`);
      }
    }
  },
});
