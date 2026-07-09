import { crc32, crc32Hex } from "./crc32.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);

Deno.test("既知ベクタ: CRC-32 (IEEE 802.3) の標準チェック値と一致する", () => {
  // "123456789" → 0xCBF43926 は CRC-32/ISO-HDLC の公式チェック値（catalogue of CRC）。
  assert(crc32(ascii("123456789")) === 0xcbf43926, "標準チェック値と不一致");
  assert(crc32(new Uint8Array(0)) === 0, "空入力は 0");
  // 1 バイト・全ゼロの代表値（独立実装と突合済みの固定値）。
  assert(crc32(new Uint8Array([0])) === 0xd202ef8d, "1バイト[0x00]");
  assert(crc32(new Uint8Array(4)) === 0x2144df1c, "4バイト全ゼロ");
});

Deno.test("改竄検知: 1 バイトの差で値が変わる", () => {
  const a = ascii("The quick brown fox jumps over the lazy dog");
  const b = Uint8Array.from(a);
  b[0] ^= 0x01;
  assert(crc32(a) !== crc32(b), "1バイト改竄を検知できない");
});

Deno.test("crc32Hex: 8桁小文字 hex に 0 パディングされる（META.checksums の表現形式）", () => {
  assert(crc32Hex(new Uint8Array(0)) === "00000000", "空入力のパディング");
  assert(crc32Hex(ascii("123456789")) === "cbf43926", "小文字hex");
  assert(/^[0-9a-f]{8}$/.test(crc32Hex(ascii("a"))), "常に8桁小文字hex");
});
