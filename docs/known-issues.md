# 既知の問題（未解決）

open な問題・作業待ちの項目。意図的な制約は [limitations.md](limitations.md) へ。
出典の詳細は `.claude/reviews/2026-07-10_f641bcd/`（初回全域レビュー）の findings を参照。

## 辞書ローダ（`./loader`、fetch-cache 委譲後の残件）

取得・キャッシュのオーケストレーションは `@hdae/fetch-cache` へ委譲済み
（[decisions/0006](decisions/0006-loader-on-fetch-cache.md)）。W-E-5（cache 書込み失敗が取得成功後でも
全体を throw）は fetch-cache の network 縮退＋`onCacheError` 通知で解消し、cache I/O まわり
（quota / open / put 失敗・`caches` 不在）のテスト責務も fetch-cache 側に移った。残るのは:

- 可変 ref（`"main"`）の SHA 解決がオフライン/HF 障害で失敗すると、有効な SHA 固定キャッシュが
  あっても throw する（W-E-6。last-known-SHA フォールバック無し。`resolveHfRevision` も失敗時
  throw なので fetch-cache 委譲では解消しない）。
- 並行呼び出し（同時 `getDictionary`）の重複 DL 抑止・テストが無い（W-E-7 残件）。
- 二重解凍（validate で1回＋戻り値でもう1回）。fetch-cache への decode フック提案が入り次第
  一本化する（[src/loader/mod.ts](../src/loader/mod.ts) の NOTE）。

## 解決済みの照合（記録）

「本家ソース照合待ち」4点（W-C-6③ P1≡P2 / W-C-7① 小数セパレータ / W-C-2 Rule 08 ラベル /
W-B-1 同点タイブレーク）と「lindera との既知の微差」2点（L-B-1 / L-B-2）は、jpreprocess 0.15.0 /
lindera 3.0.7 のソース照合により**全て本家準拠（holds）で解消**した。前者4点は該当コードの
NOTE/MUST コメントに、後者2点は [limitations.md](limitations.md) に根拠つきで記録済み。
辞書ソース差し替え時の再照合義務は `CLAUDE.md`（後回し節）に記載。
