// CI: git タグ（v プレフィックス）が deno.jsonc の version と一致するかを fail-loud 検証し、
// 成功時は bare version を stdout に1行だけ出力する（診断は stderr）。
//
// 呼び出し例: deno run --no-lock --allow-read scripts/verify_tag.ts "$TAG"
//   stdout の bare version は現在コンシューマ無し（release.yml は exit code のみ利用。診断/将来用）。
//   --no-lock は必須: config_version の jsr import が deno.lock を working tree に書き、
//   直後の deno publish（release.yml）を dirty で落とすのを防ぐ（gitignore 済みだが二重防御）。
import { checkReleaseTag } from "./release_tag.ts";
import { readVersion } from "./config_version.ts";
import { VERSION } from "../src/mod.ts"; // 公開 `.` エントリの VERSION（constants.ts の re-export）。

if (import.meta.main) {
  const tag = Deno.args[0];
  if (tag === undefined || tag === "") {
    console.error("usage: verify_tag.ts <tag>");
    Deno.exit(2);
  }
  const version = await readVersion();
  // 公開 `.` エントリが re-export する VERSION が deno.jsonc（JSR publish 版）と drift していないか。
  // 辞書 URL は DICT_REVISION 固定で VERSION とは独立（ADR-0003）＝このガードは publish 版の一致のみが目的。
  // release 時点でも fail-loud 検証する（version_sync.test.ts は dev/CI 側の同一ガード）。
  if (VERSION !== version) {
    console.error(
      `::error::公開 VERSION(${VERSION}) が deno.jsonc の version(${version}) と不一致（deno task bump で同期）`,
    );
    Deno.exit(1);
  }
  const result = checkReleaseTag(tag, version);
  if (!result.ok) {
    console.error(`::error::${result.error}`); // GitHub Actions アノテーション。
    Deno.exit(1);
  }
  console.log(result.version); // stdout は bare version のみ。
}
