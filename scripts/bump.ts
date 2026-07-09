// `deno task bump <patch|minor|major>`: deno.jsonc の version を組込み `deno bump-version` で
// surgical に更新（コメント・整形を保全）し、焼き込み src/constants.ts も同じ版へ surgical 更新して、
// その2ファイルの変更を1コミットにする。deno.jsonc(真実源)と VERSION を常に一致させる（drift 防止）。
// tag / push はしない（オーナーが実施。タグ規約 `v<version>` の検証は scripts/release_tag.ts）。
import { readVersion } from "./config_version.ts";

const INCREMENTS = [
  "major",
  "minor",
  "patch",
  "premajor",
  "preminor",
  "prepatch",
  "prerelease",
];

const run = async (cmd: string, args: string[]) => {
  const { code, stdout, stderr } = await new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
};

if (import.meta.main) {
  const increment = Deno.args[0];
  if (increment === undefined || !INCREMENTS.includes(increment)) {
    console.error(`usage: deno task bump <${INCREMENTS.join("|")}>`);
    Deno.exit(2);
  }

  // clean-tree ガード: deno.jsonc / src/constants.ts に未コミット変更があると bump 以外が混ざる。fail loud。
  const status = await run("git", [
    "status",
    "--porcelain",
    "--",
    "deno.jsonc",
    "src/constants.ts",
  ]);
  if (status.code !== 0) {
    console.error(status.stderr);
    Deno.exit(status.code);
  }
  if (status.stdout.trim() !== "") {
    console.error(
      "deno.jsonc / src/constants.ts に未コミットの変更があります。clean な状態で bump してください。",
    );
    Deno.exit(1);
  }

  const before = await readVersion();
  // 組込み deno bump-version（-c で単一ファイルモード強制＝root deno.jsonc のみ触る）。
  const bumped = await run("deno", ["bump-version", "-c", "./deno.jsonc", increment]);
  if (bumped.code !== 0) {
    console.error(bumped.stderr);
    Deno.exit(bumped.code);
  }
  const after = await readVersion();
  if (after === before) {
    console.error(`バージョンが変化しませんでした（${before}）。`);
    Deno.exit(1);
  }

  // 焼き込み src/constants.ts を同じ版へ surgical 更新（ヘッダ等は保全）。deno.jsonc と常に一致させる。
  const constantsPath = "src/constants.ts";
  const versionTs = await Deno.readTextFile(constantsPath);
  const updatedTs = versionTs.replace(
    /export const VERSION = "[^"]*";/,
    `export const VERSION = "${after}";`,
  );
  if (updatedTs === versionTs) {
    console.error(`${constantsPath} の VERSION 行が見つからないか変化しませんでした。`);
    Deno.exit(1);
  }
  await Deno.writeTextFile(constantsPath, updatedTs);

  // version バンプ（deno.jsonc + src/constants.ts）のみを1コミットに（他の staged 変更は含めない）。
  const committed = await run("git", [
    "commit",
    "deno.jsonc",
    "src/constants.ts",
    "-m",
    `chore(release): バージョンを ${after} に更新`,
  ]);
  if (committed.code !== 0) {
    console.error(committed.stderr);
    Deno.exit(committed.code);
  }
  console.error(`${before} -> ${after} を commit しました（tag/push は未実施）。`);
  console.log(after); // stdout は新 version（bare）。
}
