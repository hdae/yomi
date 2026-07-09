// CRC-32 (IEEE 802.3, 反転多項式 0xEDB88320)。セクション破損検知用。
// u32 演算のみでホットパス外（ロード時に1回/セクション）なので十分速い。

const TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** バイト列の CRC-32（IEEE 802.3）を計算する。 */
export const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

/** 8桁小文字hex（META.checksums の表現形式）。 */
export const crc32Hex = (bytes: Uint8Array): string => crc32(bytes).toString(16).padStart(8, "0");
