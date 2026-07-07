// jpreprocess の normalize_text_for_naist_jdic の忠実移植。
// オラクル互換の MUST 要件（jpreprocess/src/normalize_text.rs）。
//
// NOTE: これは NFKC ではない。'-'→U+2212(MINUS SIGN)、'~'→U+301C(WAVE DASH)、
// 半角空白→U+3000 など naist-jdic 辞書の表層に合わせた専用の全角化テーブル＋
// 濁点・半濁点のステートフル合成。NFKC で代用すると分かち書きがオラクルとずれる。

const HALFWIDTH = new Map<number, number>([
  // 記号
  [0x0020, 0x3000], // 半角空白 → 全角空白（U+3000 は SYMBOL カテゴリ。空白は消えない）
  [0x00a5, 0xffe5], // ¥ → ￥
  [0x005c, 0xffe5], // \ → ￥
  [0x002d, 0x2212], // - → −(MINUS SIGN)
  [0x007e, 0x301c], // ~ → 〜(WAVE DASH)
  [0x0060, 0x2018], // ` → ‘
  [0x0022, 0x201d], // " → ”
  [0x0027, 0x2019], // ' → ’
  // 半角和文記号
  [0xff61, 0x3002], // ｡ → 。
  [0xff62, 0x300c], // ｢ → 「
  [0xff63, 0x300d], // ｣ → 」
  [0xff64, 0x3001], // ､ → 、
  [0xff65, 0x30fb], // ･ → ・
]);
// 半角カタカナ ｦｧｨｩｪｫｬｭｮｯｰ (U+FF66..U+FF70) と ｱ..ﾝ (U+FF71..U+FF9D)
{
  const target = "ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノ" +
    "ハヒフヘホマミムメモヤユヨラリルレロワン";
  for (let i = 0; i < target.length; i++) {
    HALFWIDTH.set(0xff66 + i, target.charCodeAt(i));
  }
}

const VOICED_MARKS = new Set([0x3099, 0x309b, 0xff9e]);
const SEMIVOICED_MARKS = new Set([0x309a, 0x309c, 0xff9f]);

const mapFromPairs = (pairs: string): Map<number, number> => {
  const m = new Map<number, number>();
  for (let i = 0; i < pairs.length; i += 2) {
    m.set(pairs.charCodeAt(i), pairs.charCodeAt(i + 1));
  }
  return m;
};

const VOICED = mapFromPairs(
  "カガキギクグケゲコゴサザシジスズセゼソゾタダチヂツヅテデトドハバヒビフブヘベホボ" +
    "ウヴワヷヰヸヱヹヲヺヽヾ" +
    "かがきぎくぐけげこごさざしじすずせぜそぞただちぢつづてでとどはばひびふぶへべほぼ" +
    "うゔ",
);
const SEMIVOICED = mapFromPairs("ハパヒピフプヘペホポはぱひぴふぷへぺほぽ");

/**
 * テキストをトークナイズ前の正規形にする。
 * 1. HALFWIDTH 表による専用全角化（ヒットしない U+0021..U+007E は +0xFEE0）
 * 2. 濁点・半濁点（合成用/spacing/半角）を直前のかなと合成。合成できない
 *    マークは黙って落ちる（"あ゛"→"あ"）— jpreprocess と同挙動
 */
export const normalizeForDict = (input: string): string => {
  let out = "";
  let prev = -1; // 保留中の1文字（次が濁点なら合成される）

  for (let i = 0; i < input.length; i++) {
    let c = input.charCodeAt(i);
    const mapped = HALFWIDTH.get(c);
    if (mapped !== undefined) c = mapped;
    else if (c > 0x0020 && c < 0x007f) c += 0xfee0;

    const voiced = VOICED_MARKS.has(c);
    const semivoiced = SEMIVOICED_MARKS.has(c);
    if (voiced || semivoiced) {
      const combined = prev >= 0 ? (voiced ? VOICED.get(prev) : SEMIVOICED.get(prev)) : undefined;
      if (combined !== undefined) out += String.fromCharCode(combined);
      else if (prev >= 0) out += String.fromCharCode(prev);
      prev = -1; // マーク自体は出力しない
    } else {
      if (prev >= 0) out += String.fromCharCode(prev);
      prev = c;
    }
  }
  if (prev >= 0) out += String.fromCharCode(prev);
  return out;
};

/**
 * lindera Segmenter の文分割: 「。」「、」\n \t を区切りとして、区切り文字を
 * 含めた断片列を返す（各断片が独立ラティス = BOS/EOS リセット。連接コストは
 * 断片を跨がない）。空断片はスキップ。
 */
export const splitFragments = (text: string): { start: number; end: number }[] => {
  const fragments: { start: number; end: number }[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0a || c === 0x09 || c === 0x3002 || c === 0x3001) {
      fragments.push({ start, end: i + 1 });
      start = i + 1;
    }
  }
  if (start < text.length) fragments.push({ start, end: text.length });
  return fragments;
};
