// fetch_dict.ts のネットワーク非依存部分（引数解釈・チェックサム検証ロジック）のテスト。
// 実際のダウンロード・tar展開はテストしない（ネットワーク・外部プロセス依存のため）。
//
// 外部依存を増やさない方針（CLAUDE.md）のため、Deno 組み込みの node:assert のみを使う。

import assert from "node:assert/strict";
import { parseArgs } from "./fetch_dict.ts";

Deno.test("parseArgs", async (t) => {
  await t.step("引数なしでは force が false になる", () => {
    const result = parseArgs([]);
    assert.deepEqual(result, { force: false });
  });

  await t.step("--force を指定すると force が true になる", () => {
    const result = parseArgs(["--force"]);
    assert.deepEqual(result, { force: true });
  });

  await t.step("未知の引数が混ざるとエラーを投げる（fail loudly）", () => {
    assert.throws(
      () => parseArgs(["--unknown"]),
      /未知の引数です/,
    );
  });

  await t.step("未知の引数と --force が混在してもエラーを投げる", () => {
    assert.throws(
      () => parseArgs(["--force", "--typo"]),
      /未知の引数です/,
    );
  });
});

Deno.test("SHA-256 前提確認（Web Crypto API の決定性・改竄検知）", async (t) => {
  // NOTE: これは fetch_dict.ts のコードを呼ばない。fetch_dict.ts の sha256Hex は非公開かつ
  // ネットワーク/FS 依存の経路内にあるため、ここでは同一アルゴリズム（Web Crypto の SHA-256）を
  // テスト内に再実装し、ピン留め検証が依拠する「前提」だけを確認する
  // （fetch_dict.ts 本体のダウンロード・配置ロジックは意図的にテスト対象外）。
  async function sha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  await t.step("空バイト列は既知の SHA-256 定数と一致する", async () => {
    const hash = await sha256Hex(new Uint8Array());
    assert.equal(
      hash,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  await t.step("同一内容のバイト列は同一ハッシュになる（改竄検知の前提）", async () => {
    const a = new TextEncoder().encode("naist-jdic");
    const b = new TextEncoder().encode("naist-jdic");
    assert.equal(await sha256Hex(a), await sha256Hex(b));
  });

  await t.step("1バイトでも異なれば別ハッシュになる（改竄検知が機能する）", async () => {
    const original = new TextEncoder().encode("naist-jdic.csv");
    const tampered = new TextEncoder().encode("naist-jdic.csv ");
    const hashOriginal = await sha256Hex(original);
    const hashTampered = await sha256Hex(tampered);
    assert.notEqual(hashOriginal, hashTampered);
  });
});
