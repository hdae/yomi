# @hdae/yomi

ブラウザ上で完全ローカル動作する、純 TypeScript の日本語 TTS テキストフロントエンド（G2P）。
テキストを **読み・アクセント（ピッチ核位置）・アクセント句境界** に変換する。OpenJTalk 系互換
（naist-jdic 辞書・lindera 互換の分かち書き・jpreprocess 互換の NJD 後段）。

`../browser-tts` から切り出したクリーンな公開パッケージ。今後はこの yomi を正とし、browser-tts は
研究/実験の参照リポジトリとして残す。

## ドキュメント索引

- [docs/decisions/](docs/decisions/) — ADR（`0001` = 中立コア方針 / `0002` = 公開APIの面 / `0003` = 辞書配布(HF/gzip) / `0004` = 辞書ソース固定(naist-jdic v0.1.3) / `0005` = 実在記号の公開(punctuations)）
- [docs/jtd1-format.md](docs/jtd1-format.md) — 辞書バイナリ JTD1 のフォーマット仕様
- [docs/limitations.md](docs/limitations.md) — 意図的な制約（by-design）/
  [docs/known-issues.md](docs/known-issues.md) — 未解決の既知問題
- 分かち書きの詳細互換仕様（lindera/jpreprocess のオラクル精査）や G2P の設計背景は、研究リポジトリ
  `../browser-tts`（`docs/tokenizer-compat.md` ほか）を参照。

## レイアウト

- `src/` — 純 TS フロントエンド。**実行時依存ゼロを MUST で維持**。処理の管轄ごとにディレクトリを切り、
  各ディレクトリの `mod.ts` がバレル＝JSR サブパス entrypoint（型は各ドメインの `types.ts` に分離）:
  - `.`（`src/mod.ts`）— モデル非依存 G2P の薄いファサード（高頻度パスのみ再export）
  - `./text`（正規化・モーラ表）/ `./dict`（ランタイム辞書・overlay）/ `./tokenizer`（ラティス分かち書き）
    / `./njd`（NJD ノード・品詞・処理段。`analyzeToNodes`=run_frontend 相当）/ `./g2p`（中立 G2P 出力・建材）
  - `./format`（`src/format/mod.ts`）— JTD1 コーデック層（読み手/書き手が共有。辞書ツール向け）
  - `./browser`（`src/browser/mod.ts`）— ブラウザ辞書ローダ（Cache API・CRC 検証）
  - 依存は一方向: `format,text → dict → tokenizer → njd → g2p → analyze`（back-edge なし）
- `dict-builder/` — naist-jdic CSV → JTD1 バイナリの書き手（Deno、開発/CI 時のみ・JSR 非公開）。
  `@hdae/yomi/format` を import する。
- `fixtures/` — `golden-3k.jsonl`（回帰の真実源、committed。`src/golden.test.ts` が全レコードの
  完全一致を固定）と生成辞書（gitignore）。
- `docs/` — 上記索引。

## ツールチェーン・検証

- Deno。Node/pnpm/vp は使わない。**変更後の検証は `deno task check`**（fmt --check / lint /
  check / test を一括）。dict-builder は自身の config で検査（`deno check --config dict-builder/deno.json ...`）。
- JSR 公開向けに **`deno doc --lint`**（全エントリポイント）を 0 に保つ — 公開シンボルは JSDoc 必須。

## 規約（プロジェクト固有）

- **中立コア／モデルアダプタは持たない**（[docs/decisions/0001](docs/decisions/0001-neutral-core-no-model-adapters.md)）。
  中立リクエストは実装＋export、モデル固有（SBV2 等の音素・トーン梱包）は呼び出し側で組む。
- **公開 API はリファレンス実装（jpreprocess / pyopenjtalk）の公開面に対応づける**
  （[docs/decisions/0002](docs/decisions/0002-public-api-surface.md)）。薄いファサード `.`（`analyze` /
  `analyzeWithWords` / `analyzeToNodes` / `JtdDictionary` / 出力型 / overlay / 中立建材）＋ 細粒度の言語モデルを
  ドメイン別サブパス（`./text` `./dict` `./tokenizer` `./njd` `./g2p`）で公開する。型は各ドメイン `types.ts` に分離。
  digit LUT 等の実装詳細は非公開。中立リクエストは実装＋export（[docs/decisions/0001](docs/decisions/0001-neutral-core-no-model-adapters.md)）。
- **実行時依存ゼロ（MUST）**は配布パッケージ `src/` に限定。`scripts/`・`dict-builder/` は dev/CI 用で対象外。
- 辞書CSVの列参照は必ず名前付き定数経由（col13=発音 と col12=読み の取り違えが最悪の事故。TTS が
  使うのは col13 発音形）。col14=アクセント型 / col15=結合規則。matrix.def / 文脈IDは 0..1376 の
  1377次元（0=BOS/EOS。オフバイワン注意）。
- **未リリース（v1前）**。依存は現状オーナーの実験プロジェクトのみ＝**破壊的変更可・互換シム不要・
  fail loudly**（辞書フォーマットは formatVersion を上げて作り直す）。
- ドキュメント言語: README・コード doc は日本語。GitHub/JSR の Description は英語（国際的な入口）。

## 進行中の計画

- **辞書配布(HF)**: 完了（[docs/decisions/0003](docs/decisions/0003-dict-distribution.md)）。辞書は HF dataset
  `hdae/yomi-dict` にアップロード済み（`.jtd` と gzip 版）。`getDictionary`（`JtdDictionary` を返す）＋下位
  `fetchDictionaryBytes`（検証済み生 bytes）、**gzip 優先取得＋先頭バイト自動解凍**（`DecompressionStream`）、
  取得は**辞書リポのコミット SHA で固定**（`DICT_REVISION`／`DICT_URL` は [src/constants.ts](src/constants.ts)。
  パッケージ版と独立）。不変 SHA はキャッシュ。`revision: "main"` 等の可変 ref は HF revision API で現在 SHA を
  解決→SHA固定でキャッシュ（変わらなければ小さな問い合わせのみで再DL回避。resolve は no-store で 304 不可のため）。
  Actions での辞書処理は廃止（`release-dict.yml` 削除）。辞書差し替え時のみ hf CLI で上げ直し `DICT_REVISION` 更新。
- **リリース**: **v0.3.0 まで JSR 公開済み**（v0.3.0 = 2026-07-10。golden-3k 回帰配線・型境界
  バリデータ等の fail-loud 強化・`segmentPhrases` 公開・`/format` 死にコード除去・本家照合6点の決着。
  v0.2.0 = 2026-07-09。SBV2削除・`/format`分離・ドメイン別サブパス再編＝
  [0002](docs/decisions/0002-public-api-surface.md)・HF配布/gzip=
  [0003](docs/decisions/0003-dict-distribution.md)）。
  **v0.4.0 準備済み（タグ/公開待ち）**: light-sbv2 のフィードバック対応 — 実在記号の公開
  （`punctuations` / `leadingPunctuations`＝[0005](docs/decisions/0005-punctuation-exposure.md)、
  `wordPhoneAlignment` 実記号化・`pausePunct` 削除）・ン/ッ の `Mora.consonant` undefined 正規化・
  モーラ表 ヵ 追加（limitations 記載の意図的オラクル逸脱）。
- **辞書ローダの専用パッケージ化（計画）**: Cache API は Deno でも使えるためサポート対象を広げ、
  辞書の取得・キャッシュを専用パッケージへ切り出す予定。それまで `src/browser` のローダ挙動改修は
  据え置き（[docs/known-issues.md](docs/known-issues.md) 参照）。
- **その後（任意・要検討維持、v0.3.0 には含めない）**: 辞書のオンディスク再エンコードでさらに軽量化。
  実測により **LEXI 索引3本の delta+varint 化と rightId 派生化のみ有効**（gzip 配布サイズ
  ~7.6→~4.9MiB）。CONN 行 dedup（1377 行中 1342 行がユニーク）と READ かなパック（gzip 後 0.07MiB
  しか縮まない）は実測で棄却済み。
- **後回し**: 辞書ソースの pyopenjtalk-plus 化（naist-jdic 系統・BSD-3・品質改善＋大規模化）。採用時は
  golden を pyopenjtalk-plus オラクルで再生成する。**辞書差し替え時の再照合義務（MUST）**: ①同点
  タイブレーク方向（yomi は先頭 CSV 行が勝つ。オラクル辞書が jpreprocess-dictionary ビルダ（書込み
  `.rev()` あり）製の場合のみ一致する実装挙動依存）②unk.def 0 行カテゴリの不在
  （[docs/limitations.md](docs/limitations.md) の lindera 節参照）。
