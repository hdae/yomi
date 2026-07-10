# ADR-0005: 実在記号（句読点）を正規形で公開し、語アライメントを実記号ビューにする

状態: 採択（2026-07-10、オーナー承認）
関連: [0001](0001-neutral-core-no-model-adapters.md)（中立コア）/ [0002](0002-public-api-surface.md)（公開 API の面）

## 文脈

従来の `FrontendResult` は句読点を `pauseAfter: "none" | "short" | "long"` に畳んでおり、
「！」「？」「…」「’」「−」は解析結果から完全に脱落していた（読点系→short、句点系→long、
それ以外→無視）。一方、下流の TTS モデル（Style-Bert-VITS2 / AivisSpeech Engine 系）は
`["!", "?", "…", ",", ".", "'", "-"]` を音素として合成に使い、特に疑問符は語尾イントネーション
に大きく効く。消費側（light-sbv2）から「記号情報を出してほしい」「文末 pauseAfter が実在句点
由来か文末強制かを区別したい」という要望を受けた。

実装上の事実（実測）:

- 対象記号はすべて NJD ノードとして表層を保ったまま g2p 層（`segmentPhrases`）に届いて
  いる。復元に tokenizer / NJD の変更は不要。
- ASCII `", "` のように naist-jdic に無い記号は、隣接文字と併合された未知語1ノード
  （表層 `"，　"`）になる。→ 写像はノード表層の完全一致ではなく**文字単位**が必要。
- `’` は品詞が `記号,括弧閉`、`！？…−` は `記号,一般`。→ 品詞ではなく**表層**で写す。

## 決定

1. **正規形句読点の中立集合**を採用する: `"!" "?" "…" "," "." "'" "-"` の7種
   （`src/g2p/punctuation.ts` の `punctuationMarks`）。SBV2 / AivisSpeech 系の句読点音素
   集合と同一だが、複数モデル系で共有される事実上の標準として「中立の建材」に位置づける
   （モデル固有梱包を持たない方針 = ADR-0001 とは矛盾しない）。写像対象は
   `、 ， 。 ． ！ ？ … ’ − －`（normalizeForDict 後の形）。表に無い記号（括弧・空白・
   `‥` 等）は写像されず落ちる。
2. **実在記号をフィールドとして公開する**:
   - `AccentPhrase.punctuations: string[]` — 句直後に実在した記号の正規形列（出現順）。
   - `FrontendResult.leadingPunctuations: string[]` — 先頭句より前の記号。記号だけの入力
     では全記号がここに入る（本家 SBV2 系は記号だけの独立アクセント句を作るが、yomi は
     jpreprocess の句モデル（実モーラを持つ句のみ）を維持し、句を作らない置き場を用意する）。
   - `PhraseSegment.punctuations: PunctuationMark[]` — 生の1文字と正規形の対（細粒度用）。
3. **`pauseAfter` は現行互換の導出値として残す**。品詞ベース（読点=short / 句点=long・
   文末 long 強制）のまま変えない。punctuations は表層ベースで独立に決まる（例: ASCII
   カンマ由来の `"，　"` は品詞 `記号,*` なのでポーズを作らないが、punctuations には
   `","` が入る）。「実在の句点で終わったか」は `punctuations` の `"."` で判定できる。
4. **`wordPhoneAlignment` を実記号ビューへ変更する（破壊的）**。記号要素は
   `{surface: 生の1文字, phones: [正規形]}` で出現順に出す。pauseAfter からの合成
   （読点→`","`・句点/文末→`"."`）は廃止し、テキストに実在しない記号は要素にしない。
   これに伴い lossy な導出ヘルパ `pausePunct` は削除する（punctuations が上位互換）。

## 帰結

- 破壊的変更: `wordPhoneAlignment` の出力から合成 `","`/`"."` 要素が消え、実在記号要素
  （文末の実在しない `"."` は出ない）に置き換わる。`pausePunct` は削除。未リリース同然
  （依存は light-sbv2 のみ・pre-v1）なので互換シムは置かない。
- 不変条件（テストで表明）: `wordPhoneAlignment(...).flatMap(w => w.phones)` は
  `leadingPunctuations + 各句の（モーラ音素 + punctuations）` と完全一致する。また
  leading と句別 punctuations は全記号ノードの写像を漏れなく二分する。
- golden-3k は無風（突合は moras / nucleus / devoiced / pauseAfter の射影比較で、
  pauseAfter のロジックは不変）。
- 消費側は `punctuations` を音素列に混ぜることで SBV2 系の `given_phone` に記号を流せる。
  疑問符の実在も `"?"` で判定できる（`MoraSpec.pseudo === "question"` より直接的）。
- 正規形の字母を広げる場合（`‥` `・` 等)は写像表（`PUNCT_BY_CHAR`）に足すだけだが、
  「何を落とすか」も仕様なので変更時は本 ADR を更新する。
