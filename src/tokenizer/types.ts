// tokenizer ドメインの型定義（値・実装から分離）。トークンとラティスエッジ。

/** tokenize が返す1トークン。表層・範囲・品詞・発音・アクセント情報を持つ。 */
export type Token = {
  /** 表層形（正規化後テキストの部分文字列）。 */
  surface: string;
  /** 入力テキスト上の範囲（UTF-16 index）。 */
  start: number;
  /** 範囲の終端（exclusive、UTF-16 index）。 */
  end: number;
  /** [品詞, 細分類1, 細分類2, 細分類3, 活用型, 活用形] */
  pos: readonly string[];
  /** 発音形（カタカナ、無声化マーク ’ 除去済み）。未知語は undefined。 */
  pron?: string;
  /** 生の発音列（’ 含む）。NJD 後段のモーラ化が使う。未知語は undefined。 */
  pronRaw?: string;
  /** 語アクセント型。情報なしは undefined。 */
  accType?: number;
  /** アクセント結合規則。なしは undefined。 */
  chainRule?: string;
  /**
   * 辞書由来のアクセント句連結フラグ。複合語エントリの2ユニット目以降は false
   * （各ユニットが独立アクセント句。jpreprocess extend_splited と同一）。
   * undefined = 未設定（njd_set_accent_phrase が決める）。
   */
  chainFlag?: boolean;
  /** 未知語（本辞書に一致せず unk.def テンプレートから生成された）かどうか。 */
  isUnknown: boolean;
};

/** ラティスの1エッジ（表層区間 [start,end) と、由来・連接コスト情報）。 */
export type LatticeNode = {
  /** 表層の開始位置（UTF-16）。 */
  start: number;
  /** 表層の終了位置（UTF-16、排他）。 */
  end: number;
  /** LEXI エントリ index。未知語は -1。 */
  entryIdx: number;
  /** UNKD レコード index。既知語は -1。 */
  unkIdx: number;
  /** 修正辞書エントリ index。オーバーレイ由来のみ >=0。 */
  overlayIdx: number;
  /** 左文脈 ID（連接コスト行列の行）。 */
  leftId: number;
  /** 右文脈 ID（連接コスト行列の列）。 */
  rightId: number;
  /** 語コスト。 */
  wordCost: number;
};
