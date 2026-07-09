// wordPhoneAlignment の仕様と、コア結果（accentPhrases）との音素一致を検証する。
//
// 中核の表明テスト（MUST）:
//   wordPhoneAlignment(nodes).flatMap(w => w.phones)
//     === analyze(...).accentPhrases から素直に組んだ音素列
// が全文で完全一致すること。node 走査（アライメント）と句構造走査（コア結果）は
// 別経路なので、共有ヘルパ（nodeToMoras/moraToPhones/pausePunct）による音素生成の
// 一元化と、走査ロジック（句グルーピング・句読点位置・文末 long）の一致を実辞書で
// 網羅検証する。

import { pausePunct, wordPhoneAlignment } from "./word_alignment.ts";
import { moraToPhones } from "./phonemes.ts";
import { JtdDictionary } from "../dict/dictionary.ts";
import { analyze, analyzeWithWords } from "../analyze.ts";
import { analyzeToNodes } from "../njd/frontend.ts";
import { dictAvailable, dictPath } from "../_dict_path.ts";

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
    "wordPhoneAlignment(実辞書): アライメント音素連結 == コア結果(accentPhrases)由来の音素列（全文一致）",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    for (const text of CORPUS) {
      const result = analyze(dict, text);
      const nodes = analyzeToNodes(dict, text);
      const align = wordPhoneAlignment(nodes);
      // 期待: コアのアクセント句列から素直に音素を組む（両端 PAD なし）。node 走査
      // （align）と句構造走査（result）の別経路が同じ音素列に落ちることを検証する。
      const expected: string[] = [];
      for (const phrase of result.accentPhrases) {
        for (const mora of phrase.moras) expected.push(...moraToPhones(mora));
        const punct = pausePunct(phrase.pauseAfter);
        if (punct !== undefined) expected.push(punct);
      }
      const flatAlign = align.flatMap((w) => w.phones);
      assertEq(flatAlign, expected, `[${text}] 音素連結不一致`);
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

// analyzeWithWords（シュガー）は、1解析で result（=analyze 相当）と words
// （=wordPhoneAlignment(analyzeToNodes) 相当）を返す。分離経路で組んだ結果と
// 完全一致することを表明し、シュガーが二経路から乖離しないことを守る。
Deno.test({
  name:
    "analyzeWithWords(実辞書): result==analyze かつ words==wordPhoneAlignment（1解析・分離経路と一致）",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    for (const text of CORPUS) {
      const combined = analyzeWithWords(dict, text);
      assertEq(combined.result, analyze(dict, text), `[${text}] result が analyze と不一致`);
      assertEq(
        combined.words,
        wordPhoneAlignment(analyzeToNodes(dict, text)),
        `[${text}] words が wordPhoneAlignment と不一致`,
      );
    }
  },
});
