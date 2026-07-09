---
id: A
topic: バイナリ辞書フォーマット(JTD1) & ランタイム辞書 — 書き手(dict-builder)/読み手(src/format,src/dict)の全域レビュー
files_reviewed: 25
date: 2026-07-10
model: opus
commit: f641bcd
---

# Group A — JTD1 フォーマット & ランタイム辞書 全域レビュー

## 総評

書き手（`dict-builder/src`）と読み手（`src/format` + `src/dict`）は **`src/format/layout.ts` の
単一 `computeLayout()` と `src/format/constants.ts` の単一定数定義を両側で共有**しており、「オフセット
計算・4cc・アラインメントの二重実装で黙って乖離する」という最大の事故クラスは構造的に封じられている。
フィールド単位で突合した結果、**コンテナ層（ヘッダ / セクションテーブル / 8B アライン / CRC 対象範囲）と
LOUDS の bit 規約（LBS の select0/rank1 変換式・surfaceId の rank 順・子 id 連続性）は書き手／読み手で
完全に一致**していた。CONN 連接行列の index 式（`data[prevRightId * leftSize + nextLeftId]`）も
docs / builder(parseMatrixDef) / runtime(connectionCost) の三者で整合し、行の読み取り規約
（1列目=右文脈=prev.right、2列目=左文脈=next.left）は lindera の `cost(forward=left.right, backward=right.left)`
= `costs[forward*backward_size+backward]` と一致する（横断所見参照）。col13=発音／col12=読みの取り違えは
名前付き `COL` 定数＋厳格な15列チェック＋`csv.test.ts` の regression で三重に防がれている。

重大な即死バグ（Critical/happy-path Error）は検出しなかった。golden-3k 回帰の存在と、上記の三つ巴一致から、
実辞書での happy-path は健全と判断する。一方で **fail-loudly 原則の"潜在的"な穴が2件**あり、いずれも
「SHA ピン留めした naist-jdic では現在発火しないが、検証をすり抜けて壊れたデータを黙って 0 / 誤分割に
落とす」タイプ（E-A-1 / E-A-2）。プロジェクト規約はこの種の「黙って古い/壊れたデータを補正」を
**Critical(fail-loudly違反)** に列挙しているため、厳格に採れば C 相当だが、上流 SHA ピンでガードされ
現状到達不能なので **E に留めた**（各項に "Critical候補・ガードで降格" を明記）。ロードマップの
**pyopenjtalk-plus 辞書ソース差し替え**が実現すると E-A-2 は現実の発火経路を持つため、差し替え前に潰すべき。

残りは主に (a) docs/jtd1-format.md と実レイアウトの記載乖離（CONN ヘッダ順の直接矛盾・LEXI 物理順）、
(b) 整合性クリティカルな関数のテスト不在（`crc32` に既知ベクタ0件・`parseMatrixDef`/`parseUnkDef` 未テスト・
`JtdDictionary`/overlay は skip-gate 統合テストのみで CI 実質0カバレッジ）、(c) 死にコード
（`JtdContainer.u32` / reader の `fourCC` 再export）、(d) META の Zod 非検証（規約違反・CRC非対象）。

正直な留保: CONN の転置正当性は「lindera 実装挙動との一致」に基づく推論であり仕様保証ではない。
本リポジトリには生成済み辞書（`fixtures/naist-jdic.jtd`）も `data/naist-jdic/matrix.def` も存在せず、
実データでの経験的確認はできていない（golden 回帰が最終的な真実源）。→ W-A-6 / 横断所見で needs-human 明記。

## ファイル別分類テーブル（担当25ファイル）

| # | path | 分類 | 主な理由 |
|---|------|------|----------|
| 1 | src/format/layout.ts | 🟡W | decodeSection の切り詰めガードが `>`（`!==`推奨）＋失敗パス未テスト（W-A-9）。共有オフセット計算は健全 |
| 2 | src/format/bits.ts | 🔵L | rank/select/BitWriter は素朴参照実装と決定的roundtrip済（bits.test.ts）。select0のpadding0推論が繊細で継続注視 |
| 3 | src/format/louds.ts | 🔵L | LBS走査の変換式は builder と一致・roundtrip済。複雑度高（空trie/単一ノードの独立unit test無し） |
| 4 | src/format/reader.ts | 🟡W | 死にコード `u32()`＋`fourCC`再export、8B境界/範囲外throwの失敗パス未テスト、sectionCount無検証（W-A-5） |
| 5 | src/format/constants.ts | 🟢S | 純粋な定数・fourCC。両側の単一真実源。安定 |
| 6 | src/format/types.ts | 🟢S | 型のみ |
| 7 | src/format/mod.ts | 🟢S | バレル（公開面） |
| 8 | src/format/crc32.ts | 🟡W | 実装は教科書的に正しいが**テスト0件**（整合性クリティカル。既知ベクタ必須）（W-A-4） |
| 9 | src/format/bits.test.ts | 🟢S | 境界(31/32/33/255/256/257)×決定的random、逆演算、fail-loudをカバー |
| 10 | src/dict/dictionary.ts | 🟡W | META を `as DictMeta`（Zod非検証・CRC非対象）（W-A-3）＋load/各メソッドが CI 実質未テスト（W-A-8） |
| 11 | src/dict/overlay.ts | 🟡W | 解決ロジックは健全だが unit test 無し（skip-gate統合のみ）（W-A-8）。resolveContextIds の全entry線形走査は perf 継続注視 |
| 12 | src/dict/types.ts | 🟢S | 型のみ |
| 13 | src/dict/mod.ts | 🟢S | バレル |
| 14 | src/dict/overlay_integration.test.ts | 🟡W | 全ケース `ignore:!dictExists`。辞書fixture不在＝CIで実質skip（W-A-8）。振る舞いは良質 |
| 15 | dict-builder/src/build.ts | 🟠E | 非最終ユニットの surfLen=0 サニタイズ欠落（E-A-2）。leftId/rightId/cost の NaN 混入は csv 側と合わせ E-A-1 |
| 16 | dict-builder/src/container_writer.ts | 🔵L | layout.ts の鏡。roundtrip済。align/長さ不一致throwを検証 |
| 17 | dict-builder/src/louds_builder.ts | 🔵L | BFS構築。roundtrip・surrogate・1万語負荷済。複雑度高で継続注視 |
| 18 | dict-builder/src/csv.ts | 🟠E | `Number()` の NaN が range 検証をすり抜け TypedArray で黙って 0 に落ちる（E-A-1）。列取り違えは構造防御済 |
| 19 | dict-builder/src/defs.ts | 🟡W | parseCharDef はテスト済だが**転置クリティカルな parseMatrixDef と parseUnkDef が未テスト**（W-A-6） |
| 20 | dict-builder/src/fetch_dict.ts | 🟡W | 存在しない ADR `0003-dict-source-pinning.md` を参照（ADR-0003はHF配布に上書き済）＝doc乖離（W-A-7） |
| 21 | dict-builder/src/mod.ts | 🟢S | VERSION 定数のみ |
| 22 | dict-builder/src/container_roundtrip.test.ts | 🟢S | u8→u16→u32 の意地悪align・ゼロコピー性・magic/version/欠損 fail-loud を縛る良質テスト |
| 23 | dict-builder/src/csv.test.ts | 🟢S | col12/13 regression・複合語分割・列数不一致throwを縛る |
| 24 | dict-builder/src/louds_builder.test.ts | 🟢S | roundtrip・commonPrefix・surrogate・ソート違反fail-loud・1万語 |
| 25 | dict-builder/src/fetch_dict.test.ts | 🟢S | parseArgs・SHA-256 既知ベクタ・改竄検知 |

**集計: C=0 / E=2 / W=8 / L=4 / S=11**（ファイル単位・各ファイルは最大深刻度で分類）

---

## Error 詳細

### E-A-1 — 数値列の NaN が範囲検証をすり抜け、黙って 0 に落ちる（fail-loudly の潜在穴）
- **path**: `dict-builder/src/csv.ts:91-95`（`Number(f[...])`）／ `dict-builder/src/build.ts:50-57`（範囲検証）
- **症状**: `leftId` / `rightId` / `cost` は `Number(field)` でパースされる。非数値の非空文字列
  （例 `"12x"`, `"abc"`）は `NaN` になる。build.ts の検証は
  `e.leftId <= 0 || e.leftId >= CONTEXT_ID_DIMENSION`（build.ts:51,54）と
  `e.cost < -32768 || e.cost > 32767`（build.ts:57）で行うが、**`NaN` はどの比較も `false`** を返すため
  検証を素通りする。その後 `encodeSection` の `new Uint16Array(...).set(src)` /
  `Int16Array(...).set(src)`（container_writer.ts:48,52）が **`NaN` を黙って 0 に変換**する。
  つまり壊れた文脈IDが「BOS/EOS の 0」に化けてラティスに載る。
- **根本原因**: パース（`Number`）が整数性を保証しないのに、検証が `isInteger` を持たない。`accType` は
  `parseAccType`（csv.ts:55）で `!Number.isInteger(v)` を弾いているのに、leftId/rightId/cost は非対称に緩い。
- **修正案**: `csv.ts` に `parseIntField(s): number`（`Number.isInteger` 不成立で throw）を追加し
  leftId/rightId/cost/POSの数値列に適用する（もしくは build.ts の各検証に `!Number.isInteger(e.x)` を追加）。
  未リリース方針＝fail loudly に合わせ、パース境界で落とすのが本筋。
- **追加テスト**: `csv.test.ts` に「`Number` が NaN になる非数値 leftId は throw」ケース、
  `container_writer` roundtrip に「NaN を含む配列は set 前に検出される」ネガティブケース。
- **深刻度メモ**: 規約の Critical 列挙「fail-loudly違反」に該当。ただし上流の SHA-256 ピン
  （fetch_dict.ts の `REQUIRED_FILES`）が naist-jdic を固定するため**現状到達不能**。→ E に降格。

### E-A-2 — 複合語の非最終ユニットで surfLen=0 が生成されると「残り全部」センチネルと衝突（誤分割）
- **path**: `dict-builder/src/csv.ts:81`（`surfLen: i === origs.length - 1 ? 0 : o.length`）
- **消費側**: `src/tokenizer/tokenizer.ts:88-90`（`const end = len === 0 ? node.end : cursor + len;`）
- **症状**: 複合語行（ORIG に `:` を含む）は orig セグメント長で表層を分割し、**最終ユニットのみ**
  `surfLen=0`＝「残り全部」を表す（docs/jtd1-format.md:74）。ところが**非最終**セグメントが空文字列
  （例 `"あ::い"` → `origs=["あ","","い"]` の中央）だと、その長さ 0 がそのまま `surfLen=0` として書かれ、
  トークナイザは `len===0` を「node.end まで」と解釈して**残りを丸ごと1ユニットに吸わせ、以降のユニットを
  空表層・cursor 追い越しで壊す**。センチネル値と実長 0 が区別できない構造的曖昧さ。
- **根本原因**: builder が「非最終セグメントは非空」という不変を検証せずに `o.length` を u8 へ直書きする。
  0 が二義（実長0 / 残り全部）を持つのに、書き手が二義を作り得る入力を弾いていない。
- **修正案**: `parseCsvLine`（csv.ts:79-84）で **非最終セグメントの `o.length === 0` を throw**（fail loudly）。
  もしくは build.ts の検証ループ（build.ts:58-64）に「最終以外の unitSurfLen===0 は不正」を追加。
- **追加テスト**: `csv.test.ts` に「`あ::い` のような空 orig セグメントは throw」ケース。
- **深刻度メモ**: 現 naist-jdic に空セグメントは無く到達不能だが、**ロードマップの pyopenjtalk-plus 差し替え
  （CLAUDE.md「後回し」）で新ソースを食わせた瞬間に現実の誤分割経路になる**。規約の Critical
  「fail-loudly違反」候補。差し替え前に潰すことを強く推奨。

---

## Warning 詳細

### W-A-1 — docs の CONN ヘッダ順が実装(layout.ts)と直接矛盾
- **path**: `docs/jtd1-format.md:89`（`leftSize u32 = 1377, rightSize u32 = 1377`）
  vs `src/format/layout.ts:92-93`（`header: ["rightSize", "leftSize"]`）
- **症状**: 仕様書はヘッダを **[leftSize, rightSize]** の順で宣言、実装は **[rightSize, leftSize]**。
  builder は `{rightSize, leftSize}`（build.ts:198-201）を同 layout 経由で書き、runtime も同 layout で読むため
  **両者は自己整合**（＝両次元とも 1377 で実害なし）。しかし docs は「言語非依存フォーマット・将来 Rust 実装が
  同一ファイルを読む」ことを目的に掲げており、**この矛盾は第三者実装が転置する罠**（次元が非対称になった瞬間に破綻）。
- **根本原因**: 仕様書のセクション図が layout.ts と独立に手書きされ、ヘッダ列挙順が同期していない。
- **修正案**: docs のヘッダ順を `[rightSize, leftSize]` に修正し、index 式の `1377` を `leftSize` 表記に統一
  （layout.ts:95 のコメントと一致させる）。normative は layout.ts である旨を明記。

### W-A-2 — docs の LEXI フィールド順（論理SoA）が物理シリアライズ順と別物
- **path**: `docs/jtd1-format.md:58-76` vs `src/format/layout.ts:68-83`
- **症状**: docs は `entryIndex, leftId, rightId, cost, posId, chainRule, unitIndex, ..., unitAccType,
  unitSurfLen, unitPronOffset, unitPronLen` の論理順で並べるが、実際の物理順は
  **要素サイズ降順**（u32群: entryIndex/unitIndex/unitPronOffset → u16群: leftId/rightId/cost/posId →
  u8群: chainRuleId/unitAccType/unitSurfLen/unitPronLen）でパディング最小化されている（layout.ts:70-82）。
  docs:34 に「詳細はリファレンス実装 layout.ts を正とする」の逃げがあるので**illustrative** と読めるが、
  型付きブロックの見た目が物理仕様に見え、Rust 実装者を誤導し得る。
- **修正案**: docs の LEXI/CONN ブロックに「物理配置はサイズ降順（layout.ts の宣言順が normative、
  ここは論理説明）」の一文を足すか、ブロックを物理順に並べ替える。

### W-A-3 — META が `as DictMeta` で無検証デコード（Zod規約違反＋CRC非対象）
- **path**: `src/dict/dictionary.ts:122-124`（`JSON.parse(...) as DictMeta`）／ 型 `src/dict/types.ts:3-25`
- **症状**: META セクションは外部バイト → 型付き構造への**デシリアライズ境界**なのに Zod 検証なしの `as` で
  キャスト。かつ META は checksums 自身を保持する都合で**どの CRC でも守られていない**
  （builder は bodySections のみ checksum、build.ts:244）。壊れた META（checksums欠落・posTable型崩れ）は
  `Object.entries(meta.checksums)`（dictionary.ts:128）等の遠い場所で TypeError になり、破損箇所が
  局所化されない。プロジェクト TS 規約「Zod は型境界（deserialize）で使う／API応答を as で通さない」に反する。
- **根本原因**: JTD1 本体（CRC 保護）と違い META は非保護テキストだが、ロード境界での schema 検証が無い。
- **修正案**: `dict/types.ts` に META の Zod スキーマを定義し、`load` の先頭で 1 回 parse
  （ロード時1回＝ホットパス外なので規約上 Zod 可）。`src/browser/mod.ts:55-60` の `verifyJtd` も同様に
  `as { checksums?: ... }` なので合わせて是正候補。
- **追加テスト**: 「checksums 欠落 META は明示エラー」「posTable が配列でない META は境界で throw」。

### W-A-4 — crc32.ts に既知ベクタテストが0件（整合性クリティカル）
- **path**: `src/format/crc32.ts:15-24`（テストファイル無し）
- **症状**: CRC-32 は全セクション破損検知の要（dictionary.ts:127-135 / browser verifyJtd が依存）だが、
  **単体テストが1つも無い**。roundtrip テスト（container_roundtrip.test.ts）も CRC を検証していない。
  実装は反転多項式 0xEDB88320・init/xorout 0xFFFFFFFF で教科書的に正しく見えるが、
  無検証の整合性関数は回帰時に静かに壊れる。
- **修正案**: `crc32.test.ts` を新設し標準チェック値を固定
  （`crc32(new TextEncoder().encode("123456789")) === 0xCBF43926`、`crc32Hex("") === "00000000"`、
  1バイト差で値が変わる改竄検知）。
- **追加テスト**: 上記＋`crc32Hex` の 8 桁 0 パディング（先頭 0 の値）。

### W-A-5 — reader.ts の死にコードと失敗パステスト不在
- **path**: `src/format/reader.ts:70-73`（`u32()`）, `:9,:76-77`（`fourCC` の import と再export）
- **症状**: (a) `JtdContainer.u32()` は「サブヘッダ用」とあるが、自己記述サブヘッダ方式は layout.ts の
  `decodeSection`（ヘッダから scalar を読む方式）に置換済みで**全ソース未使用**（`rg '\.u32\('` 0件）。
  設計置換の残骸。(b) `export { fourCC }`（:77）は再export だが、利用側は全て mod.ts→constants.ts 経由で
  取得しており reader 経由の import は0件＝**死んだ再export**（:9 の import もこの再export専用）。
  (c) `constructor` は `sectionCount`（reader.ts:34）を buffer 長と突き合わせずにループするため、破損ヘッダの
  巨大 sectionCount で `getUint8` の生 RangeError になる（fail-loud だが不親切）。8B境界throw(:48-50)・
  ファイル末尾超throw(:51-53)の失敗パスもテストが無い（roundtrip test は magic/version/欠損のみ）。
- **修正案**: `u32()` と `fourCC` 再export を削除（未リリース＝死にコード掃除は即可）。sectionCount ループ前に
  `HEADER_BYTES + sectionCount*SECTION_ENTRY_BYTES <= buffer.byteLength` を検証して明示メッセージで throw。
- **追加テスト**: 「offset が8非境界」「offset+length がファイル超過」「sectionCount 過大」で throw。

### W-A-6 — parseMatrixDef（転置クリティカル）と parseUnkDef が未テスト
- **path**: `dict-builder/src/defs.ts:104-119`（parseUnkDef）, `:121-173`（parseMatrixDef）
- **症状**: CSV/char.def は `csv.test.ts` で縛られているが、**連接行列の読み取り規約
  （1列目=右文脈、2列目=左文脈、`data[r*leftSize+l]`）**という転置事故の起点が無テスト。
  次元不一致throw(:127-129)・ID範囲外throw(:160)・i16範囲throw(:161)・**欠落セル fail-loud(:167-171)** の
  安全弁も未検証。parseUnkDef の11列チェック(:109)も未テスト。
- **根本原因**: 転置正当性が「lindera 実装との一致」という外部知識に依存しており（横断所見）、
  リポ内に固定した最小 fixture が無いため回帰で静かに転置し得る。
- **修正案**: 小さな 3×3 の合成 matrix.def で `data[r*3+l]` の格納位置と `connectionCost(r,l)` の一致を縛る
  ユニットテスト、欠落セル throw、次元不一致 throw。unk.def は列数不一致 throw と CSR 正順を縛る。
- **needs-human**: 生 `data/naist-jdic/matrix.def` が本リポに無いため実データでの転置は経験確認していない。
  golden 回帰（`fixtures/golden-3k.jsonl`）が最終真実源。

### W-A-7 — fetch_dict.ts が存在しない ADR を参照（doc乖離）
- **path**: `dict-builder/src/fetch_dict.ts:2,7,19`
- **症状**: ヘッダが「ADR-0003（docs/decisions/**0003-dict-source-pinning.md**）に基づき」と書くが、
  実在するのは `docs/decisions/0003-dict-distribution.md`（＝HF配布）のみ。`git log` 上、init 時の ADR-0003
  （ソースピン留め）が `cf5a7b5 feat(browser)!` で HF 配布決定に**上書き**され、ソースピン留めの根拠 ADR が
  消失。fetch_dict.ts のソースピン設計（tag v0.1.3・SHA-256）は現在どの ADR にも紐付いていない。
- **根本原因**: ADR-0003 番号を再利用して内容を差し替え、参照元コメントを更新しなかった。
- **修正案**: (a) ソースピン留めを独立 ADR（例 0004-dict-source-pinning）に切り出して fetch_dict.ts の
  参照を張り替える、または (b) 0003 内にソースピン節を統合して参照を `0003-dict-distribution.md#…` に直す。
  CLAUDE.md の「未traceableな歴史参照をコメントに残さない」に沿って修正。

### W-A-8 — JtdDictionary / OverlayDictionary が CI で実質未カバレッジ（skip-gate 統合のみ）
- **path**: `src/dict/dictionary.ts`（load/connectionCost/unitPron/unitPronRaw/charCategoriesOf）,
  `src/dict/overlay.ts`（resolveEntry/resolveContextIds/lookup）
- **症状**: これらを触るテスト（`overlay_integration.test.ts`, `tokenizer_integration.test.ts`,
  `g2p/word_alignment.test.ts:41`, `browser/mod.test.ts:349`）は**全て `ignore: !dictExists`** で、
  辞書 fixture `fixtures/naist-jdic.jtd` はリポに未コミット（`fixtures/` には golden-3k.jsonl のみ）。
  → `deno task build-dict` を走らせない素の CI/チェックアウトでは、辞書組み立て・CRC不一致throw
  （dictionary.ts:131-134）・DEFAULT欠落throw(:103-104)・unitPron の U+2019 除去(:199)・
  charCategoriesOf の非BMP DEFAULT(:219-221) などが**一切実行されない**。振る舞いは持つのにテスト空白。
- **根本原因**: 実辞書に強く依存する統合テストのみで、合成 JTD1 を使った unit テストの層が無い。
  （container_roundtrip は format 層まで。JtdDictionary 組み立ては未到達。）
- **修正案**: `dict-builder/buildDictionary` で作る**極小合成辞書**（数語）を用いた unit テストを追加し、
  load→trie→LEXI→READ→CONN→CHAR→UNKD の各ビューと connectionCost/unitPron/charCategoriesOf、
  overlay の resolveContextIds（品詞前方一致・代表エントリ借用）・lookup・fail-loud を CI 無条件で縛る。
  合成辞書なら CRC 検証パス（verifyChecksums:true）も無条件でテストできる。
- **追加テスト（失敗パス優先）**: CRC 改竄→throw、DEFAULT カテゴリ欠落→throw、未正規化overlay surface→throw、
  核範囲外→throw、未知品詞→throw（現在は dict 有り時のみ）。

### W-A-9 — decodeSection の切り詰めガードが緩い＋失敗パス未テスト
- **path**: `src/format/layout.ts:146-148`
- **症状**: `if (plan.totalBytes > length) throw`。正常ビルドでは `length === totalBytes`
  （encodeSection が totalBytes 丁度を吐き、writeContainer が length=bytes.length を書く）。`>` は
  「length が想定より**長い**」破損（builder のlength誤計算・混線）を素通りさせる。また `length` が
  ヘッダ列（header.length*4）未満だと `dv.getUint32`（layout.ts:142）が生 RangeError になる（明示チェック無し）。
  この throw 経路群にテストが無い。
- **修正案**: `plan.totalBytes !== length` で throw（より厳格な fail-loud）。ヘッダ読み取り前に
  `length >= layout.header.length * 4` を検証して明示メッセージ化。
- **追加テスト**: 切り詰めセクション・過長セクション・ヘッダ未満長で throw。

---

## JTD1 セクションレイアウト — 書き手/読み手の対応（実コード行番号）

```
                         ┌─────────────────────────── 書き手 (dict-builder) ───────────────────────────┐
                         │                                                                              │
  JTD1 ファイル全体        writeContainer()  container_writer.ts:63-93                                     読み手 (src/format,src/dict)
  ┌───────────────────┐  header/table を書き、各 section を 8B align 配置                                  JtdContainer  reader.ts:24-56
  │ Header 16B        │  magic  = MAGIC          :78  (constants.ts:15 fourCC("JTD1"))  ── 検証 ─▶ reader.ts:28  MAGIC 一致
  │  magic u8[4]      │  formatVersion = 1       :79  (constants.ts:17)                 ── 検証 ─▶ reader.ts:30-33 FORMAT_VERSION
  │  formatVersion u32│  sectionCount            :80                                    ── 読取 ─▶ reader.ts:34
  │  sectionCount u32 │  reserved = 0            :81                                                (sectionCount 無検証 = W-A-5c)
  │  reserved u32     │
  ├───────────────────┤  section table entry (16B) :83-90                              ── 読取 ─▶ reader.ts:37-55
  │ Section table     │   name u8[4] = fourCC(name) :85                                          name = fromCharCode :39-44
  │  name/enc/off/len │   encoding                  :86                                          encoding :45
  │  × sectionCount   │   offset (8B倍数)           :87 (align() :67-74)  ── MUST 8B ─▶ reader.ts:48-50  offset%8 検証
  │                   │   length = bytes.length     :88 (パディング除外)  ── 範囲 ────▶ reader.ts:51-53  off+len<=buf 検証
  ├═══════════════════┤
  │ META (JSON UTF-8) │  build.ts:230-247 (checksums=bodySectionsのみ :244) ─ CRC非対象 ─▶ dictionary.ts:122-124 JSON.parse as(=W-A-3)
  ├───────────────────┤
  │ TRIE  encoding 0  │  encodeSection(TRIE_LAYOUT) build.ts:165-176        ── 対称 ───▶ decodeSection(TRIE_LAYOUT) dictionary.ts:138
  │  hdr×6/lbs/term/lbl│  buildLouds() louds_builder.ts:24-76                            LoudsTrie dictionary.ts:139-145 / louds.ts:22
  ├───────────────────┤   LBS=1^d・0 (BFS) :57-62  select0(v)/rank1 変換 ── 一致 ───▶ louds.ts:53-63 blockStart/child
  │ LEXI  encoding 0  │  build.ts:178-194                                   ── 対称 ───▶ dictionary.ts:147-148
  │  entryIndex u32   │  物理順=サイズ降順 layout.ts:68-83 (docs論理順と別=W-A-2)         全列ゼロコピー dictionary.ts:87-97
  ├───────────────────┤
  │ READ  u16 pool    │  build.ts:196 (internPron dedup :97-104)            ── 対称 ───▶ dictionary.ts:150-151 / unitPron :193
  ├───────────────────┤
  │ CONN  i16 行列     │  build.ts:198-201 {rightSize,leftSize}=1377         ── 対称 ───▶ dictionary.ts:153-154
  │  data[r*leftSize+l]│  parseMatrixDef defs.ts:162 data[r*leftSize+l]     ── 一致 ───▶ connectionCost dictionary.ts:183-184
  │                   │  header 順 [rightSize,leftSize] layout.ts:92 (docs [left,right]=W-A-1・両1377で無害)
  ├───────────────────┤
  │ CHAR  cat/packed  │  build.ts:203-208 (parseCharDef defs.ts:23-93)      ── 対称 ───▶ dictionary.ts:156-164 / charCategoriesOf :218
  ├───────────────────┤
  │ UNKD  CSR records │  build.ts:210-219                                   ── 対称 ───▶ dictionary.ts:166-167
  └───────────────────┘
                         全 body section の CRC32: build.ts:244 crc32Hex(s.bytes)  ── 同一byte域 ─▶ dictionary.ts:130-134
                         （length=s.bytes.length=unpadded。読み手も s.length=unpadded を CRC ＝範囲一致・確認済）
```

**アラインメント不変（確認済）**: `SECTION_ALIGN=8 ≥ 最大要素幅4`。section offset が 8B 境界（reader.ts:48-50 で検証）、
`computeLayout`（layout.ts:33-45）が各配列を要素幅へ切り上げ → 絶対オフセット = 8の倍数 + 要素幅の倍数 =
要素幅の倍数。ゆえに `new Uint32Array/Uint16Array/Int16Array(buffer, at, n)`（layout.ts:154-166）は
アラインメント RangeError を起こさない。`container_roundtrip.test.ts` の NASTY_LAYOUT（u8→u16→u32）が
この意地悪を縛る（:18-25,:68-73）。

**LOUDS bit 規約（書き手↔読み手一致・確認済）**:
- LBS: ノード v の子数 d_v を `1^d_v` + 終端 `0`（louds_builder.ts:57-62）。ノード v のブロック終端 0 =
  `(v+1)` 番目の 0 = `select0(v+1)`（louds.ts:59）、ブロック開始 = `select0(v)+1`（v=0 は 0）（louds.ts:53-54）。
- 子 id 連続: 先頭子 = `rank1(start)+1`（+1 は 1-bit を持たない根 node0 の補正）（louds.ts:63）。ラベル昇順
  （builder が code unit 昇順で group、louds_builder.ts:54-56）→ 二分探索可（louds.ts:64-73）。
- surfaceId = terminal の rank1 順 = `rank1(v+1)-1`（louds.ts:79）。builder の `surfaceOrder` push 順
  （louds_builder.ts:49）と BFS 同順で一致。単一ノード/2ノードを手計算で追い、rank/select は
  `bits.test.ts` が境界サイズ×決定的randomで参照実装と一致確認済。

---

## 横断所見

- **依存方向: 違反なし（確認済）**。`src/dict` は `../format/*`（上流）と `../text/*`（`format,text →
  dict` で上流）のみ import（dictionary.ts:6-18, overlay.ts:10-14）。back-edge（dict→tokenizer/njd/g2p）は無し。
  dict-builder は `@hdae/yomi/format` のみ import で、dev/CI 専用ゆえ実行時依存ゼロ MUST の対象外。
- **CONN 転置の正当性（推論・needs-human）**: builder は matrix.def 各行を「1列目=r（右文脈=prev.right）、
  2列目=l（左文脈=next.left）」として `data[r*leftSize+l]`（defs.ts:162）に格納し、runtime は
  `data[prevRightId*leftSize+nextLeftId]`（dictionary.ts:184）で引く。これは lindera の
  `cost(forward=left.right, backward=right.left)=costs[forward*backward_size+backward]` と一致する。
  ただし両次元 1377 のため header の label 誤り（W-A-1）も転置も**実行時に検出不能**で、正当性は
  lindera 実装挙動への依存＝仕様保証ではない。本リポに生 matrix.def / 生成辞書が無く経験確認できないため、
  golden-3k 回帰が最終真実源。→ W-A-6 の最小 fixture テストで内部一致だけでも固定すべき。
- **CSV パースの naive さ（Low・要doc）**: `csv.ts:65` は `line.split(",")` で RFC4180 クォート非対応。
  ただし「全行15列固定」を前提に厳格な列数チェック（csv.ts:66-68）で守り、埋め込みカンマは
  **列数不一致→throw（fail-loud）** に落ちる（黙って col12/13 がずれることはない）。SHA ピン留めソース前提では
  妥当だが、`docs/limitations.md` 相当に「JTD1 builder の CSV は naist-jdic 前提の non-quoting パーサ」と
  明記するのが望ましい（現状 docs 索引に limitations.md が無い）。
- **overlay 構築の perf（Low・継続注視）**: `resolveContextIds`（overlay.ts:108-112）は overlay エントリ毎に
  全 LEXI エントリ（数十万）を線形走査して代表 leftId/rightId を借用。早期 return するが overlay 数百件×
  数十万で最悪 O(10^8)。ホットパス外（構築時1回）だが「1ms級」コメント（overlay.ts:6-8）は実辞書規模で
  楽観的な可能性。posId→代表エントリの逆引き表を1回だけ構築すれば O(1) 化できる。
- **accType 検証の緩さ（Low）**: docs はアクセント型 0..21（jtd1-format.md:73）だが、検証は
  `0 <= accType < 255`（build.ts:61）と u8 範囲のみ。100 のような明らかに異常な型を弾かない。実害は薄いが、
  fail-loud を突き詰めるなら上限を意味のある値に締められる（needs-human: 上限の正値）。
- **build.ts 出力パスの doc drift（Low）**: 冒頭コメント `data/dict/naist-jdic.jtd`（build.ts:2）に対し
  実出力は `fixtures/naist-jdic.jtd`（build.ts:274,286）。コメント修正のみ。
- **META 非CRC の設計上の帰結（Low・既知/不可避）**: checksums 自身を META が持つため META は自己検証不能。
  W-A-3 の Zod 検証はこの穴を「型健全性」の面から埋める補完策（CRC の代替ではない）。

---

### needs-human（推測で断定しない項目）
1. CONN 転置の実データ正当性（W-A-6 / 横断）: 生 matrix.def・生成辞書が本リポに無く経験未確認。lindera 一致は推論。
2. surfLen=0 二義の消費側全経路（E-A-2）: tokenizer.ts:88-90 は確認したが、njd 以降で unitSurfLen を
   再解釈する箇所が他に無いかは Group 外（未確認）。
3. accType 上限の正しい値（Low）: docs は 0..21 だが 21 が硬い上限かは辞書仕様の確認が要る。
