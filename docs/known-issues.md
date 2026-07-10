# 既知の問題（未解決）

open な問題・作業待ちの項目。意図的な制約は [limitations.md](limitations.md) へ。
出典の詳細は `.claude/reviews/2026-07-10_f641bcd/`（初回全域レビュー）の findings を参照。

## ブラウザ辞書ローダ（専用パッケージ化予定のため据え置き）

辞書の取得・キャッシュは Deno でも Cache API が使えることが分かったため、後日専用パッケージへ
切り出す計画。それまで以下は意図的に手を入れない:

- cache 書込み失敗（quota / private mode）が、辞書の取得・検証成功後でも `getDictionary` 全体を
  throw させる（W-E-5。JSDoc の「非対応環境は fetch のみ」という記述とも乖離）。
- 可変 ref（`"main"`）の SHA 解決がオフライン/HF 障害で失敗すると、有効な SHA 固定キャッシュが
  あっても throw する（W-E-6。last-known-SHA フォールバック無し）。
- `caches` 未定義経路・resolve 失敗・put 失敗・並行呼び出しのテストが無い（W-E-7）。

## 解決済みの照合（記録）

「本家ソース照合待ち」4点（W-C-6③ P1≡P2 / W-C-7① 小数セパレータ / W-C-2 Rule 08 ラベル /
W-B-1 同点タイブレーク）と「lindera との既知の微差」2点（L-B-1 / L-B-2）は、jpreprocess 0.15.0 /
lindera 3.0.7 のソース照合により**全て本家準拠（holds）で解消**した。前者4点は該当コードの
NOTE/MUST コメントに、後者2点は [limitations.md](limitations.md) に根拠つきで記録済み。
辞書ソース差し替え時の再照合義務は `CLAUDE.md`（後回し節）に記載。
