// 助数詞・数字の読み変換ルックアップテーブル群（jpreprocess Rust の
// crates/jpreprocess-njd/src/open_jtalk/digit/lut/{class1,class2,class3,numeral,others}.rs
// および digit_sequence/mod.rs の定数群、jpreprocess-core の
// pronunciation/mora.rs（Mora::convert_to_voiced_sound / convert_to_semivoiced_sound）を
// 移植したもの。njd/digit.ts・njd/digit_sequence.ts から参照される。
//
// ---- ConvSet の走査意味論（Rust find_pron_conv_set 相当）----
// 配列を先頭から順に見て、要素の keys が対象語にヒットしたら「即座に」その要素の
// table.get(...) を呼び、結果（undefined を含む）をそのまま返して走査を打ち切る。
// 後続要素へフォールバックすることはない（ヒットしたのに値が無いケースがある）。
// 配列の順序は Rust ソースの定義順と完全一致させている（順序が結果に影響するため
// 変更禁止）。
//
// ---- カナ変換の正準形について ----
// jpreprocess-core の pron! マクロが生成する Mora は常に is_voiced: true
// （crates/jpreprocess-core/src/pronunciation/mod.rs の macro_rules! pron!）。
// Mora の Display 実装（pronunciation/mora.rs）は is_voiced が false のときのみ
// 無声化マーク "’"（QUOTATION）を付けるため、is_voiced: true のモーラは
// MoraEnum のカナ表示形をそのまま連結すればよい。MoraEnum→カナの対応は
// jpreprocess-core の pronunciation/mora_dict.rs の MORA_KATAKANA 表（INTO_STR の
// 構築元）を正としている。

/** pron! マクロ（Rust）→ カナ文字列＋アクセント型への変換結果。 */
export type PronSpec = { kana: string; accent: number };

/** Mora::convert_to_voiced_sound / convert_to_semivoiced_sound のどちらを適用するか。 */
export type DigitType = "voiced" | "semivoiced";

/**
 * find_pron_conv_set 互換のテーブル型。
 * 配列の各要素は (helper 集合, 変換先マップ) の組。呼び出し側（njd/digit.ts の
 * findConv）は先頭から順に `keys.has(key1)` を調べ、最初にヒットした要素の
 * `table.get(key2)` の結果（undefined もあり得る）をそのまま返して打ち切る。
 * 配列順序は意味を持つため、以下の各定数は Rust ソースの定義順を保持している。
 */
export type ConvSet<V> = { keys: Set<string>; table: Map<string, V> }[];

// ============================================================
// MoraEnum → カナ の変換（本ファイル内の pron! 相当エントリ全てで使用する分のみ）。
// jpreprocess-core crates/jpreprocess-core/src/pronunciation/mora_dict.rs の
// MORA_KATAKANA 表から該当バリアントを抜粋。
// ============================================================
const MORA_KANA: Readonly<Record<string, string>> = {
  Chi: "チ",
  Fu: "フ",
  Go: "ゴ",
  Ha: "ハ",
  Hi: "ヒ",
  Hya: "ヒャ",
  I: "イ",
  Ju: "ジュ",
  Ku: "ク",
  Long: "ー",
  Ni: "ニ",
  Re: "レ",
  Ro: "ロ",
  Shi: "シ",
  Ta: "タ",
  To: "ト",
  Xtsu: "ッ",
  Yo: "ヨ",
};

/** pron!([...], accent) の TS 版。MoraEnum 名の配列 → カナ文字列連結。 */
const pron = (moraEnums: readonly string[], accent: number): PronSpec => {
  let kana = "";
  for (const m of moraEnums) {
    const k = MORA_KANA[m];
    if (k === undefined) throw new Error(`未登録の MoraEnum: ${m}`);
    kana += k;
  }
  return { kana, accent };
};

// ============================================================
// class1.rs — 助数詞による数字側読み置換（CONVERSION_TABLE、11要素、定義順維持）
// ============================================================

const NUMERATIVE_CLASS1B = new Set([
  "年",
  "円",
  "年間",
  "年生",
  "年代",
  "年度",
  "年版",
  "年余",
  "年来",
  "えん",
]);
const CONV_TABLE1B = new Map<string, PronSpec>([
  ["四", pron(["Yo"], 0)],
]);

const NUMERATIVE_CLASS1C1 = new Set([
  "人",
  "人月",
  "人前",
  "人組",
]);
const CONV_TABLE1C1 = new Map<string, PronSpec>([
  ["四", pron(["Yo"], 0)],
  ["七", pron(["Shi", "Chi"], 1)],
]);

const NUMERATIVE_CLASS1C2 = new Set([
  "時",
  "時間",
  "時限",
  "時半",
]);
const CONV_TABLE1C2 = new Map<string, PronSpec>([
  ["四", pron(["Yo"], 0)],
  ["七", pron(["Shi", "Chi"], 1)],
  ["九", pron(["Ku"], 0)],
]);

const NUMERATIVE_CLASS1D = new Set([
  "日",
  "日間",
]);
const CONV_TABLE1D = new Map<string, PronSpec>([
  ["七", pron(["Shi", "Chi"], 1)],
  ["九", pron(["Ku"], 0)],
]);

const NUMERATIVE_CLASS1E = new Set(["月"]);
const CONV_TABLE1E = new Map<string, PronSpec>([
  ["四", pron(["Shi"], 0)],
  ["七", pron(["Shi", "Chi"], 1)],
  ["九", pron(["Ku"], 0)],
]);

const NUMERATIVE_CLASS1F = new Set<string>([]);
const CONV_TABLE1F = new Map<string, PronSpec>([
  ["六", pron(["Ro", "Xtsu"], 1)],
  ["八", pron(["Ha", "Xtsu"], 1)],
  ["十", pron(["Ju", "Xtsu"], 1)],
  ["百", pron(["Hya", "Xtsu"], 1)],
]);

const NUMERATIVE_CLASS1G = new Set([
  "個",
  "階",
  "分",
  "発",
  "本",
  "鉢",
  "口",
  "切れ",
  "箱",
  "か月",
  "か国",
  "か所",
  "か条",
  "か村",
  "か年",
  "カ月",
  "カ国",
  "カ寺",
  "カ所",
  "カ条",
  "カ村",
  "カ店",
  "カ年",
  "ケ月",
  "ケ国",
  "ケ所",
  "ケ条",
  "ケ村",
  "ケ年",
  "ヵ月",
  "ヵ国",
  "ヵ所",
  "ヵ条",
  "ヵ村",
  "ヵ年",
  "ヶ月",
  "ヶ国",
  "ヶ所",
  "ヶ条",
  "ヶ村",
  "ヶ年",
  "個月",
  "個口",
  "個国",
  "個条",
  "個年",
  "箇月",
  "箇国",
  "箇所",
  "箇条",
  "箇年",
  "かけ",
  "くだり",
  "けた",
  "価",
  "課",
  "画",
  "回",
  "回忌",
  "回生",
  "回戦",
  "回線",
  "回分",
  "海里",
  "カイリ",
  "浬",
  "角",
  "株",
  "冠",
  "巻",
  "缶",
  "貫",
  "貫目",
  "間",
  "基",
  "期",
  "期生",
  "機",
  "気圧",
  "季",
  "騎",
  "客",
  "脚",
  "球",
  "級",
  "橋",
  "局",
  "曲",
  "極",
  "重ね",
  "斤",
  "金",
  "句",
  "区",
  "躯",
  "計",
  "桁",
  "ケタ",
  "校",
  "港",
  "項",
  "組",
  "件",
  "軒",
  "言",
  "戸",
  "湖",
  "光年",
  "石",
  "ぴき",
  "ぺん",
  "波",
  "派",
  "敗",
  "杯",
  "拍",
  "泊",
  "版",
  "犯",
  "班",
  "匹",
  "疋",
  "筆",
  "俵",
  "票",
  "品",
  "分間",
  "分目",
  "片",
  "篇",
  "編",
  "辺",
  "遍",
  "歩",
  "報",
  "方",
  "法",
  "本立て",
  "頭身",
]);
const CONV_TABLE1G = new Map<string, PronSpec>([
  ["一", pron(["I", "Xtsu"], 1)],
  ["六", pron(["Ro", "Xtsu"], 1)],
  ["八", pron(["Ha", "Xtsu"], 1)],
  ["十", pron(["Ju", "Xtsu"], 1)],
  ["百", pron(["Hya", "Xtsu"], 1)],
]);

const NUMERATIVE_CLASS1H = new Set([
  "．",
  "・",
  "才",
  "頭",
  "着",
  "足",
  "尺",
  "坪",
  "通り",
  "センチ",
  "シーシー",
  "ＣＣ",
  "ｃｃ",
  "ｃｍ",
  "サイクル",
  "サンチーム",
  "シーズン",
  "シート",
  "シリング",
  "シンガポールドル",
  "スイスフラン",
  "スウェーデンクローネ",
  "スクレ",
  "セット",
  "セント",
  "ソル",
  "ゾーン",
  "糎",
  "竿",
  "差",
  "差し",
  "歳",
  "歳児",
  "作",
  "冊",
  "刷",
  "皿",
  "棹",
  "艘",
  "子",
  "視",
  "式",
  "失",
  "室",
  "射",
  "社",
  "勺",
  "種",
  "首",
  "周",
  "周忌",
  "周年",
  "州",
  "週",
  "週間",
  "集",
  "宿",
  "所",
  "勝",
  "升",
  "床",
  "章",
  "色",
  "食",
  "親等",
  "進",
  "進数",
  "品",
  "すじ",
  "そう",
  "そろい",
  "筋",
  "数",
  "寸",
  "世",
  "隻",
  "席",
  "石",
  "節",
  "戦",
  "線",
  "選",
  "銭",
  "層",
  "相",
  "揃",
  "たび",
  "つかみ",
  "つがい",
  "つぶ",
  "つまみ",
  "つ折",
  "つ折り",
  "とおり",
  "とき",
  "ところ",
  "とせ",
  "玉",
  "月",
  "手",
  "束",
  "続き",
  "体",
  "対",
  "卓",
  "樽",
  "反",
  "丁",
  "丁目",
  "鳥",
  "通",
  "掴み",
  "艇",
  "滴",
  "店",
  "転",
  "点",
  "斗",
  "棟",
  "盗",
  "灯",
  "等",
  "等席",
  "等地",
  "等分",
  "答",
  "得",
  "噸",
  "粒",
  "種類",
  "歳馬",
  "世紀",
  "車種",
]);
const CONV_TABLE1H = new Map<string, PronSpec>([
  ["一", pron(["I", "Xtsu"], 1)],
  ["八", pron(["Ha", "Xtsu"], 1)],
  ["十", pron(["Ju", "Xtsu"], 1)],
]);

const NUMERATIVE_CLASS1I = new Set([
  "キロ",
  "カロリー",
  "ｃａｌ",
  "ｋｂ",
  "ｋｇ",
  "ｋｌ",
  "ｋｍ",
  "ｋｔ",
  "ｋｗ",
  "ｋグラム",
  "ｋバイト",
  "ｋヘルツ",
  "ｋメートル",
  "ｋリットル",
  "ｋワット",
  "カナダドル",
  "カラット",
  "ガロン",
  "キュリー",
  "キロカロリー",
  "キログラム",
  "キロトン",
  "キロバイト",
  "キロヘルツ",
  "キロメートル",
  "キロリットル",
  "キロワット",
  "キロワット時",
  "クラス",
  "クローナ",
  "クローネ",
  "グァラニ",
  "ケース",
  "コース",
  "粁",
]);
const CONV_TABLE1I = new Map<string, PronSpec>([
  ["六", pron(["Ro", "Xtsu"], 1)],
  ["十", pron(["Ju", "Xtsu"], 1)],
  ["百", pron(["Hya", "Xtsu"], 1)],
]);

const NUMERATIVE_CLASS1J = new Set([
  "トン",
  "ｔ",
  "タル",
  "テラ",
  "トライ",
]);
const CONV_TABLE1J = new Map<string, PronSpec>([
  ["一", pron(["I", "Xtsu"], 1)],
  ["十", pron(["Ju", "Xtsu"], 1)],
]);

const NUMERATIVE_CLASS1K = new Set([
  "房",
  "柱",
  "％",
  "ポンド",
  "ｐａ",
  "ｐｐｍ",
  "パーセント",
  "パーミル",
  "パスカル",
  "パック",
  "パット",
  "ピーピーエム",
  "ピコ",
  "ページ",
  "頁",
  "ペア",
  "ペセタ",
  "ペソ",
  "ペニー",
  "ペニヒ",
  "ペンス",
  "ポイント",
  "振り",
  "針",
  "袋",
  "張り",
  "平米",
  "平方キロ",
  "平方キロメートル",
  "平方センチメートル",
  "平方メートル",
  "品目",
]);
const CONV_TABLE1K = new Map<string, PronSpec>([
  ["十", pron(["Ju", "Xtsu"], 1)],
]);

/** class1::CONVERSION_TABLE 相当。順序は Rust 定義順（1B→1K）と一致。 */
export const CLASS1_CONVERSION: ConvSet<PronSpec> = [
  { keys: NUMERATIVE_CLASS1B, table: CONV_TABLE1B },
  { keys: NUMERATIVE_CLASS1C1, table: CONV_TABLE1C1 },
  { keys: NUMERATIVE_CLASS1C2, table: CONV_TABLE1C2 },
  { keys: NUMERATIVE_CLASS1D, table: CONV_TABLE1D },
  { keys: NUMERATIVE_CLASS1E, table: CONV_TABLE1E },
  { keys: NUMERATIVE_CLASS1F, table: CONV_TABLE1F },
  { keys: NUMERATIVE_CLASS1G, table: CONV_TABLE1G },
  { keys: NUMERATIVE_CLASS1H, table: CONV_TABLE1H },
  { keys: NUMERATIVE_CLASS1I, table: CONV_TABLE1I },
  { keys: NUMERATIVE_CLASS1J, table: CONV_TABLE1J },
  { keys: NUMERATIVE_CLASS1K, table: CONV_TABLE1K },
];

// ============================================================
// class2.rs — 数字による助数詞側の連濁/半濁（CONVERSION_TABLE、5要素、定義順維持）
// ============================================================

const NUMERATIVE_CLASS2B = new Set([
  "分",
  "版",
  "敗",
  "発",
  "拍",
  "鉢",
  "波",
  "派",
  "泊",
  "犯",
  "班",
  "品",
  "分間",
  "分目",
  "片",
  "篇",
  "編",
  "辺",
  "遍",
  "歩",
  "報",
  "方",
]);
const CONV_TABLE2B = new Map<string, DigitType>([
  ["一", "semivoiced"],
  ["三", "semivoiced"],
  ["四", "semivoiced"],
  ["六", "semivoiced"],
  ["八", "semivoiced"],
  ["十", "semivoiced"],
  ["百", "semivoiced"],
  ["千", "semivoiced"],
  ["万", "semivoiced"],
  ["何", "semivoiced"],
]);

const NUMERATIVE_CLASS2C = new Set([
  "本",
  "匹",
  "疋",
  "票",
  "俵",
  "箱",
  "本立て",
  "杯",
  "針",
  "柱",
]);
const CONV_TABLE2C = new Map<string, DigitType>([
  ["一", "semivoiced"],
  ["三", "voiced"],
  ["六", "semivoiced"],
  ["八", "semivoiced"],
  ["十", "semivoiced"],
  ["百", "semivoiced"],
  ["千", "voiced"],
  ["万", "voiced"],
  ["何", "voiced"],
]);

const NUMERATIVE_CLASS2D = new Set<string>([]);
const CONV_TABLE2D = new Map<string, DigitType>([
  ["三", "voiced"],
  ["六", "semivoiced"],
  ["八", "semivoiced"],
  ["十", "semivoiced"],
  ["百", "semivoiced"],
  ["千", "voiced"],
  ["万", "voiced"],
  ["何", "voiced"],
]);

const NUMERATIVE_CLASS2E = new Set([
  "軒",
  "石",
  "足",
  "尺",
  "かけ",
  "重ね",
  "件",
  "勺",
]);
const CONV_TABLE2E = new Map<string, DigitType>([
  ["三", "voiced"],
  ["千", "voiced"],
  ["万", "voiced"],
]);

const NUMERATIVE_CLASS2F = new Set(["階"]);
const CONV_TABLE2F = new Map<string, DigitType>([
  ["三", "voiced"],
]);

/** class2::CONVERSION_TABLE 相当。順序は Rust 定義順（2B→2F）と一致。 */
export const CLASS2_CONVERSION: ConvSet<DigitType> = [
  { keys: NUMERATIVE_CLASS2B, table: CONV_TABLE2B },
  { keys: NUMERATIVE_CLASS2C, table: CONV_TABLE2C },
  { keys: NUMERATIVE_CLASS2D, table: CONV_TABLE2D },
  { keys: NUMERATIVE_CLASS2E, table: CONV_TABLE2E },
  { keys: NUMERATIVE_CLASS2F, table: CONV_TABLE2F },
];

// ============================================================
// class3.rs — 助数詞の特殊読み（棟→ムネ等）。
//
// Rust 側は (助数詞表層 → 許容読みリスト) がキーだが、このプロジェクトの辞書
// （naist-jdic）は読み(col12相当)を保持せず発音(col13相当)のみを持つ設計のため、
// **発音キーへ焼き直す**。data/naist-jdic/naist-jdic.csv の SURFACE 列が
// Rust 側キーと一致し、かつ POS が「名詞,接尾,助数詞」または「名詞,副詞可能」
// （njd_set_digit が class3 変換を適用する対象と同じ文脈: mod.rs の
// `next.get_pos()` 判定）である行のうち、READ 列（0-origin index 11）が
// Rust の許容読みリストに含まれるものの PRON 列（0-origin index 12）を集合に
// 採用した。59キー全てが辞書でヒットし、フォールバック（辞書に見つからず
// 読みをそのまま採用）は発生しなかった。
//
// 読み→発音が変化した項目（音便等）:
//   - とおり: 読み "トオリ" → 発音 "トーリ"
//   - 通り:   読み "トオリ" → 発音 "トーリ"
// （どちらも長音化。他の57キーは読み=発音で変化なし）
// ============================================================

export type Class3Entry = { surface: string; prons: Set<string> };

export const CLASS3_KEYS: Class3Entry[] = [
  { surface: "棟", prons: new Set(["ムネ"]) },
  { surface: "かけ", prons: new Set(["カケ"]) },
  { surface: "くだり", prons: new Set(["クダリ"]) },
  { surface: "けた", prons: new Set(["ケタ"]) },
  { surface: "すじ", prons: new Set(["スジ"]) },
  { surface: "そろい", prons: new Set(["ソロイ"]) },
  { surface: "たび", prons: new Set(["タビ"]) },
  { surface: "つかみ", prons: new Set(["ツカミ"]) },
  { surface: "つがい", prons: new Set(["ツガイ"]) },
  { surface: "つまみ", prons: new Set(["ツマミ"]) },
  { surface: "とおり", prons: new Set(["トーリ"]) },
  { surface: "ところ", prons: new Set(["トコロ"]) },
  { surface: "とせ", prons: new Set(["トセ"]) },
  { surface: "まわり", prons: new Set(["マワリ"]) },
  { surface: "シーズン", prons: new Set(["シーズン"]) },
  { surface: "セット", prons: new Set(["セット"]) },
  { surface: "握り", prons: new Set(["ニギリ"]) },
  { surface: "回り", prons: new Set(["マワリ"]) },
  { surface: "株", prons: new Set(["カブ"]) },
  { surface: "竿", prons: new Set(["サオ"]) },
  { surface: "筋", prons: new Set(["スジ"]) },
  { surface: "桁", prons: new Set(["ケタ"]) },
  { surface: "ケタ", prons: new Set(["ケタ"]) },
  { surface: "月", prons: new Set(["ツキ"]) },
  { surface: "言", prons: new Set(["コト"]) },
  { surface: "口", prons: new Set(["クチ"]) },
  { surface: "差し", prons: new Set(["サシ"]) },
  { surface: "皿", prons: new Set(["サラ"]) },
  { surface: "山", prons: new Set(["ヤマ"]) },
  { surface: "勺", prons: new Set(["シャク"]) },
  { surface: "尺", prons: new Set(["シャク"]) },
  { surface: "重ね", prons: new Set(["カサネ", "ガサネ"]) },
  { surface: "振り", prons: new Set(["フリ"]) },
  { surface: "針", prons: new Set(["ハリ"]) },
  { surface: "切れ", prons: new Set(["キレ"]) },
  { surface: "束", prons: new Set(["タバ"]) },
  { surface: "続き", prons: new Set(["ツヅキ"]) },
  { surface: "揃", prons: new Set(["ソロイ"]) },
  { surface: "袋", prons: new Set(["フクロ"]) },
  { surface: "柱", prons: new Set(["ハシラ"]) },
  { surface: "張り", prons: new Set(["ハリ"]) },
  { surface: "通り", prons: new Set(["トーリ"]) },
  { surface: "掴み", prons: new Set(["ツカミ"]) },
  { surface: "坪", prons: new Set(["ツボ"]) },
  { surface: "箱", prons: new Set(["ハコ"]) },
  { surface: "鉢", prons: new Set(["ハチ"]) },
  { surface: "晩", prons: new Set(["バン"]) },
  { surface: "品", prons: new Set(["シナ"]) },
  { surface: "瓶", prons: new Set(["ビン"]) },
  { surface: "分け", prons: new Set(["ワケ"]) },
  { surface: "幕", prons: new Set(["マク"]) },
  { surface: "夜", prons: new Set(["ヤ", "ヨ"]) },
  { surface: "粒", prons: new Set(["ツブ"]) },
  { surface: "枠", prons: new Set(["ワク"]) },
  { surface: "棹", prons: new Set(["サオ"]) },
  { surface: "つ折", prons: new Set(["ツオリ"]) },
  { surface: "つ折り", prons: new Set(["ツオリ"]) },
  { surface: "つぶ", prons: new Set(["ツブ"]) },
  { surface: "とき", prons: new Set(["トキ"]) },
];

/** class3::CONV_TABLE3 相当（数字表層→変換後発音）。"三" は Rust 側で未実装のためコメントのみ。 */
export const CLASS3_CONVERSION: Map<string, PronSpec> = new Map([
  ["一", pron(["Hi", "To"], 0)],
  ["二", pron(["Fu", "Ta"], 0)],
  // "三" => "ミ" は Rust ソースでコメントアウトされたまま未実装（class3.rs 参照）。
]);

// ============================================================
// numeral.rs — 位取り語（十/百/千/万…）の連声・連濁と NUMERAL_LIST4/5
// ============================================================

export const NUMERAL_LIST4: Set<string> = new Set([
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "何",
  "幾",
  "数",
]);

export const NUMERAL_LIST5: Set<string> = new Set([
  "十",
  "百",
  "千",
  "万",
  "億",
  "兆",
  "京",
  "垓",
  "𥝱",
  "穣",
  "溝",
  "澗",
  "正",
  "載",
  "極",
  "恒河沙",
  "阿僧祇",
  "那由他",
  "不可思議",
  "無量大数",
]);

const NUMERAL_LIST6 = new Set(["百", "千"]);
const NUMERAL_LIST7 = new Map<string, DigitType>([
  ["三", "voiced"],
  ["六", "semivoiced"],
  ["八", "semivoiced"],
  ["何", "voiced"],
]);

const NUMERAL_LIST8 = new Set(["百"]);
const NUMERAL_LIST9 = new Map<string, PronSpec>([
  ["六", pron(["Ro", "Xtsu"], 0)],
  ["八", pron(["Ha", "Xtsu"], 0)],
]);

const NUMERAL_LIST10 = new Set(["千", "兆"]);
const NUMERAL_LIST11 = new Map<string, PronSpec>([
  ["一", pron(["I", "Xtsu"], 0)],
  ["八", pron(["Ha", "Xtsu"], 0)],
  ["十", pron(["Ju", "Xtsu"], 1)],
]);

/** numeral::DIGIT_CONVERSION_TABLE 相当。順序は Rust 定義順（LIST8→LIST9, LIST10→LIST11）と一致。 */
export const NUMERAL_DIGIT_CONVERSION: ConvSet<PronSpec> = [
  { keys: NUMERAL_LIST8, table: NUMERAL_LIST9 },
  { keys: NUMERAL_LIST10, table: NUMERAL_LIST11 },
];

/** numeral::NUMERATIVE_CONVERSION_TABLE 相当。 */
export const NUMERAL_NUMERATIVE_CONVERSION: ConvSet<DigitType> = [
  { keys: NUMERAL_LIST6, table: NUMERAL_LIST7 },
];

// ============================================================
// others.rs — 人数・日付単体の特殊読み（CONVERSION_TABLE、3要素、定義順維持）
// 値は Rust ソースにある CSV 行文字列をそのまま転記。
// ============================================================

const NUMERATIVE_CLASS4 = new Set(["人"]);
const CONV_TABLE4 = new Map<string, string>([
  ["一", "一人,名詞,副詞可能,*,*,*,*,一人,ヒトリ,ヒトリ,2/3,*"],
  ["二", "二人,名詞,副詞可能,*,*,*,*,二人,フタリ,フタリ,3/3,*"],
]);

const NUMERATIVE_CLASS5 = new Set(["日"]);
const CONV_TABLE5 = new Map<string, string>([
  ["一", "一日,名詞,副詞可能,*,*,*,*,一日,イチニチ,イチニチ,4/4,*"],
  ["二", "二日,名詞,副詞可能,*,*,*,*,二日,フツカ,フツカ,0/3,*"],
  ["三", "三日,名詞,副詞可能,*,*,*,*,三日,ミッカ,ミッカ,0/3,*"],
  ["四", "四日,名詞,副詞可能,*,*,*,*,四日,ヨッカ,ヨッカ,0/3,*"],
  ["五", "五日,名詞,副詞可能,*,*,*,*,五日,イツカ,イツカ,0/3,*"],
  ["六", "六日,名詞,副詞可能,*,*,*,*,六日,ムイカ,ムイカ,0/3,*"],
  ["七", "七日,名詞,副詞可能,*,*,*,*,七日,ナノカ,ナノカ,0/3,*"],
  ["八", "八日,名詞,副詞可能,*,*,*,*,八日,ヨウカ,ヨーカ,0/3,*"],
  ["九", "九日,名詞,副詞可能,*,*,*,*,九日,ココノカ,ココノカ,0/4,*"],
  ["十", "十日,名詞,副詞可能,*,*,*,*,十日,トウカ,トーカ,0/3,*"],
]);

const NUMERATIVE_CLASS6 = new Set(["日間"]);
const CONV_TABLE6 = new Map<string, string>([
  ["一", "一日間,名詞,副詞可能,*,*,*,*,一日間,イチニチカン,イチニチカン,4/6,*"],
  ["二", "二日間,名詞,副詞可能,*,*,*,*,二日,フツカカン,フツカカン,3/5,*"],
  ["三", "三日間,名詞,副詞可能,*,*,*,*,三日,ミッカカン,ミッカカン,3/5,*"],
  ["四", "四日間,名詞,副詞可能,*,*,*,*,四日,ヨッカカン,ヨッカカン,3/5,*"],
  ["五", "五日間,名詞,副詞可能,*,*,*,*,五日,イツカカン,イツカカン,3/5,*"],
  ["六", "六日間,名詞,副詞可能,*,*,*,*,六日,ムイカカン,ムイカカン,3/5,*"],
  ["七", "七日間,名詞,副詞可能,*,*,*,*,七日,ナノカカン,ナノカカン,3/5,*"],
  ["八", "八日間,名詞,副詞可能,*,*,*,*,八日,ヨウカカン,ヨーカカン,3/5,*"],
  ["九", "九日間,名詞,副詞可能,*,*,*,*,九日,ココノカカン,ココノカカン,4/6,*"],
  ["十", "十日間,名詞,副詞可能,*,*,*,*,十日,トウカカン,トーカカン,3/5,*"],
]);

/** others::CONVERSION_TABLE 相当。順序は Rust 定義順（4→5→6）と一致。 */
export const OTHERS_CONVERSION: ConvSet<string> = [
  { keys: NUMERATIVE_CLASS4, table: CONV_TABLE4 },
  { keys: NUMERATIVE_CLASS5, table: CONV_TABLE5 },
  { keys: NUMERATIVE_CLASS6, table: CONV_TABLE6 },
];

// ============================================================
// digit_sequence/mod.rs の定数群
// ============================================================

/** UNKNOWN_DICT_DIGITS: 全角数字1文字 → CSV行文字列。 */
export const UNKNOWN_DICT_DIGITS: Map<string, string> = new Map([
  ["０", "０,名詞,数,*,*,*,*,０,ゼロ,ゼロ,1/2,C3"],
  ["１", "１,名詞,数,*,*,*,*,１,イチ,イチ,2/2,C3"],
  ["２", "２,名詞,数,*,*,*,*,２,ニ,ニ,1/1,C3"],
  ["３", "３,名詞,数,*,*,*,*,３,サン,サン,0/2,C3"],
  ["４", "４,名詞,数,*,*,*,*,４,ヨン,ヨン,1/2,C1"],
  ["５", "５,名詞,数,*,*,*,*,５,ゴ,ゴ,1/1,C3"],
  ["６", "６,名詞,数,*,*,*,*,６,ロク,ロク,2/2,C3"],
  ["７", "７,名詞,数,*,*,*,*,７,ナナ,ナナ,1/2,C3"],
  ["８", "８,名詞,数,*,*,*,*,８,ハチ,ハチ,2/2,C3"],
  ["９", "９,名詞,数,*,*,*,*,９,キュウ,キュー,1/2,C3"],
]);

/** DIGIT_NORMALIZE（Rust では NUMERAL_LIST1 と呼ばれる）。 */
export const DIGIT_NORMALIZE: Map<string, string> = new Map([
  ["○", "〇"],
  ["１", "一"],
  ["２", "二"],
  ["３", "三"],
  ["４", "四"],
  ["５", "五"],
  ["６", "六"],
  ["７", "七"],
  ["８", "八"],
  ["９", "九"],
  ["一", "一"],
  ["二", "二"],
  ["三", "三"],
  ["四", "四"],
  ["五", "五"],
  ["六", "六"],
  ["七", "七"],
  ["八", "八"],
  ["九", "九"],
  ["いち", "一"],
  ["に", "二"],
  ["さん", "三"],
  ["よん", "四"],
  ["ご", "五"],
  ["ろく", "六"],
  ["なな", "七"],
  ["はち", "八"],
  ["きゅう", "九"],
  ["〇", "〇"],
  ["０", "０"],
  ["壱", "一"],
  ["弐", "二"],
  ["貳", "二"],
  ["ニ", "二"],
  ["参", "三"],
  ["し", "四"],
  ["しち", "七"],
  ["く", "九"],
]);

/** NUMERAL_LIST2: index 1..3 = 十/百/千 に対応する CSV 行。index 0 は ""（未使用領域）。 */
export const NUMERAL_LIST2: string[] = [
  "",
  "十,名詞,数,*,*,*,*,十,ジュウ,ジュー,1/2,*",
  "百,名詞,数,*,*,*,*,百,ヒャク,ヒャク,2/2,*",
  "千,名詞,数,*,*,*,*,千,セン,セン,1/2,*",
];

/** NUMERAL_LIST3: index 1..17 = 万..無量大数に対応する CSV 行。index 0 は ""（未使用領域）。 */
export const NUMERAL_LIST3: string[] = [
  "",
  "万,名詞,数,*,*,*,*,万,マン,マン,1/2,*",
  "億,名詞,数,*,*,*,*,億,オク,オク,1/2,*",
  "兆,名詞,数,*,*,*,*,兆,チョウ,チョー,1/2,C3",
  "京,名詞,数,*,*,*,*,京,ケイ,ケー,1/2,*",
  "垓,名詞,数,*,*,*,*,垓,ガイ,ガイ,1/2,*",
  "𥝱,名詞,数,*,*,*,*,𥝱,ジョ,ジョ,1/1,*",
  "穣,名詞,数,*,*,*,*,穣,ジョウ,ジョー,1/2,*",
  "溝,名詞,数,*,*,*,*,溝,コウ,コウ,1/2,*",
  "澗,名詞,数,*,*,*,*,澗,カン,カン,1/2,*",
  "正,名詞,数,*,*,*,*,正,セイ,セー,1/2,*",
  "載,名詞,数,*,*,*,*,載,サイ,サイ,1/2,*",
  "極,名詞,数,*,*,*,*,極,ゴク,ゴク,1/2,*",
  "恒河沙,名詞,数,*,*,*,*,恒河沙,ゴウガシャ,ゴウガシャ,1/4,*",
  "阿僧祇,名詞,数,*,*,*,*,阿僧祇,アソウギ,アソーギ,2/4,*",
  "那由他,名詞,数,*,*,*,*,那由他,ナユタ,ナユタ,1/3,*",
  "不可思議,名詞,数,*,*,*,*,不可思議,フカシギ,フカシギ,2/4,*",
  "無量大数,名詞,数,*,*,*,*,無量大数,ムリョウタイスウ,ムリョータイスー,6/7,*",
];

// ============================================================
// jpreprocess-core pronunciation/mora.rs
// Mora::convert_to_voiced_sound / convert_to_semivoiced_sound の全 match 分岐を
// カナ（正準表示形）どうしの対応として転記。
//
// 重要: Rust 実装は Mora.mora_enum という「列挙値」を丸ごと別の列挙値に置換する
// （文字列の先頭文字だけを書き換える処理ではない）。拗音（ヒャ等、2文字カナ）も
// 1個の MoraEnum バリアントであり、変換後は対応する別バリアントの2文字カナに
// なる。そのためここでは「カナ表示形（1文字 or 2文字）→ カナ表示形」の Map で
// 過不足なく表現できる。
// ============================================================

/** モーラの正準かな（清）→ 濁音化後のかな。convert_to_voiced_sound の全分岐。 */
export const VOICED_MORA: Map<string, string> = new Map([
  ["カ", "ガ"],
  ["キ", "ギ"],
  ["ク", "グ"],
  ["ケ", "ゲ"],
  ["コ", "ゴ"],
  ["キャ", "ギャ"],
  ["キュ", "ギュ"],
  ["キョ", "ギョ"],
  ["キェ", "ギェ"],
  ["サ", "ザ"],
  ["シ", "ジ"],
  ["ス", "ズ"],
  ["セ", "ゼ"],
  ["ソ", "ゾ"],
  ["スィ", "ズィ"],
  ["シャ", "ジャ"],
  ["シュ", "ジュ"],
  ["ショ", "ジョ"],
  ["シェ", "ジェ"],
  ["タ", "ダ"],
  ["チ", "ヂ"],
  ["ツ", "ヅ"],
  ["テ", "デ"],
  ["ト", "ド"],
  ["テャ", "デャ"],
  ["ティ", "ディ"],
  ["テュ", "デュ"],
  ["トゥ", "ドゥ"],
  ["テョ", "デョ"],
  ["ハ", "バ"],
  ["ヒ", "ビ"],
  ["フ", "ブ"],
  ["ヘ", "ベ"],
  ["ホ", "ボ"],
  ["ヒャ", "ビャ"],
  ["ヒュ", "ビュ"],
  ["ヒェ", "ビェ"],
  ["ヒョ", "ビョ"],
]);

/** モーラの正準かな（清）→ 半濁音化後のかな。convert_to_semivoiced_sound の全分岐。 */
export const SEMIVOICED_MORA: Map<string, string> = new Map([
  ["ハ", "パ"],
  ["ヒ", "ピ"],
  ["フ", "プ"],
  ["ヘ", "ペ"],
  ["ホ", "ポ"],
  ["ヒャ", "ピャ"],
  ["ヒュ", "ピュ"],
  ["ヒェ", "ピェ"],
  ["ヒョ", "ピョ"],
]);
