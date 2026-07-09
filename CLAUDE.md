# @hdae/yomi

ブラウザ上で完全ローカル動作する、純 TypeScript の日本語 TTS テキストフロントエンド（G2P）。
テキストを **読み・アクセント（ピッチ核位置）・アクセント句境界** に変換する。OpenJTalk 系互換
（naist-jdic 辞書・lindera 互換の分かち書き・jpreprocess 互換の NJD 後段）。

`../browser-tts` から切り出したクリーンな公開パッケージ。今後はこの yomi を正とし、browser-tts は
研究/実験の参照リポジトリとして残す。

## ドキュメント索引

- [docs/decisions/](docs/decisions/) — ADR（`0001` = 中立コア方針 / `0002` = 公開APIの面）
- [docs/jtd1-format.md](docs/jtd1-format.md) — 辞書バイナリ JTD1 のフォーマット仕様
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
- `fixtures/` — `golden-3k.jsonl`（回帰の真実源、committed）と生成辞書（gitignore）。
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

- **リリース**: v0.1.0 は JSR 公開済み。以降の破壊的変更（SBV2削除・`/format`分離・ドメイン別サブパス
  再編＝[0002](docs/decisions/0002-public-api-surface.md)）は **v0.2.0** に束ねる。**辞書データのアップロード
  （HF 配布）完了後に release** する方針＝それまで `deno task bump` しない。
- **辞書配布(HF)**: コード側は完了 — `loadDictionary`→`getDictionary`（`JtdDictionary` を返す）＋
  下位 `fetchDictionaryBytes`（検証済み bytes）、`DEFAULT_URL` を HF dataset へ、
  [release-dict.yml](.github/workflows/release-dict.yml) を HF アップロードへ。**残りはオーナー作業**＝
  HF dataset `hdae/yomi-dict` 作成・`HF_TOKEN`(write) を GitHub secret 登録・初回 `.jtd` アップロード。
  完了後に v0.2.0 を release。
- **その後**: フォーマット軽量化（転送 gzip＋オンディスク再エンコード）。
- **後回し**: 辞書ソースの pyopenjtalk-plus 化（naist-jdic 系統・BSD-3・品質改善＋大規模化）。採用時は
  golden を pyopenjtalk-plus オラクルで再生成する。
