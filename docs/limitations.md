# 制約（by-design）

意図的な仕様・互換性・アーキテクチャ上の制約。バグではない（未解決の問題は
[known-issues.md](known-issues.md)）。変更する場合は理由と影響（golden 互換・API）を添えて ADR 化する。

## OpenJTalk / jpreprocess 互換まわり

- **`njd_set_long_vowel` は実装しない。** 本家 OpenJTalk で廃止（全コメントアウト）済みで
  jpreprocess も未実装のため、パイプラインから意図的に省略している（[src/njd/frontend.ts](../src/njd/frontend.ts)）。
- **アクセント結合規則の負値は 0 にクランプする。** Rust（jpreprocess）は
  `(mora_size as isize + add_type) as usize` で負値が巨大値に wrap するが、その再現は無意味なので
  0 に丸める。負になる組は実データで発生する（browser-tts の golden 実測で 100k 文中 2 件）ため、
  golden 照合ではこの 2 件を既知逸脱（allowlist）として扱う（[src/njd/accent_type.ts](../src/njd/accent_type.ts)）。
- **核位置がモーラ数を超える値は忠実に保持する**（辞書由来の値を黙って補正しない）。golden 照合の
  等価規約は browser-tts `docs/golden-format.md` を参照。
- **`moraTones` の範囲外核は尾高相当にクランプする。** 尾高（核=モーラ数）は言語的に正当
  （下降は次句頭で実現）で、それを超える核も尾高として扱う意図的縮退。呼び出し側（overlay 等）の
  軽微な逸脱を許容するためで、挙動は `src/g2p/tones.test.ts` で固定している。
- **正規化は NFKC ではない。** jpreprocess 互換の専用全角化＋ステートフル濁点合成
  （[src/text/normalize.ts](../src/text/normalize.ts)）。合成できない濁点マークが落ちるのも本家同挙動。

## lindera 互換まわり（本家ソース照合済み・現行辞書では出力不変）

- **未知語 `unknownWordEnd` の更新に `rTo > rFrom` ガードを置く。** lindera 3.0.7 は未知語
  生成規則が 0 行のカテゴリでも `unknown_word_end` を無条件に進める（viterbi.rs:578）が、
  naist-jdic v0.1.3 は char.def の全 11 カテゴリが unk.def に 1 行以上を持つためガードは恒真で、
  どんな入力でも出力差は生じない（差は入力ではなく**辞書形状**の性質）。unk.def 0 行カテゴリを
  持つ辞書へ差し替えた場合のみ乖離しうる（[src/tokenizer/lattice.ts](../src/tokenizer/lattice.ts)）。
- **Viterbi のコスト累積は f64 の非飽和加算。** lindera 3.0.7 は i32 の `saturating_add`
  （viterbi.rs:607,634 ほか）。乖離には最小コスト経路自体が i32::MAX（≈2.1e9）へ到達する必要が
  あり、全エッジが観測最大級コストという最良仮定でも約 4 万文字の無区切り断片が下限（現実には
  10^5〜10^6 文字級）。f64 は 2^53 まで整数を厳密に保持するため yomi 側に精度上の弱点はなく、
  非互換は「本家のクランプを再現しない」の一点のみ。文分割後の実用入力では到達不能。

## モーラ表

- **「ヵ」は本家に無い意図的拡張。** jpreprocess `mora_dict.rs` の表は「ヶ」のみで「ヵ」を
  持たず、本家では未マッチ文字として読点（Touten）扱い＝無音で消える。yomi は
  `ヵ = k/a` を1エントリ追加している（[src/text/mora_table.ts](../src/text/mora_table.ts)）。
  動機は AivisSpeech のモーラ表とのパリティと、`splitMoras` をかな記法（AquesTalk 風等）の
  パースに使う消費側の完全性。**乖離しうる面は「辞書に無い未知チャンク内の ヵ」のみ**
  （`ヵ月`・`ヵ所` 等は naist-jdic の辞書語で、発音欄はカタカナ読みのためモーラ表を通らない。
  golden-3k は全レコード一致を維持＝実測で無風）。オラクル厳密一致が要る場合はこの
  1エントリを外す。

## dict-builder

- **CSV パーサは naist-jdic 前提の non-quoting・15列固定。** RFC 4180 のクォートは解釈しない。
  埋め込みカンマは列数不一致として fail-loud に落ちる（黙って列がずれることはない）。
  辞書ソースは SHA-256 ピン留め（[decisions/0004](decisions/0004-dict-source-pinning.md)）が前提。
