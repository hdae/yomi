// リリースに連動する固定値をまとめる（パッケージ版と、別管理の辞書リビジョン/取得元）。

/**
 * このパッケージ自身のバージョン。単一の真実源は deno.jsonc の version で、これはその焼き込みコピー。
 * 手動編集しないこと。`deno task bump` が deno.jsonc と同時にこの VERSION を surgical 更新し（同一コミット）、
 * リリース時は scripts/verify_tag.ts が、通常時は scripts/version_sync.test.ts が
 * 公開 VERSION === deno.jsonc.version を fail-loud で検証する（drift 検出）。
 */
export const VERSION = "0.4.1";

/**
 * 既定辞書の HF リビジョン（辞書リポ `hdae/yomi-dict` のコミット SHA）。
 * 辞書はパッケージ版と独立に更新されるため、パッケージ版ではなくこのコミットで固定する
 * （`resolve/{revision}/…` は immutable・reproducible）。辞書を差し替えたら HF へ上げ直してこの SHA を更新する。
 * 40桁 hex の SHA はそのまま取得・キャッシュする（不変）。`"main"` 等の可変 ref は既定ホストでは
 * HF revision API（`resolveHfRevision`）で現在の SHA に解決してから取得するので、変わらなければ
 * キャッシュから返る（再 DL 回避）。
 * DECIDED: 版依存をやめ辞書リポのコミットで固定する（docs/decisions/0003）。
 */
export const DICT_REVISION = "ab847217c833593c3aec9875b9bfa6ff9789dc29";

/**
 * 既定辞書の取得元 URL テンプレ（`{revision}` を取得時に解決）。HF dataset `hdae/yomi-dict` の gzip 版。
 * loader は先頭バイトで gzip を自動判定するので、生 `.jtd` を指す URL でも透過的に動く。
 */
export const DICT_URL =
  "https://huggingface.co/datasets/hdae/yomi-dict/resolve/{revision}/naist-jdic.jtd.gz";

/**
 * 既定辞書の HF リポジトリ（dataset）。可変 ref（`"main"` 等）の SHA 解決
 * （`@hdae/fetch-cache/hf` の `resolveHfRevision`）に使う。取得 URL 自体は
 * DICT_URL テンプレが持つ（ミラーへの上書きは `url` オプションで可能なまま）。
 */
export const DICT_REPO = "hdae/yomi-dict";
