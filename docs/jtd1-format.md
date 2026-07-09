# JTD1 辞書バイナリフォーマット v1

JTD1 辞書バイナリの v1（素朴エンコード）仕様。言語非依存（TS リファレンス実装＋将来の
Rust 実装が同一ファイルを読む）。未リリースにつき互換性維持はしない — 変更は formatVersion
を上げて作り直す（fail loudly）。リファレンス実装は `src/format/`（読み手）と
`dict-builder/src/`（書き手）。

## 設計原則

- MUST: リトルエンディアン固定・全セクションのペイロード先頭は **8バイト境界**
  （`new Uint16Array(buf, off, n)` 等でゼロコピー参照するため。JS の TypedArray は
  要素サイズ境界のオフセットを要求する）
- MUST: 各セクションのエンコードは `encoding` ID で識別し、書き手はエンコーダを
  interface 化して差し替え可能にする。**代替エンコードの採否はサイズレポート
  （生/gzip/brotli）の A/B 数字のみを根拠に決める**
- フォーマット内部では個別圧縮しない（ファイル全体の gzip/brotli は配信層の責務）

## コンテナ

```
Header (16B):
  magic          u8[4]  "JTD1"
  formatVersion  u32    = 1
  sectionCount   u32
  reserved       u32
Section table (sectionCount × 16B):
  name      u8[4]  4cc
  encoding  u32    エンコーダID (0 = v1素朴)
  offset    u32    ファイル先頭からのバイトオフセット (8の倍数)
  length    u32    パディングを含まない実長
```

セクション内の可変長サブ配列は、各セクション先頭に u32 のサブヘッダ（配列長の列挙）を
置く自己記述形式とする。詳細はリファレンス実装（`src/format/layout.ts`）の型定義を正とする。

## セクション

### META (JSON, UTF-8)

辞書名 / ソース（例 `jpreprocess/naist-jdic v0.1.3`）/ **COPYING 全文（BSD-3-Clause、
表示義務の履行箇所）** / 語彙数 / ビルド日時 / ビルダーバージョン / セクション別チェックサム /
**posTable**（品詞4階層＋活用型＋活用形のタプルを intern した配列。LEXI の posId が指す）/
**chainRuleTable**（結合規則文字列の intern 配列。`名詞%F2@1/動詞%F2@1` 等はそのまま保持し、
パースはランタイムの責務）。

### TRIE — 表層形索引 (encoding 0: LOUDS)

- 表層形は **UTF-16 コードユニット (u16)** をエッジラベルとする（JS の charCodeAt と一致。
  ビルド時に非BMP文字が現れたら fail loudly — naist-jdic には存在しないことを確認済み）
- LOUDS ビット列 + rank/select 補助構造（256bitブロックのrankディレクトリ + ワード内 popcount）
- 終端ノードのビットベクトル + rank で surfaceId（0..S-1 の密な連番）を得る
- ランタイム要件: common prefix search（入力位置から辿れる全表層形の列挙）

### LEXI — 語彙レコード (encoding 0: Struct of Arrays)

同表層の同音異義エントリは surfaceId 順に連続配置し CSR で引く:

```
entryIndex : u32[S+1]   surfaceId → LEXI エントリ範囲 [start, end)
leftId     : u16[E]     文脈ID (1..1376)
rightId    : u16[E]
cost       : i16[E]     実測範囲 -5,174..21,463
posId      : u16[E]     META.posTable への参照
chainRule  : u8[E]      META.chainRuleTable への参照
unitIndex  : u32[E+1]   エントリ → ユニット範囲（複合語展開）
```

**ユニット** = アクセント単位。原形（col11）が `:` を含む行は複数ユニットに展開される
（`dict-builder/src/csv.ts` の複合語処理を参照）。通常エントリは1ユニット。

```
unitAccType    : u8[U]    アクセント型 0..21（255 = 情報なし）
unitSurfLen    : u8[U]    表層分割長（UTF-16単位。最終ユニットは0=残り全部）
unitPronOffset : u32[U]   READ プールへのオフセット
unitPronLen    : u8[U]
```

NOTE: 上の2ブロックは**論理説明**（役割ごとのグルーピング）。物理配置は要素サイズ降順
（u32 群 → u16 群 → u8 群）でパディングを最小化しており、実際の並びは `layout.ts` の
`LEXI_LAYOUT.arrays` 宣言順が normative（フィールド名も同宣言に従う。例: `chainRuleId`）。

v1 で持たない列（必要になった時点で fail loudly → 列追加）: 読み（col12。TTS実使用は
col13発音形のみ）、原形、活用の細部（posTable のタプルに含む）。

### READ — 発音文字列プール (encoding 0: UTF-16LE 連結)

カタカナ＋「ー」の連結プール u16[]。unitPronOffset/Len が指す。
（A/B候補: 7bit/文字パック、front coding、表層=発音のかな語 dedupe）

### CONN — 連接コスト行列 (encoding 0: i16 素置き)

```
rightSize u32 = 1377, leftSize u32 = 1377   （ヘッダのバイト格納順もこの順）
data : i16[rightSize×leftSize]   cost = data[prevRightId * leftSize + nextLeftId]
```

NOTE: naist-jdic では両次元とも 1377 で対称に見えるが、ヘッダ順は `layout.ts` の
`CONN_LAYOUT.header = ["rightSize", "leftSize"]` が normative。第三者実装はこの順で読むこと
（転置しても次元が等しい間は検出できないため、明示しておく）。

MUST: ID 0 は BOS/EOS。CSV の文脈IDは 1..1376（オフバイワン注意）。生 3.79MB。
（A/B候補: 行クラスタリング/重複行共有 = Vibrato 方式）

### CHAR — 文字種分類 (encoding 0: BMP密配列)

```
catCount u32, カテゴリ表: {invoke u8, group u8, length u8, pad u8} × catCount
catsPacked : u16[65536]  BMP コードポイント → 順序付きカテゴリ列
                         （nibble×4、値は catId+1、0=終端）
```

MUST: ビットマスクではなく**順序**を保存する。lindera の lookup_categories は
char.def 範囲行の出現順でカテゴリを列挙し、その序数（category_ord）が未知語グルーピングの
同一性判定に使われるため。非BMPは DEFAULT カテゴリ。カテゴリ名は META に。生 128KB。

### UNKD — 未知語テンプレート

カテゴリ → CSR → (leftId, rightId, cost, posId) レコード列（unk.def 由来、アクセント情報は
持たない）。

## チェックサム

セクションごとに CRC32 を META に記録（依存ゼロで実装できる最軽量。破損検知が目的であり
暗号強度は不要）。

## ロード契約（ランタイム側）

- 1 ArrayBuffer を受け取り、セクションテーブルを読み、各列を TypedArray ビューとして
  **コピーなしで**保持する。文字列 materialize は参照時に遅延で行う
- formatVersion 不一致・チェックサム不一致・未知の encoding は即例外（黙って劣化しない）
