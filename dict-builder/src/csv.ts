// naist-jdic CSV のパースと語彙モデル化。
//
// MUST: 列参照は必ず COL 定数経由（プロジェクト規約: col13=発音 と col12=読み の
// 取り違えが最悪の事故。TTS が使うのは発音形）。
// 列レイアウト（0-origin、全行15列固定を事前調査で確認済み）:

export const COL = {
  SURFACE: 0,
  LEFT_ID: 1,
  RIGHT_ID: 2,
  COST: 3,
  POS: 4,
  POS1: 5,
  POS2: 6,
  POS3: 7,
  CTYPE: 8,
  CFORM: 9,
  ORIG: 10,
  READ: 11, // かな綴り。TTS では使わない（発音形は PRON）
  PRON: 12, // 発音形（長音ー正規化済み）— TTS 実使用列
  ACC: 13, // アクセント型 "型/モーラ数"（":"区切りで複合語サブ語展開）
  CHAIN: 14, // アクセント結合規則
} as const;

export const CSV_COLUMNS = 15;

/** アクセント単位（複合語エントリは複数ユニットに展開される）。 */
export type AccentUnit = {
  /** 表層の分割長（UTF-16 単位）。最終ユニットは 0 = 残り全部。 */
  surfLen: number;
  pron: string;
  /** アクセント型。null = 情報なし（"*"）。 */
  accType: number | null;
};

export type LexicalEntry = {
  surface: string;
  leftId: number;
  rightId: number;
  cost: number;
  /** 品詞4階層 + 活用型 + 活用形（posTable に intern される）。 */
  features: readonly [string, string, string, string, string, string];
  /** 結合規則の生文字列。"*" = なし。 */
  chainRule: string;
  units: AccentUnit[];
};

/** "型/モーラ数" または "型" をパースして型だけ返す。"*"/"" は null。 */
const parseAccType = (s: string): number | null => {
  if (s === "*" || s === "") return null;
  const slash = s.indexOf("/");
  const head = slash >= 0 ? s.slice(0, slash) : s;
  if (head === "*" || head === "") return null;
  const v = Number(head);
  if (!Number.isInteger(v) || v < 0) throw new Error(`アクセント型が不正: ${s}`);
  return v;
};

/**
 * CSV 1行 → LexicalEntry。
 * 複合語（ORIG が ':' を含む行）は orig/pron/acc を並列分割してユニット列にする
 * （jpreprocess WordEntry::Multiple と同じ規約。read は使わないため分割不要）。
 */
export const parseCsvLine = (line: string, lineNo: number): LexicalEntry => {
  const f = line.split(",");
  if (f.length !== CSV_COLUMNS) {
    throw new Error(`${lineNo}行目: 列数 ${f.length} != ${CSV_COLUMNS}: ${line.slice(0, 60)}`);
  }

  const orig = f[COL.ORIG];
  let units: AccentUnit[];
  if (orig.includes(":")) {
    const origs = orig.split(":");
    const prons = f[COL.PRON].split(":");
    const accs = f[COL.ACC].split(":");
    if (origs.length !== prons.length || origs.length !== accs.length) {
      throw new Error(`${lineNo}行目: ':' 分割数が orig/pron/acc で不一致`);
    }
    units = origs.map((o, i) => ({
      // 表層は orig セグメント長で分割する（最終ユニットは残り全部 = 0）。
      surfLen: i === origs.length - 1 ? 0 : o.length,
      pron: prons[i],
      accType: parseAccType(accs[i]),
    }));
  } else {
    units = [{ surfLen: 0, pron: f[COL.PRON], accType: parseAccType(f[COL.ACC]) }];
  }

  return {
    surface: f[COL.SURFACE],
    leftId: Number(f[COL.LEFT_ID]),
    rightId: Number(f[COL.RIGHT_ID]),
    cost: Number(f[COL.COST]),
    features: [f[COL.POS], f[COL.POS1], f[COL.POS2], f[COL.POS3], f[COL.CTYPE], f[COL.CFORM]],
    chainRule: f[COL.CHAIN],
    units,
  };
};

export const parseCsv = (text: string): LexicalEntry[] => {
  const entries: LexicalEntry[] = [];
  let lineNo = 0;
  for (const line of text.split("\n")) {
    lineNo++;
    if (line.length === 0) continue;
    entries.push(parseCsvLine(line, lineNo));
  }
  return entries;
};

/** 汎用 interner。id は登場順の連番。 */
export class Interner {
  private readonly map = new Map<string, number>();
  readonly values: string[] = [];

  intern(key: string): number {
    const hit = this.map.get(key);
    if (hit !== undefined) return hit;
    const id = this.values.length;
    this.map.set(key, id);
    this.values.push(key);
    return id;
  }

  get size(): number {
    return this.values.length;
  }
}

export const FEATURE_SEP = "\u0001";

/** features タプル → intern 用キー（素性に現れない制御文字で結合し境界を曖昧にしない）。 */
export const featureKey = (features: readonly string[]): string => features.join(FEATURE_SEP);
