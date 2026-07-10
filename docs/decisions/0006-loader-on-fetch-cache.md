# ADR-0006: 辞書ローダを `@hdae/fetch-cache` の上に再実装し `./loader` に改名する

状態: 採択（2026-07-10、オーナー承認）
関連: [0003](0003-dict-distribution.md)（辞書配布）を実装面で更新 /
[0002](0002-public-api-surface.md) のサブパス `./browser` を改名

## 文脈

`src/browser` は取得・キャッシュ・self-heal を手書きしていたが、(1) `caches.open/put` の失敗
（quota 超過・private mode）が取得成功後でも全体を throw させる（known-issues W-E-5）、
(2) Cache API はブラウザ専用ではなく Deno でも使えるのに `browser` という名前、という問題が
あった。当初は「専用パッケージへの切り出し」を計画していたが、その汎用部分がオーナー自身の
`@hdae/fetch-cache` 0.1.0（JSR）として実現された:

- 実行時依存ゼロ（Web 標準 API のみ）。`caches` の無いランタイム（Node.js 等）では素の
  fetch に自動縮退し、cache I/O 失敗（quota 等）も `onCacheError`（既定 console.warn）で
  通知しつつ network 側へ縮退する — キャッシュは最適化であり正しさの要件ではない。
- `validate` フックはキャッシュ・network の両経路に適用され、破損キャッシュは evict して
  真実源から取り直す（self-heal）— yomi が手書きしていた契約と同一。
- `./hf` 層に `resolveHfRevision`（yomi の手書き resolveRevision と同一エンドポイント）・
  `isCommitSha`（正規表現まで同一）がある。

## 決定

1. **`src/browser` → `src/loader` に改名**し（サブパス `./browser` → `./loader`、破壊的・pre-v1）、
   取得・キャッシュのオーケストレーションを `@hdae/fetch-cache` に委譲する。yomi 側に残るのは
   辞書固有の層のみ: gzip 自動解凍（`DecompressionStream`）・JTD1 magic+CRC 検証（`verifyJtd`）・
   既定 URL/revision（constants）。可変 ref の SHA 解決は `resolveHfRevision`
   （`DICT_REVISION_API` 定数は `DICT_REPO` に置換）。
2. **実行時依存ゼロ MUST の適用範囲を再定義する**: コア（`.`・`./text` `./dict` `./tokenizer`
   `./njd` `./g2p`・`./format`）は実行時依存ゼロ MUST のまま。`./loader` のみ例外として
   **同一オーナーの `@hdae/fetch-cache`（それ自体ゼロ依存）** に依存してよい。第三者依存は
   引き続き持たない。
3. **キャッシュ名前空間は `"yomi-dict"` を明示維持**する（fetch-cache の既定 `"fetch-cache"` に
   変えると既存ユーザーの Cache Storage が孤立し、全員が辞書を再 DL することになる）。
4. **外形契約（公開 API・挙動）は不変**: `getDictionary` / `fetchDictionaryBytes` / `verifyJtd` /
   `GetDictionaryOptions`、既定 URL 形、SHA のみキャッシュ、self-heal、fail loud。加えて
   fetch-cache 由来の `onProgress`（ダウンロード進捗）を options に追加する。
   既存のローダ統合テスト（fetch/caches モック）は委譲後も全表明そのままで green =
   契約保存の証明。

## 帰結

- W-E-5（cache 書込み失敗の巻き添え throw）は fetch-cache の縮退設計で構造的に解消。
  W-E-6（可変 ref のオフライン時 last-known-SHA フォールバック無し）は残存
  （`resolveHfRevision` も失敗時 throw）— known-issues に引き続き記録。
- キャッシュ I/O まわり（quota / open 失敗 / put 失敗 / `caches` 不在）のテスト責務は
  fetch-cache 側に移った。yomi 側テストはローダの外形契約（URL 形・解凍・CRC・self-heal 連携）を縛る。
- **二重解凍を受容** → **解消済み**: 当初、fetch-cache の `validate` は取得物（gzip）に対して
  走るため、検証で一度解凍した後、戻り値（gzip のまま）をもう一度解凍していた（+数十ms/呼び出し）。
  fetch-cache 0.2.0 が `decode` フック（cache には raw を保存・戻り値は decode 適用後・throw は
  破損扱い）を出荷したため、ローダの解凍+CRC 検証を `decode` に一本化した（解凍は両経路とも
  1 回だけ。保存形が gzip のままという性質は不変）。
- 破壊的変更: import パスが `@hdae/yomi/browser` → `@hdae/yomi/loader` に変わる。互換 alias は
  置かない（pre-v1・fail loudly）。
