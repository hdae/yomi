// 統合テストが使う辞書パスの解決ヘルパ（テスト専用・公開 API ではない）。
//
// 辞書 naist-jdic.jtd は BSD-3-Clause で別管理のため repo に同梱しない。
// CI では `deno task build-dict` で fixtures/naist-jdic.jtd を
// 生成してから統合テストを走らせる。手元では YOMI_DICT_PATH で任意のビルド済み
// 辞書を指せる。
//
// MUST: 辞書が無いとき統合テストは黙って緑にせず、理由を明示ログして skip する
//        （Deno.test の ignore:true で skip 扱い、事前に console.warn で告知）。
//
// NOTE: `deno test` を無権限で走らせても単体テストが動くよう、env/read 権限が
//        無い場合は辞書「無し」として skip する（権限エラーで落とさない）。

const DEFAULT_DICT = new URL("../fixtures/naist-jdic.jtd", import.meta.url).pathname;

/** env 権限が無ければ undefined を返す（NotCapable で落とさない）。 */
const envDictPath = (): string | undefined => {
  if (Deno.permissions.querySync({ name: "env", variable: "YOMI_DICT_PATH" }).state !== "granted") {
    return undefined;
  }
  return Deno.env.get("YOMI_DICT_PATH") ?? undefined;
};

/** 環境変数 YOMI_DICT_PATH、無ければ fixtures/naist-jdic.jtd を返す。 */
export const dictPath = (): string => envDictPath() ?? DEFAULT_DICT;

/** 辞書ファイルが存在するか。存在しない/権限不足なら理由を警告ログして false。 */
export const dictAvailable = (): boolean => {
  const path = dictPath();
  if (Deno.permissions.querySync({ name: "read", path }).state !== "granted") {
    console.warn(
      `[yomi] read 権限が無いため実辞書統合テストを skip します（${path}）。` +
        ` \`deno test -A\` か --allow-read で有効化できます。`,
    );
    return false;
  }
  try {
    Deno.statSync(path);
    return true;
  } catch {
    console.warn(
      `[yomi] 辞書 ${path} が無いため実辞書統合テストを skip します。` +
        ` \`deno task build-dict\` で生成するか YOMI_DICT_PATH を指定してください。`,
    );
    return false;
  }
};
