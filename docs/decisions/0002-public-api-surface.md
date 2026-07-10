# ADR-0002: 公開 API はリファレンス実装に対応づけ、薄いファサード＋ドメイン別サブパスで公開する

状態: 採択（2026-07-09、オーナー承認）
関連: 一時期の「公開 API を最小に絞る」方針を**上書きする**（未リリース中の方針転換）。

## 文脈

`@hdae/yomi` は OpenJTalk 系の日本語 G2P で、実装は jpreprocess（Rust）と pyopenjtalk
（Python）の移植。切り出し直後に「公開面は G2P に必要な最小限に絞り、低レベル内部
（NJD/tokenizer/辞書/モーラ表）は非公開」とする最小化を一度入れたが、これは誤りだった:

- リファレンス実装はどちらも「薄いファサード＋細粒度の言語モデルは公開」構造だった。
  - **jpreprocess**: トップ facade は薄い（`JPreprocess` / `NJD` / `Dictionary` /
    `DefaultTokenizer` / `normalize_text_for_naist_jdic`）が、`NJDNode`・`POS`（述語含む）・
    `Pronunciation`/`Mora`・`accent_rule`・各 `njd_set_*` は "public だがサブクレート scoped"。
  - **pyopenjtalk**: `g2p` / `run_frontend`（NJD 素性）が中立コア。`make_label` /
    `extract_fullcontext`（HTS フルコンテキストラベル）だけがモデル/合成固有の尾部。
- 実験プロジェクト（sbv2-web）が `analyzeToNodes` / `buildResult` / `wordPhoneAlignment` /
  `normalizeForDict` など低レベル面を必要とした。最小化はこれらを塞いでいた。

## 決定

公開面を **リファレンス実装の公開面に対応づける**。処理の管轄ごとにディレクトリを切り、
各 `mod.ts` バレルを JSR サブパス entrypoint にする（型は各ドメインの `types.ts` に分離）。

- **薄いファサード `.`**（jpreprocess facade / pyopenjtalk `g2p`+`run_frontend` 相当）:
  `analyze` / `analyzeWithWords` / `analyzeToNodes`(=run_frontend) / `JtdDictionary`＋メタ型 /
  overlay 一式 / 中立建材（`moraToPhones` `moraTones` `punctuationMarks` `wordPhoneAlignment`。
  当初あった `pausePunct` は [0005](0005-punctuation-exposure.md) で置換）＋出力型。
- **細粒度サブパス**: `./text`（正規化・モーラ表）/ `./dict`（辞書・overlay）/
  `./tokenizer`（Token・ラティス）/ `./njd`（NjdNode・品詞述語・chain rule・各処理段）/
  `./g2p`（FrontendResult・音素・トーン・語アライメント）。既存の `./format`（JTD1 コーデック）・
  `./browser`（辞書ローダ）は継続。
- **非公開に留める**: `njd/digit_lut` の変換 LUT 等の実装詳細、`_dict_path`（テスト専用）。
- yomi が持たない `make_label`/`extract_fullcontext` 相当（モデル固有のフルコンテキストラベル）は
  両参照が引く中立境界の外なので、引き続き非公開＝呼び出し側で組む（[0001](0001-neutral-core-no-model-adapters.md)）。
- `analyzeWithWords(dict, text, overlay?) → { result, words }` を facade に追加。1解析で
  `FrontendResult` と語アライメントを返すシュガーで、二重解析を避けつつ NjdNode を露出しない。

## 帰結

- 低レベルの言語モデルが「実装 + export」で使えるようになり、sbv2-web 等の合成側が
  yomi のロジックを再実装せずに済む。ファサードは薄いまま。
- ドメイン境界＝ディレクトリ＝サブパスが一致し、依存は一方向
  （`format,text → dict → tokenizer → njd → g2p → analyze`）。`result↔phonemes` の型循環は
  各ドメイン `types.ts` を最下層に置くことで構造的に解消した。
- 破壊的変更（v1 前・[[yomi-prerelease-breaking-ok]]）。v0.2.0 に束ねる。
- 追加公開シンボルは JSDoc 必須（`deno doc --lint` を全 entrypoint 0 に保つ）。
