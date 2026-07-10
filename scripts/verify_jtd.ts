// CI: 生成した JTD1 辞書を magic + 全セクション CRC + サイズ下限で検証する（壊れていれば fail loud）。
// 呼び出し例: deno run --allow-read scripts/verify_jtd.ts fixtures/naist-jdic.jtd
import { verifyJtd } from "../src/loader/mod.ts";

if (import.meta.main) {
  const path = Deno.args[0] ?? "fixtures/naist-jdic.jtd";
  const bytes = Deno.readFileSync(path);
  verifyJtd(bytes); // magic / formatVersion / 全セクション CRC。
  const MIN = 10_000_000; // naist-jdic は ~19MB。生成不全を弾く下限。
  if (bytes.byteLength < MIN) {
    throw new Error(`JTD1 が小さすぎる: ${bytes.byteLength} < ${MIN}`);
  }
  console.log(`JTD1 OK: ${bytes.byteLength.toLocaleString()} bytes`);
}
