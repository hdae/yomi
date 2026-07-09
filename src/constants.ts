// リリースに連動する固定値をまとめる（将来の固定値もここに置く）。

/**
 * このパッケージ自身のバージョン。単一の真実源は deno.jsonc の version で、これはその焼き込みコピー。
 * 手動編集しないこと。`deno task bump` が deno.jsonc と同時にこの VERSION を surgical 更新し（同一コミット）、
 * リリース時は scripts/verify_tag.ts が、通常時は scripts/version_sync.test.ts が
 * 公開 VERSION === deno.jsonc.version を fail-loud で検証する（drift 検出）。
 * loadDictionary() が既定でこの版の辞書を取得するため、コードと辞書の版が常に一致する。
 */
export const VERSION = "0.1.0";
