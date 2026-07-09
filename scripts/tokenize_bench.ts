// 分かち書き・G2P の性能ベンチ（dev 用・CI の pass/fail には使わない）。
// 実行: deno task bench（辞書 fixture が必要。無ければ何も計測しない）。
//
// 参考値（2026-07-10, WSL2）: tokenize ~0.1ms/文（100文字級）・analyze ~0.11ms/文。
// 機能テスト側に固定閾値の性能アサートを置くと共有ランナーで flaky 化するため、
// 性能はここで観測し、退行が疑われたら手元で比較する。

import { analyze, JtdDictionary } from "../src/mod.ts";
import { tokenize } from "../src/tokenizer/mod.ts";
import { dictAvailable, dictPath } from "../src/_dict_path.ts";

const TEXT =
  "国境の長いトンネルを抜けると雪国であった。夜の底が白くなった。信号所に汽車が止まった。" +
  "向側の座席から娘が立って来て、島村の前のガラス窓を落した。雪の冷気が流れこんだ。";

if (dictAvailable()) {
  const bytes = Deno.readFileSync(dictPath());
  const dict = JtdDictionary.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );

  Deno.bench("tokenize: 100文字級の文", () => {
    tokenize(dict, TEXT);
  });

  Deno.bench("analyze: 100文字級の文（NJD後段+句構造込み）", () => {
    analyze(dict, TEXT);
  });
}
