# ADR-0003: 辞書配布は Hugging Face・コミット固定・gzip 優先取得

状態: 採択（2026-07-09、オーナー承認）
関連: 一時的に GitHub Release アセット配布＋パッケージ版固定だった方式を**上書きする**（未リリース中の転換）。

## 文脈

辞書 `naist-jdic.jtd`（JTD1、~19MB）はパッケージに同梱せず実行時取得する。当初は GitHub Release の
アセットとして `release-dict.yml`（Actions）で毎リリース添付し、取得はパッケージ版で固定していた。しかし:

- **辞書はパッケージ版と独立**にしか変わらない（naist-jdic の版を上げた時だけ）。パッケージを bump する
  たびに同一辞書を上げ直す／版付きファイル名を増やすのは無駄で、コードと辞書の版を無理に一致させていた。
- **GitHub は CORS 制約**が強く、ブラウザからの辞書取得に向かない。
- 19MB の転送は重い。

## 決定

1. **配布先を Hugging Face dataset `hdae/yomi-dict` に移す**（手動 `hf` CLI アップロード）。GitHub Actions での
   辞書処理は廃止（`release-dict.yml` 削除）。辞書は変わった時だけ手で上げ直す。HF の resolve は単純 GET が
   ワイルドカード CORS（302→CDN の両ホップとも CORS ヘッダあり・実測確認済み）。
2. **取得は辞書リポのコミット SHA で固定**する。パッケージに `DEFAULT_REVISION`（HF コミット SHA）を焼き込み、
   `…/resolve/{revision}/…` で immutable・reproducible に取得する（パッケージ版と分離）。辞書差し替え時のみ
   新 SHA に更新する。
3. **gzip 優先取得＋自動解凍**。既定は `.jtd.gz`（~6.4MB）を取得し `DecompressionStream('gzip')` で解凍。
   loader は先頭バイト（`1f 8b`）で gzip を自動判定するので、生 `.jtd` を指す URL でも透過的に動く。HF には
   **`.jtd` と `.jtd.gz` を両方**置く（gz が既定・生は escape hatch/デバッグ用）。
4. **公開 API**: `getDictionary(opts?) → JtdDictionary`（1ステップ・名前と戻り値が一致）と、下位
   `fetchDictionaryBytes(opts?) → Uint8Array`（検証済みの生 JTD1。Worker 転送・独自キャッシュ用）。option は
   `{ url?, revision?, cacheName? }`（`version` は廃止）。

## 帰結

- キャッシュには**取得物（gzip）**を保存する（storage 節約）。取得・キャッシュいずれの経路でも解凍→
  JTD1 セクション CRC で検証し、破損・解凍失敗は evict して真実源から取り直す（self-heal・fail loud）。
- 辞書更新フロー: 辞書を作り直す → `hf upload hdae/yomi-dict … --repo-type dataset` → 得られたコミット SHA を
  `DEFAULT_REVISION` に焼き込む → パッケージを release。辞書が変わらない bump では何もしない。
- 破壊的変更（v1 前・[[yomi-prerelease-breaking-ok]]）。v0.2.0 に束ねる。
- `DecompressionStream` はブラウザ / Deno / Node 18+ / Workers で利用可能＝実行時依存ゼロは不変。
