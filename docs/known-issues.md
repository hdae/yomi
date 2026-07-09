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

## 本家ソース照合待ち（互換の未確定点）

- accent_type の `P1` と `P2` が同一式なのは本家準拠か写経時の取りこぼしか（W-C-6③）。
- digit.ts の小数 skip 状態機: 連続セパレータ（例「1・2・3」）で本家が continue か
  fall-through か（W-C-7①）。
- accent_phrase.ts のコメントラベル「Rule 08」重複の本家対応（W-C-2 付記）。
- 既知語エッジ add 順が lindera（daachorse 頭挿入反転）の同点タイブレークと一致するか（W-B-1）。
  golden-3k 回帰（`src/golden.test.ts`）では実害ゼロを確認・固定済み。同点衝突そのものの
  本家一致は未照合。

## lindera との既知の微差（病的入力のみ・方針未確定）

- 未知語処理 `unknownWordEnd` 更新の `rTo > rFrom` ガード（lindera は unk 行 0 でも進める）（L-B-1）。
- コスト累積に i32 飽和加算が無い（数万文字の無区切り断片でのみ差が出うる）（L-B-2）。
