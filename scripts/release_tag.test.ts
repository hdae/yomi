// checkReleaseTag の振る舞いテスト。依存ゼロ（既存テストと同じくローカル assert）。
import { checkReleaseTag } from "./release_tag.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

Deno.test("checkReleaseTag: v 付きで version 一致 → ok・bare を返す", () => {
  const r = checkReleaseTag("v0.1.0", "0.1.0");
  assert(r.ok, "ok であるべき");
  assert(r.ok && r.version === "0.1.0", "bare version は 0.1.0 であるべき");
});

Deno.test("checkReleaseTag: v プレフィックス無し → fail loud", () => {
  const r = checkReleaseTag("0.1.0", "0.1.0");
  assert(!r.ok, "v 無しのタグは拒否されるべき");
});

Deno.test("checkReleaseTag: 大文字 V は拒否（小文字 v に厳格）", () => {
  const r = checkReleaseTag("V0.1.0", "0.1.0");
  assert(!r.ok, "大文字 V は拒否されるべき");
});

Deno.test("checkReleaseTag: bare 部分が version と不一致 → fail", () => {
  const r = checkReleaseTag("v0.2.0", "0.1.0");
  assert(!r.ok, "version 不一致は拒否されるべき");
});
