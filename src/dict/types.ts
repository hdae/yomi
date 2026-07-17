// dict ドメインの型定義（値・実装から分離）。ランタイム辞書のメタ情報と修正辞書エントリ。

/** JTD1 辞書のメタデータ（META セクションを JSON デコードしたもの）。 */
export type DictMeta = {
  /** 辞書名。 */
  dictName: string;
  /** 辞書のビルド元（リポジトリ・タグ）。 */
  source: { repo: string; tag: string };
  /** 辞書をビルドした dict-builder のバージョン。 */
  builderVersion: string;
  /** ビルド日時。 */
  buildDate: string;
  /** 各種要素数の集計（surfaceCount 等）。 */
  counts: Record<string, number>;
  /** posId → [品詞, 細分類1, 細分類2, 細分類3, 活用型, 活用形] */
  posTable: string[][];
  /** chainRuleId → 結合規則文字列（"*" = なし） */
  chainRuleTable: string[];
  /** 文字カテゴリ名の一覧（CHAR セクションの catTable と対応する順序）。 */
  charCategories: string[];
  /** セクション名 → CRC32 チェックサム（16進）。load() の破損検証に使う。 */
  checksums: Record<string, string>;
  /** 辞書データのライセンス表記。 */
  license: string;
};

/** 文字カテゴリ1件の定義（char.def 準拠）。 */
export type CharCategoryInfo = {
  /** カテゴリ名。 */
  name: string;
  /** true なら既知語があっても常に未知語処理を起動する。 */
  invoke: boolean;
  /** true なら同カテゴリの連続文字を1語にまとめる候補を出す。 */
  group: boolean;
  /**
   * char.def の LENGTH 値をそのまま保持する。MeCab では未知語候補の最大文字数だが、
   * 本実装のランタイム未知語生成（src/tokenizer/lattice.ts）はこの値を読まず、候補長は
   * 1文字（group=false）または同カテゴリ連続の最大長（group=true）に固定する（lindera 互換で未使用）。
   */
  length: number;
};

/** 修正辞書エントリ（JSON で与えるユーザー入力形式）。 */
export type OverlayEntry = {
  /** 表層形。正規化済み形（normalizeForDict の不動点）で与えること。 */
  surface: string;
  /** 発音カタカナ（長音「ー」、無声化 ’ 可）。 */
  reading: string;
  /** アクセント型。0 = 平板。 */
  accentType: number;
  /** アクセント結合規則（naist-jdic col15 と同文法）。省略 = "*"。 */
  accentConnRule?: string;
  /** 品詞素性（先頭から一致、省略部は "*"）。省略 = 名詞,固有名詞,一般。 */
  pos?: readonly string[];
  /** 語コスト。省略 = -10000（本辞書より強い）。 */
  cost?: number;
};

/** OverlayEntry を本辞書の文脈IDで解決済みの内部形式（ラティス投入用）。 */
export type ResolvedOverlayEntry = {
  /** 表層形。 */
  surface: string;
  /** 発音カタカナ。 */
  reading: string;
  /** アクセント型。 */
  accentType: number;
  /** アクセント結合規則。"*" は規則なし。 */
  chainRule: string;
  /** 品詞素性（本辞書 posTable 上の完全形）。 */
  pos: readonly string[];
  /** 語コスト。 */
  cost: number;
  /** 連接コスト行列における左文脈ID。 */
  leftId: number;
  /** 連接コスト行列における右文脈ID。 */
  rightId: number;
};
