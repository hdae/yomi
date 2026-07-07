// deno.jsonc から top-level version を読む dev/CI ヘルパ。
//
// NOTE: このファイルは配布パッケージ外（publish.include の allowlist に scripts/ は無い）。
//        したがって src/ の「実行時依存ゼロ MUST」は保たれる。JSONC 解析に jsr:@std/jsonc を使うのは、
//        コメント付き deno.jsonc を正しく解析するため（素朴な正規表現やコメント除去は文字列中の
//        `//`（URL 等）で壊れうる）。dev 用途につき deno.lock は gitignore 済み・実行時は --no-lock。
import { parse } from "@std/jsonc";

/** deno 設定ファイルの top-level version（bare semver）を返す。無ければ fail loud。 */
export const readVersion = async (configPath = "./deno.jsonc"): Promise<string> => {
  const parsed = parse(await Deno.readTextFile(configPath));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`deno 設定の解析に失敗: ${configPath}`);
  }
  const version = (parsed as Record<string, unknown>).version;
  if (typeof version !== "string" || version === "") {
    throw new Error(`${configPath} に string の version フィールドがありません`);
  }
  return version;
};
