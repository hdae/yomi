// wordPhoneAlignment の仕様と、toSbv2PhoneTone との音素一致（ADR-0008 決定3）を検証する。
//
// 中核の表明テスト（MUST）:
//   wordPhoneAlignment(nodes).flatMap(w => w.phones)
//     === toSbv2PhoneTone(analyze(...)).phones の両端 "_" を除いた中身
// が全文で完全一致すること。共有ヘルパ（nodeToMoras/moraToPhones/pausePunct）で
// 音素生成を一元化しているので、これは構造的に成り立つはずだが、走査ロジック
// （句グルーピング・句読点位置・文末 long）の一致を実辞書で網羅検証する。

import { wordPhoneAlignment } from "./word_alignment.ts";
import { toSbv2PhoneTone } from "./sbv2_bridge.ts";
import { JtdDictionary } from "./dictionary.ts";
import { analyze, analyzeToNodes } from "./analyze.ts";
import { dictAvailable, dictPath } from "./_dict_path.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const assertEq = <T>(actual: T, expected: T, label: string) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: got ${a}, want ${e}`);
};

Deno.test("wordPhoneAlignment: 縮退（ノードなし）は空配列", () => {
  assertEq(wordPhoneAlignment([]), [], "空ノード列 → 空アライメント");
});

// --- 実辞書統合テスト（辞書が無い環境では skip。src/_dict_path.ts） ---

const dictExists = dictAvailable();

const loadDict = (() => {
  let cached: JtdDictionary | undefined;
  return () => {
    if (!cached) {
      const bytes = Deno.readFileSync(dictPath());
      cached = JtdDictionary.load(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        { verifyChecksums: false },
      );
    }
    return cached;
  };
})();

// 句読点なし・複数句・長音・促音撥音・連続記号・数詞・英字など、
// 走査ロジックの分岐を広くカバーする文集合。
const CORPUS = [
  "こんにちは、世界。",
  "私はそう思う!って感じ?",
  "今日は良い天気です。",
  "東京都に住んでいます。",
  "お母さんとお父さん。",
  "コーヒーを飲む。",
  "本当にありがとう。",
  "えっ、本当に！？すごい。",
  "あ、あ、あ。",
  "テスト", // 句点なし（末尾 long 強制）
  "３００円払った。",
  "ABCニュースを見た。",
  "眼鏡をかけた。",
  "すもももももももものうち。",
  "きゃりーぱみゅぱみゅが歌う。",
];

Deno.test({
  name:
    "wordPhoneAlignment(実辞書): アライメント音素連結 == toSbv2PhoneTone 両端PAD除去（全文一致）",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    for (const text of CORPUS) {
      const result = analyze(dict, text);
      const nodes = analyzeToNodes(dict, text);
      const align = wordPhoneAlignment(nodes);
      const bridge = toSbv2PhoneTone(result);
      const innerBridge = bridge.phones.slice(1, -1); // 両端 "_" を除く
      const flatAlign = align.flatMap((w) => w.phones);
      assertEq(flatAlign, innerBridge, `[${text}] 音素連結不一致`);
    }
  },
});

Deno.test({
  name: "wordPhoneAlignment(実辞書): 各語 surface が空でなく、句読点語は phones 1個",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    for (const text of CORPUS) {
      const nodes = analyzeToNodes(dict, text);
      const align = wordPhoneAlignment(nodes);
      for (const w of align) {
        assert(w.surface.length > 0, `[${text}] surface 空`);
        assert(w.phones.length > 0, `[${text}] phones 空: ${w.surface}`);
        if (w.surface === "," || w.surface === ".") {
          assertEq(w.phones, [w.surface], `[${text}] 句読点語の phones`);
        }
      }
    }
  },
});

Deno.test({
  name: "wordPhoneAlignment(実辞書): 句読点は必ず末尾 '.'（文末 long）で終わる",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    for (const text of CORPUS) {
      const nodes = analyzeToNodes(dict, text);
      const align = wordPhoneAlignment(nodes);
      if (align.length === 0) continue;
      assertEq(align.at(-1)!.phones, ["."], `[${text}] 末尾は文末 long の '.'`);
    }
  },
});
