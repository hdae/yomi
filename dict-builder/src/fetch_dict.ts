// naist-jdic v0.1.3 の辞書ソースを取得し、data/naist-jdic/ に展開配置する。
// ADR-0004（docs/decisions/0004-dict-source-pinning.md）に基づき、
// タグ固定 + SHA-256 検証つきでダウンロードする（リポジトリには同梱しない）。
//
// 実行: deno run -A src/fetch_dict.ts [--force]

// ADR-0004: ソースは jpreprocess/naist-jdic の tag v0.1.3 に固定する。
// 改版が必要な場合はタグ更新の ADR を追加してからここを書き換える。
const SOURCE_URL = "https://github.com/jpreprocess/naist-jdic/archive/refs/tags/v0.1.3.tar.gz";

// tar 展開後のトップレベルディレクトリ名（GitHub のタグアーカイブ命名規則: <repo>-<tag>）
const ARCHIVE_ROOT_DIR = "naist-jdic-0.1.3";

// 2026-07-06 に実測した値を定数としてピン留め（初回ダウンロード時に確認済み）。
// 一致しない場合は上流の改竄・破損を疑い fail loudly する。
const EXPECTED_TARBALL_SHA256 = "8375d4b337d410fc8d202e027c24e748d890f243c0c1b5bab1fa58777f93d02d";

// data/naist-jdic/ に配置する必要ファイルと、それぞれの期待 SHA-256（同時点で実測）。
// unidic-csj.csv・feature.def・README.md・CHANGELOG.md は初期スコープ外（ADR-0004）。
const REQUIRED_FILES: Record<string, string> = {
  "naist-jdic.csv": "140e0b8189732fa1e65d22079f399b895cb5d7e6ba8b1b1afed656d3fb10b84e",
  "matrix.def": "b8ff0c65c1024680ebf81b820d789435c64b039d077666e67b34093f041eb36a",
  "char.def": "bfe597bb3ff1e7d60a9af8bd92a2b9198a2f994c1581e2892cf5b95a74ca2fc8",
  "unk.def": "d923a2574107eb771f95c00fa9815c794654440337cbdbbd1984400eff4254e5",
  "COPYING": "2bbb0324b5290b4d53b1e0ce6dc50bd3991dde5c592a6d113be0a3e6591eaf0e",
};

// 外部依存を増やさない方針（CLAUDE.md）のため std/path も使わず、
// Deno 組み込みの import.meta.dirname と POSIX 区切りの結合のみでパスを組み立てる。
const PACKAGE_SRC_DIR = import.meta.dirname;
if (PACKAGE_SRC_DIR === undefined) {
  throw new Error("import.meta.dirname が取得できません（ローカルファイル実行のみ対応）。");
}
// dict-builder/src/ の2つ上が repo ルート。data/naist-jdic に CSV を配置する。
const DEST_DIR = `${PACKAGE_SRC_DIR}/../../data/naist-jdic`;

/**
 * バイト列の SHA-256 を16進小文字文字列で返す。
 * 引数の型を Uint8Array<ArrayBuffer> に固定する（SharedArrayBuffer 由来だと
 * digest() が要求する BufferSource と非互換になるため、呼び出し側で保証する）。
 */
async function sha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** ファイルの SHA-256 を計算する。存在しなければ null を返す。 */
async function sha256OfFile(path: string): Promise<string | null> {
  try {
    const data = await Deno.readFile(path);
    return await sha256Hex(data);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}

/** 人間可読なサイズ表記（MiB基準、辞書ファイルは大きいためKiB単位は割愛）。 */
function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

/**
 * data/naist-jdic/ に必要ファイルがすべて揃っていて、かつ期待するチェックサムと
 * 一致しているかを確認する（冪等性判定）。1つでも欠落・不一致なら false。
 */
async function isAlreadyUpToDate(): Promise<boolean> {
  for (const [name, expectedHash] of Object.entries(REQUIRED_FILES)) {
    const actualHash = await sha256OfFile(`${DEST_DIR}/${name}`);
    if (actualHash !== expectedHash) return false;
  }
  return true;
}

/** tarball をダウンロードし、SHA-256 を検証したうえでバイト列を返す。 */
async function downloadTarball(): Promise<Uint8Array> {
  console.log(`ダウンロード中: ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(
      `ダウンロード失敗: HTTP ${response.status} ${response.statusText} (${SOURCE_URL})`,
    );
  }
  const data = new Uint8Array(await response.arrayBuffer());
  console.log(`ダウンロード完了: ${formatSize(data.byteLength)}`);

  const actualHash = await sha256Hex(data);
  if (actualHash !== EXPECTED_TARBALL_SHA256) {
    throw new Error(
      `tarball の SHA-256 が一致しません（改竄・破損・上流更新の可能性）。\n` +
        `  期待値: ${EXPECTED_TARBALL_SHA256}\n` +
        `  実測値: ${actualHash}\n` +
        `上流を意図的に更新する場合は ADR を追加のうえ定数を更新すること。`,
    );
  }
  console.log("tarball の SHA-256 検証: OK");
  return data;
}

/**
 * system tar を呼び出して tarball を展開する。
 * 外部依存を増やさない方針（CLAUDE.md）のため npm/jsr の tar ライブラリは使わず、
 * Deno.Command 経由で OS の tar コマンドを利用する。
 */
async function extractTarball(
  tarballPath: string,
  outputDir: string,
): Promise<void> {
  const command = new Deno.Command("tar", {
    args: ["-xzf", tarballPath, "-C", outputDir],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = await command.output();
  if (code !== 0) {
    throw new Error(
      `tar 展開に失敗しました（exit code ${code}）:\n${new TextDecoder().decode(stderr)}`,
    );
  }
}

/** 展開済みディレクトリから必要ファイルのみを配置先にコピーし、チェックサムを検証する。 */
async function placeRequiredFiles(extractedRoot: string): Promise<void> {
  await Deno.mkdir(DEST_DIR, { recursive: true });

  for (const [name, expectedHash] of Object.entries(REQUIRED_FILES)) {
    const src = `${extractedRoot}/${ARCHIVE_ROOT_DIR}/${name}`;
    const dest = `${DEST_DIR}/${name}`;
    await Deno.copyFile(src, dest);

    const actualHash = await sha256OfFile(dest);
    if (actualHash !== expectedHash) {
      throw new Error(
        `展開後ファイルの SHA-256 が一致しません: ${name}\n` +
          `  期待値: ${expectedHash}\n` +
          `  実測値: ${actualHash}`,
      );
    }
    const size = (await Deno.stat(dest)).size;
    console.log(`  配置完了: ${name} (${formatSize(size)}) SHA-256=${actualHash}`);
  }
}

/** コマンドライン引数を解釈する（--force フラグの有無のみ）。 */
export function parseArgs(args: readonly string[]): { force: boolean } {
  const force = args.includes("--force");
  const unknown = args.filter((a) => a !== "--force");
  if (unknown.length > 0) {
    throw new Error(`未知の引数です: ${unknown.join(", ")}`);
  }
  return { force };
}

async function main() {
  const { force } = parseArgs(Deno.args);

  if (!force && (await isAlreadyUpToDate())) {
    console.log(
      `既に ${DEST_DIR} に最新の naist-jdic v0.1.3 が配置済みです（スキップ）。` +
        ` 再取得するには --force を指定してください。`,
    );
    return;
  }

  const tempDir = await Deno.makeTempDir({ prefix: "naist-jdic-fetch-" });
  try {
    const tarballData = await downloadTarball();
    const tarballPath = `${tempDir}/naist-jdic.tar.gz`;
    await Deno.writeFile(tarballPath, tarballData);

    console.log("tar 展開中...");
    await extractTarball(tarballPath, tempDir);

    console.log(`必要ファイルを ${DEST_DIR} へ配置中...`);
    await placeRequiredFiles(tempDir);

    console.log("完了しました。");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(
      `辞書取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    );
    Deno.exit(1);
  }
}
