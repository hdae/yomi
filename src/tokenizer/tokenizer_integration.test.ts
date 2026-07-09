// 実辞書（naist-jdic.jtd）での統合テスト。
// 辞書が無い環境では skip される（CI では build-dict を先に走らせる。src/_dict_path.ts）。

import { JtdDictionary } from "../dict/dictionary.ts";
import { tokenize } from "./tokenizer.ts";
import { dictAvailable, dictPath } from "../_dict_path.ts";

const dictExists = dictAvailable();

const loadDict = (() => {
  let cached: JtdDictionary | undefined;
  return () => {
    if (!cached) {
      const bytes = Deno.readFileSync(dictPath());
      cached = JtdDictionary.load(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
    }
    return cached;
  };
})();

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

Deno.test({
  name: "実辞書ロード: CRC検証込みで読める",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    assert(dict.meta.dictName === "naist-jdic", "dictName");
    assert(dict.trie.surfaceCount > 390000, "surfaceCount");
  },
});

Deno.test({
  name: "代表文の分かち書きと発音形（曖昧性解消・複合語展開・未知語を含む）",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();

    // 連接コストによる曖昧性解消の古典例。
    const t1 = tokenize(dict, "東京都に住む");
    assert(
      t1.map((t) => t.surface).join("/") === "東京/都/に/住む",
      `東京都: ${t1.map((t) => t.surface).join("/")}`,
    );
    assert(t1[0].pron === "トーキョー", `東京 pron: ${t1[0].pron}`);

    const t2 = tokenize(dict, "今日はいい天気ですね。");
    assert(
      t2.map((t) => t.surface).join("/") === "今日/は/いい/天気/です/ね/。",
      `今日は: ${t2.map((t) => t.surface).join("/")}`,
    );
    assert(t2[0].pron === "キョー", `今日 pron: ${t2[0].pron}`);
    assert(t2[0].accType === 1, `今日 accType: ${t2[0].accType}`);

    // 複合語ユニット展開（1エントリ→2トークン）。
    const t3 = tokenize(dict, "３０２Ａ");
    assert(
      t3.map((t) => `${t.surface}=${t.pron}`).join("/") === "３０=サンマル/２Ａ=ニエー",
      `複合語: ${t3.map((t) => `${t.surface}=${t.pron}`).join("/")}`,
    );

    // 未知語（辞書に無いカタカナ連続）。
    const t4 = tokenize(dict, "グーグリフィケーション");
    assert(t4.some((t) => t.isUnknown), `未知語が出ない: ${t4.map((t) => t.surface).join("/")}`);
  },
});

Deno.test({
  name: "性能の下限: 100文字級の文を1000回で1文あたり2ms未満",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    const text =
      "国境の長いトンネルを抜けると雪国であった。夜の底が白くなった。信号所に汽車が止まった。" +
      "向側の座席から娘が立って来て、島村の前のガラス窓を落した。雪の冷気が流れこんだ。";
    tokenize(dict, text); // ウォームアップ
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) tokenize(dict, text);
    const perSentence = (performance.now() - t0) / 1000;
    if (perSentence > 2) throw new Error(`1文 ${perSentence.toFixed(2)}ms は目標超過`);
  },
});
