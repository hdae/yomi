---
id: F
topic: テスト品質横断 & ドキュメント整合
files_reviewed:
  tests:
    - src/mod.test.ts
    - src/text/normalize.test.ts
    - src/text/mora_table.test.ts
    - src/format/bits.test.ts
    - src/njd/njd.test.ts
    - src/njd/digit_lut.test.ts
    - src/g2p/word_alignment.test.ts
    - src/tokenizer/tokenizer_integration.test.ts
    - src/dict/overlay_integration.test.ts
    - src/browser/mod.test.ts
    - dict-builder/src/csv.test.ts
    - dict-builder/src/container_roundtrip.test.ts
    - dict-builder/src/louds_builder.test.ts
    - dict-builder/src/fetch_dict.test.ts
    - scripts/release_tag.test.ts
    - scripts/version_sync.test.ts
  docs:
    - README.md
    - CLAUDE.md
    - docs/jtd1-format.md
    - docs/decisions/0002-public-api-surface.md
    - docs/decisions/0003-dict-distribution.md
date: 2026-07-10
model: sonnet
---

# Group F: テスト品質横断 & ドキュメント整合

## 総評

テストの個々の作り込みは総じて質が高い（jpreprocess/lindera 移植の正しさをオラクル駆動で検証する
方針が一貫しており、タウトロジーや `toBeTruthy` 級の曖昧 assert はほぼ皆無）。一方で2つの構造的な
問題がある。

1. **`fixtures/golden-3k.jsonl`（9.9MB, committed）を消費するコードが存在しない**（下記詳報）。
   CLAUDE.md が「回帰の真実源」と明言している資産が、リポジトリの誕生以来ずっと機能していない。
2. **G2P パイプラインの中核アルゴリズム（ラティス Viterbi・NJD 数字列変換・アクセント句境界18規則
   ・NJD 発音確定・CRC32）が、実辞書 fixture 経由の間接テストにしか触れられていない、もしくは
   それすら無い。** 実辞書 fixture（`fixtures/naist-jdic.jtd`）は `.gitignore` 対象で `deno task
   build-dict` を実行するまで存在せず、素の clone では 12/91 のトップレベル `Deno.test` が
   `ignore: true` で黙って skip される（詳細は後述）。

ドキュメントは概ね実装と一致している（README のコード例・ADR-0002/0003 は逐語で突合し矛盾なし）。
CLAUDE.md は golden-3k の記述が事実と矛盾しており Error 級、加えて「進行中の計画」節が実際の
リリース状態より1歩遅れている（Warning）。

## golden-3k.jsonl 調査結果

### 経緯

- `fixtures/golden-3k.jsonl` は yomi リポジトリの**最初のコミット** `c592071`（"init", 2026-07-07）で
  丸ごと追加された（`git log --follow --oneline -- fixtures/golden-3k.jsonl` の結果は `c592071 init`
  の1件のみ）。**「6acd455 の大規模 refactor で消費者が失われた」という当初の作業仮説は誤り**
  だった、根拠: 全21コミットの diff を `git log --all -p -S'golden'` で総なめしても、golden-3k を
  読み込む import/テストコードは一度も存在しない。ヒットするのは常にコメント・ドキュメントのみ
  （`.gitignore:22`、`deno.jsonc:44` の publish 除外コメント、`CLAUDE.md:29,69`、
  `src/tokenizer/tokenizer.ts:4` の設計コメント「golden の NJD ノード単位と1:1になる」）。
  つまり **yomi 誕生時点から一度も配線されたことがない**。
- 一方、切り出し元リポジトリ `../browser-tts` の `docs/decisions/0010-g2p-release-repo.md:26-28`
  （yomi 切り出しを決めた当の ADR）には明記がある:

  > 新 repo の構成 = `frontend`（コア）＋`dict-builder`（CI の辞書ビルド用）＋`golden-3k` fixture＋CI。
  > ゴールデンの Python オラクル（`tools/golden/pyoracle` 等）は本実験 repo に残置し、**committed な
  > `golden-3k.jsonl` だけ**を持参して CI 回帰に使う。

  つまり「fixture だけ持ってきて CI 回帰に使う」ことが計画段階の明文の意図であり、
  `fixtures/golden-3k.jsonl` はその計画の**半分**（fixture の持参）だけが実行され、**もう半分
  （回帰として使う消費者コード）が実装されないまま今日に至っている**。
- 消費者側の実装は `../browser-tts` に実在する: `tools/eval/src/golden_match.ts`
  （`tools/eval/deno.json` の `golden-match` タスクから起動、`deno task golden-match`）。これは
  単体テストではなく、分かち書き・発音一致率を計算する評価ハーネス（境界一致判定・
  fillerMerge/njdSplit 分類・アクセント核の jpreprocess usize-wrap 等価規約など、決して自明でない
  ロジックを持つ）。読み込み先は `tools/golden/fixtures/golden-3k.jsonl`（yomi 側とはパスが異なる
  が中身は同じ生成系列）。yomi の CI（`.github/workflows/ci.yml`）にはこれに相当するステップが
  一切無い（`deno task build-dict` の後は `deno test` のみ）。

### 結論

**Error（🟠）**: CLAUDE.md:29 の「`fixtures/golden-3k.jsonl`（回帰の真実源、committed）」という記述は、
現在のコードベースの実態と矛盾する。9.9MB の committed アセットが指す "regression" は実行時に
一切参照されず、golden に対する分かち書き/発音/アクセントの一致率を検証するコードはリポジトリの
どのコミットにも存在しない。これは「小さくコメントアウトされていた」程度の話ではなく、**この
プロジェクトの生成コミットからずっと機能していない**という事実であり、`docs/known-issues.md`
（CLAUDE.md の想定する index、現状 yomi には未作成）候補として記録すべき水準。

### 修正案（本レビューは修正禁止のため候補提示のみ）

1. **本格対応**: `../browser-tts/tools/eval/src/golden_match.ts` のロジックを yomi 側に移植し、
   `deno task golden-match` 相当のタスク（または `fixtures.test.ts` のような専用テスト）として
   CI に組み込む。ただし JTD1 v1 は col12（読み）等一部の列を意図的に持たない
   （`docs/jtd1-format.md:78-79`）ため、golden との一致率評価がどの粒度で成立するか設計が要る
   （needs-human: 100%一致ではなく閾値付き一致率評価にする、等の設計判断が必要）。
2. **最小対応**: 今すぐ本格実装が難しいなら、CLAUDE.md の「回帰の真実源」という言い切りを外し、
   「配布物には含めないが、将来 golden 回帰を配線するために保持している未配線の fixture」
   という事実に即した記述に変更する（ドキュメントを実態に合わせる）。
3. 上記いずれを選ぶにせよ `docs/known-issues.md`（CLAUDE.md が定める "unresolved known problems"
   の置き場だが、yomi にはまだファイル自体が存在しない）を作り、そこに追記するのが筋。

## テストファイル分類（16本）

| # | path | 分類 | 一言 |
|---|------|------|------|
| 1 | src/mod.test.ts | 🟢 Safe | VERSION の semver 正規表現チェックのみ。薄いが barrel のスモークとして妥当 |
| 2 | src/text/normalize.test.ts | 🟢 Safe | jpreprocess `normalize_text.rs` テストベクタの忠実移植。境界（濁点合成不能・空文字列）も網羅 |
| 3 | src/text/mora_table.test.ts | 🟢 Safe | 16件、拗音・長音・無声化・擬似モーラ・一貫性チェックまで幅広い。命名も症状ベースで明快 |
| 4 | src/format/bits.test.ts | 🟢 Safe | 素朴参照実装との突合をワード/ブロック境界含む複数サイズで実施。fail loud パスも1件 |
| 5 | src/njd/njd.test.ts | 🟡 Warning | 分岐数に対しテスト数が極端に薄い（詳細 W-F-1） |
| 6 | src/njd/digit_lut.test.ts | 🟢 Safe | 19件。エントリ数突合＋end-to-end変換の両輪、実データ由来のテーブル駆動 |
| 7 | src/g2p/word_alignment.test.ts | 🟢 Safe | 別経路（アライメント走査 vs 句構造走査）の完全一致という非自明な不変条件を実辞書全文で検証 |
| 8 | src/tokenizer/tokenizer_integration.test.ts | 🟡 Warning | 実質2ケースのみ＋タイミング依存の性能アサート（詳細 W-F-2）。lattice.ts 自体の単体テストが皆無（→未テストモジュール一覧 E-F-2） |
| 9 | src/dict/overlay_integration.test.ts | 🟢 Safe | 成功路・ホットリロード・fail loudly（3パターン）まで揃っている |
| 10 | src/browser/mod.test.ts | 🟢 Safe | fetch/CacheAPIモックによる成功/失敗/self-heal/gzip/可変refの網羅。13件中1件のみ実辞書必須で、設計として優秀 |
| 11 | dict-builder/src/csv.test.ts | 🟢 Safe | CLAUDE.md が名指しする col12/13 取り違え事故をピンポイントで regression 化 |
| 12 | dict-builder/src/container_roundtrip.test.ts | 🟡 Warning | 往復・fail loudly は良好だが reader.ts の2分岐が未到達（詳細 W-F-6） |
| 13 | dict-builder/src/louds_builder.test.ts | 🟢 Safe | 往復・共通接頭辞探索・サロゲート・ソート違反・1万語負荷まで手堅い |
| 14 | dict-builder/src/fetch_dict.test.ts | 🟡 Warning | SHA-256サブスイートが実装コードを一切呼ばない（詳細 W-F-3） |
| 15 | scripts/release_tag.test.ts | 🟢 Safe | 大文字小文字・不一致まで境界を押さえている |
| 16 | scripts/version_sync.test.ts | 🟢 Safe | 単一目的の drift ガードとして適切なスコープ |

## ドキュメント分類（5本）

| # | path | 分類 | 一言 |
|---|------|------|------|
| 1 | README.md | 🟢 Safe | 全コード例（quickstart / Deno / 辞書配布）を実 export・型フィールド名と逐語突合し矛盾なし |
| 2 | CLAUDE.md | 🟠 Error | golden-3k の「回帰の真実源」記述が実態と矛盾（E-F-1）。リリース計画節も1歩遅れ（W-F-5） |
| 3 | docs/jtd1-format.md | 🟡 Warning | CONN セクションの leftSize/rightSize 記載順がコードと逆（W-F-4）。他は「詳細は実装を正とする」の自己申告どおり整合 |
| 4 | docs/decisions/0002-public-api-surface.md | 🟢 Safe | digit_lut 非公開・`_dict_path` publish除外・analyzeWithWords シグネチャ等、逐語で実装と一致 |
| 5 | docs/decisions/0003-dict-distribution.md | 🟢 Safe | SHA固定・gzip既定・self-heal・revision解決API・GetDictionaryOptions形状、すべて constants.ts/browser/mod.ts と一致 |

## Warning 以上の詳細

### E-F-1: CLAUDE.md — golden-3k.jsonl「回帰の真実源」記述が実装と矛盾

- path:line: `CLAUDE.md:29`
- 症状: 「golden-3k.jsonl（回帰の真実源、committed）」と明言しているが、これを読み込むコードが
  `src/` `dict-builder/` `scripts/` `.github/` のどこにも存在しない（詳細は上記「golden-3k.jsonl
  調査結果」）。回帰は名目上あるが実際には機能していない。
- 修正案: 上記「修正案」節を参照（本格配線 or 記述修正のいずれか、要オーナー判断）。

### W-F-1: src/njd/njd.test.ts — 分岐複雑度に対しテストが極端に薄い

- path:line: `src/njd/njd.test.ts`（全3テスト） vs `src/njd/accent_type.ts:68-99`
  （`calcTopNodeAcc` の F1/F2/F3/F4/F5/C1/C2/C3/C4/C5/P1/P2/P6/P14 の14種切替）、
  `src/njd/accent_type.ts:103-134`（`calcDigitAcc` の十/百/千/万/億/兆＋各種例外リスト）、
  `src/njd/unvoiced_vowel.ts:39-158`（R0〜R5の6規則）。
- 症状: `njd.test.ts` は accent_type について「牛飼じゃありませんよ」1文（句核9、動詞%スロット経由）
  のみ、unvoiced_vowel について「解釈して」「解釈してやれば」の2文のみを直接検証する。
  `calcTopNodeAcc` の14分岐のうち直接確認できるのは実質1〜2分岐、`calcDigitAcc`（十/百/千/万/億/兆
  の例外リスト込み6関数分岐）は**このテストからは1つも到達しない**（digit_lut.test.ts は
  `njdSetDigit`（digit.ts）を検証しており、`njdSetAccentType`（accent_type.ts）の `calcDigitAcc` とは
  別物）。unvoiced_vowel.ts の R1（です/ます+？の先読み）・R4（アクセント核保護）・
  `applyUnvoiceRule` の例外ペア（s→s/sh、f/h→f/h/hy）も未検証。
  実辞書統合テスト（word_alignment.test.ts の CORPUS）が間接的に一部分岐を通す可能性はあるが、
  分岐特定・regression 目的のテストとしては機能しない（失敗しても「どの分岐が壊れたか」を
  テスト名から特定できない）。
- 修正案: `calcTopNodeAcc` の主要結合型（F1〜F5, C1〜C5 のうち未確認のもの）・`calcDigitAcc` の
  十/百/千/万/億/兆 各例外・`applyUnvoiceRule` の例外ペアを、jpreprocess Rust テストの対応ケースから
  移植して追加する（既存2テストと同じ「Rust #[test] 移植」方針を踏襲できる）。

### W-F-2: src/tokenizer/tokenizer_integration.test.ts — タイミング依存の性能アサート

- path:line: `src/tokenizer/tokenizer_integration.test.ts:72-86`
  （`"性能の下限: 100文字級の文を1000回で1文あたり2ms未満"`）
- 症状: `performance.now()` を使った実測ベンチマークを `if (perSentence > 2) throw` という固定閾値で
  判定している。CI ランナーの負荷変動（他ジョブとの共有・コンテナのCPUスロットリング等）で
  容易に flaky 化しうる。ウォームアップは1回入っているが、GC 一時停止やスケジューラのジッタは
  吸収できない。
- 修正案: 性能テストを機能テストから切り離す（`deno bench` へ移行、または CI では skip し
  ローカル/手動実行のみにする）。維持するなら閾値に余裕を持たせるか、複数回試行の中央値を取る。

### W-F-3: dict-builder/src/fetch_dict.test.ts — SHA-256サブスイートが実装コードを検証していない

- path:line: `dict-builder/src/fetch_dict.test.ts:35-66`（`"SHA-256 チェックサム検証ロジック"`）
  vs `dict-builder/src/fetch_dict.ts:42-47`（非公開関数 `sha256Hex`、export されていない）。
- 症状: コメント（fetch_dict.test.ts:36-37）は「fetch_dict.ts 内の非公開関数と同一アルゴリズムを
  使って」と書いているが、実際には `fetch_dict.ts` から何もimportせず、テストファイル内に
  `sha256Hex` を**再実装**して Web Crypto API 自体の決定性・改竄検知性を検証しているだけ
  （`fetch_dict.test.ts:38-43` の `sha256Hex` はテストローカル定義）。`fetch_dict.ts` の
  `sha256Hex`/`sha256OfFile`/`downloadTarball`/`isAlreadyUpToDate`/`placeRequiredFiles` は
  ネットワーク・ファイルシステム依存のため意図的にテスト対象外（コメントで明記済み・妥当な判断）
  だが、この SHA-256 サブスイートはその除外を埋め合わせるものではなく、「fetch_dict.ts の
  ロジックを検証している」という体裁だけがあるテストになっている。
- 修正案: (a) テスト名/コメントを「Web Crypto SHA-256 API の前提確認（fetch_dict.ts 自体は未検証）」
  に正直に書き換える、または (b) `sha256Hex` を `fetch_dict.ts` から export して直接 import する
  （非公開関数のexport化は設計判断が要るため needs-human）。

### W-F-4: docs/jtd1-format.md — CONN セクションの leftSize/rightSize 記載順がコードと逆

- path:line: `docs/jtd1-format.md:89`（`leftSize u32 = 1377, rightSize u32 = 1377`）
  vs `src/format/layout.ts:92-93`（`CONN_LAYOUT.header = ["rightSize", "leftSize"]`。
  実バイト列では offset 0 が rightSize、offset 4 が leftSize）。
- 症状: ドキュメントは leftSize を先に書いているが、実際のヘッダ配置（`decodeSection` が
  `header.forEach((name, i) => scalars[name] = dv.getUint32(i*4, true))` で読む順）は
  rightSize が先。jtd1-format.md は「言語非依存（TS リファレンス実装＋将来の Rust 実装が同一
  ファイルを読む）」ことを明記した仕様書であり（jtd1-format.md:3）、将来 Rust 実装がこの prose
  だけを見て読み手を書けば、`leftSize`/`rightSize` を取り違える。今日時点では
  `CONTEXT_ID_DIMENSION=1377`（`format/constants.ts:42`）で両者が常に同値なため実害は出ていない
  （偶然の無害化であり、構造的な保証ではない）。
- 修正案: `docs/jtd1-format.md:89` を `rightSize u32 = 1377, leftSize u32 = 1377` の順に修正する
  （コードの真実源に合わせる）。

### W-F-5: CLAUDE.md — 「進行中の計画」節がリリース状態より1歩遅れている

- path:line: `CLAUDE.md:66`（「HF 配布は完了したので、**v0.2.0 を release 可**
  （`deno task bump` → tag → GitHub Release）」）
- 症状: 文面は v0.2.0 のリリース作業が**未実施**であるかのように読めるが、実際には
  `git tag -l` に `v0.2.0` が存在し、GitHub 上に `v0.2.0` の Release（`Latest` マーク付き、
  公開日 2026-07-09T08:18:31Z）が既に存在する（`gh release list` で確認）。現在日付は
  2026-07-10 なので、CLAUDE.md のこの節は1日分状態が古い。
- 修正案: 「v0.2.0 を release 可」を「v0.2.0 は release 済み（2026-07-09）」に更新し、次のアクション
  （JSR 公開確認等、あれば）に文面を差し替える。

### W-F-6: dict-builder/src/container_roundtrip.test.ts — reader.ts の2つの fail loud 分岐が未到達

- path:line: `dict-builder/src/container_roundtrip.test.ts:83-118`
  （`"読み手は magic/version/欠損セクション/範囲外を fail loudly で拒否する"`）vs
  `src/format/reader.ts:48-50`（`セクション ${name} が ${SECTION_ALIGN}B 境界にない`）と
  `src/format/reader.ts:51-53`（`セクション ${name} がファイル末尾を超える`）。
- 症状: テスト名は「範囲外」も検証していると謳うが、実際に組み立てているのは magic 破壊・
  version 不一致・欠損セクションの3ケースのみ（`container_roundtrip.test.ts:88-117`）。
  reader.ts が持つ4つ目・5つ目の throw 分岐（8B境界違反・ファイル末尾超過）はどのテストからも
  到達しない。
- 修正案: セクションテーブルの `offset` を8の倍数からずらしたケース、`offset+length` が
  バッファ長を超えるケースを追加する（`writeContainer` の出力を直接いじって不正な offset/length を
  注入すればよい）。

### W-F-7: src/dict/dictionary.ts — 自身のチェックサム検証ループが一度も直接実行されていない（設計上の重複コードも併発）

- path:line: `src/dict/dictionary.ts:127-135`（`JtdDictionary.load` 内の checksum 検証ループ）
  vs `src/browser/mod.ts:61-67`（`verifyJtd` 内のほぼ同一ロジック）。
- 症状: `src/browser/mod.test.ts` は `verifyJtd`（browser/mod.ts 側）の CRC 不一致 throw を
  直接テストしている（`browser/mod.test.ts:159-168`）が、これは `JtdDictionary.load` 自身の
  検証ループ（`dictionary.ts:127-135`）とは**別実装**であり実行されない。`dictionary.ts` 側の
  検証ループを直接叩くテストはリポジトリに存在しない（実辞書統合テストは全て
  `verifyChecksums: false` で読み込んでいるため——`overlay_integration.test.ts:17`,
  `word_alignment.test.ts:44`, `tokenizer_integration.test.ts` 参照——通常経路の CRC 検証は
  素通りしている）。
- 備考: これは「2つの手書き経路が同じ不変条件を担保している」設計上の重複であり、ユーザーの
  グローバル方針（同一結果を要する2経路は1経路に共有すべき）に抵触する可能性がある。ただし
  設計変更は本レビュー（テスト/ドキュメント横断班）のスコープ外なので、テスト gap の指摘に
  留める。
- 修正案（テスト側のみ）: 小さな自作 JTD1（`browser/mod.test.ts` の `buildMinimalJtd` と同様の
  手法）を使い、`JtdDictionary.load(buf)`（`verifyChecksums` 既定 true）が CRC 不一致で
  実際に throw することを直接検証するテストを `src/dict/dictionary.test.ts`（新規）に追加する。
  設計重複の解消自体は別 issue として起票を推奨（本レビューでは修正・提案止まり）。

## 未テストモジュール一覧（重大度付き）

`src/` 配下の非テストファイルのうち、対応する専用 `*.test.ts` を持たないものを列挙する。
実辞書 fixture（`fixtures/naist-jdic.jtd`）がある状態で確認した実測（後述）では、これらの多くが
`ignore: !dictExists` の実辞書統合テスト経由で**間接的に**しか通過しない。

### 対象外（型定義・薄バレルのみ）

`src/dict/types.ts` `src/format/types.ts` `src/g2p/types.ts` `src/njd/types.ts`
`src/text/types.ts` `src/tokenizer/types.ts`（型のみ）／
`src/dict/mod.ts` `src/format/mod.ts` `src/text/mod.ts` `src/tokenizer/mod.ts`
`src/njd/mod.ts` `src/g2p/mod.ts`（`export *` の薄いバレル）／
`src/constants.ts`（リテラル定数。drift は `scripts/version_sync.test.ts` と
`src/browser/mod.test.ts` の URL パターン照合が間接的に守っている）／
`src/_dict_path.ts`（テスト専用ヘルパ。`deno.jsonc` の publish 除外対象で非公開 API）。

### Warning（振る舞い・分岐はあるが、間接的に妥当なカバレッジがある）

| module | 理由 |
|---|---|
| `src/analyze.ts` | 公開ファサード（`analyze`/`analyzeWithWords`）。専用テストファイルは無いが `word_alignment.test.ts` の実辞書テストが `analyze()` の出力を直接比較材料に使っており間接検証はされている |
| `src/g2p/result.ts` | `buildResult`/`symbolPause`（句グルーピング・ポーズ伝播の分岐）。`analyze()` 経由の実辞書テストで間接的に通る |
| `src/njd/node.ts` | `moraSize`/`isTouten`/`isQuestion`/`makeMoras`。単純だが全パイプラインから頻繁に呼ばれ間接検証は厚い |
| `src/njd/pos.ts` | 述語群＋`convertToKigou`（3分岐の品詞書き換え）。直接 assert する専用テストは無い |
| `src/njd/rule_node.ts` | `makeRuleNode`/`resetNode`/`setPron`。`digit_lut.test.ts` のヘルパとして間接使用されるが `resetNode` 自体は未使用箇所テスト無し |
| `src/njd/from_tokens.ts` | Token→NjdNode 変換。fail loud 分岐（「辞書発音列が単一rangeでない」）は未到達 |
| `src/njd/frontend.ts` | `analyzeToNodes` のパイプライン順序（MUST注記あり）。順序そのものを検証するテストは無い |
| `src/format/reader.ts` | `JtdContainer`。3/5分岐はテスト済みだが2分岐が未到達（W-F-6） |

### Error（境界・失敗パス系、または複雑な分岐ロジックが実質無検証）

| module | 理由 |
|---|---|
| `src/tokenizer/lattice.ts` | ラティス構築＋Viterbi 最小コスト経路の核。tie-break・到達不能位置スキップ・未知語 invoke/group 意味論・2つの内部不変条件 throw（`lattice.ts:63`,`177`）のいずれも専用テスト無し。`tokenizer_integration.test.ts` の2文のみが間接的に通す |
| `src/tokenizer/tokenizer.ts` | 空白トークン除去・オーバーレイ/辞書合成・複合語ユニット分割。同上、2文のみの間接検証 |
| `src/dict/dictionary.ts` | `JtdDictionary.load` の CRC 検証ループ自体が未到達（W-F-7）。`unitPron`（無声化マーク除去）・`charCategoriesOf`（非BMPフォールバック）・`connectionCost` も専用テスト無し、実辞書頼み |
| `src/format/crc32.ts` | CRC-32 実装に独立した既知ベクタでの検証が一件も無い。`browser/mod.test.ts` の利用は自己参照的（計算→同じ値で往復確認、または明らかに違う `"deadbeef"` を拒否）で、アルゴリズム自体の正しさは検証していない |
| `src/njd/pronunciation.ts` | `njdSetPronunciation`（表層かな解析・無音除去・フィラー連続併合・です/ます特例）。4段の複合ロジックに専用テスト無し |
| `src/njd/digit_sequence.ts` | `njdDigitSequence`（文脈スコア・順読み/桁読み判別・カンマ区切り検証・位取りノード挿入）。全302行に専用テスト無し。実辞書テストの CORPUS にある数字例（`"３００円払った"`）は3桁のみで、カンマ区切り・4桁超の桁読み分岐は一切未到達 |
| `src/njd/accent_phrase.ts` | `njdSetAccentPhrase`（順序依存が MUST 指定された18規則の決定木）。専用テストが無く、CORPUS 文が偶然踏む規則のみ間接検証 |

## fixture 依存テストの skip 状況（実測）

タスク着手時点の想定は「ローカルは辞書が無い状態」だったが、**この前提は調査中に覆った**:
着手直後の `ls fixtures/` では `golden-3k.jsonl` のみで `naist-jdic.jtd` は存在しなかったが、
調査の途中（`04:19` 頃）に同一環境内で `fixtures/naist-jdic.jtd`（18.9MB）が生成されているのを
検出した（本レビューが `deno task build-dict` を実行した事実はなく、並行して走っている他班の
セッションが生成したとみられる）。そのため本レビュー終盤の `deno test` 実測では
**skip 0件・77 passed（src/+scripts/）＋14 passed/7 steps（dict-builder、別 config）＝計91**、
`deno doc --lint` も `Checked 8 files` でエラー0件だった。

ただし CLAUDE.md 前提のとおり `fixtures/naist-jdic.jtd` は `.gitignore` 対象で、素の
`git clone` 直後は存在しない。**その状態（デフォルトのローカル開発環境）では以下の
`ignore: !dictExists` テストが黙って skip される**（`src/_dict_path.ts` の `dictAvailable()` が
`console.warn` は出すが green 扱いになる設計）:

| ファイル | 総テスト数 | 実辞書必須(skip対象) | 備考 |
|---|---|---|---|
| src/g2p/word_alignment.test.ts | 5 | 4 | 空ノード配列のテストのみ非依存 |
| src/tokenizer/tokenizer_integration.test.ts | 3 | 3 | **全数 skip**（lattice.ts/tokenizer.ts の唯一のテスト経路） |
| src/dict/overlay_integration.test.ts | 4 | 4 | **全数 skip** |
| src/browser/mod.test.ts | 13 | 1 | 12件は fetch/CacheAPIモックのみで非依存（優良設計） |
| 合計 | 25 | 12 | 全91トップレベルテストの約13% |

この12件が skip される状態では、`src/tokenizer/lattice.ts`・`src/tokenizer/tokenizer.ts`・
`src/njd/pronunciation.ts`・`src/njd/digit_sequence.ts`・`src/njd/accent_phrase.ts`・
`src/dict/dictionary.ts` の実データ経路は**間接検証すら一切通らない**（上記「未テストモジュール
一覧・Error」の各モジュールは、fixture 無し環境ではテストカバレッジが文字通りゼロになる）。
CI（`.github/workflows/ci.yml`）は `build-dict` を必ず先行実行するため CI 上は問題にならないが、
**ローカル開発でこれらのコアロジックにリグレッションを入れても `deno task check` は緑のまま**
という状態は、CLAUDE.md の「黙って劣化しない」という全体方針（fail loud）と緊張関係にある
（テストの skip 自体は `console.warn` するため「黙って」ではないが、`deno task check` の
終了コードには影響しない）。

## deno doc --lint 結果

8エントリポイント全てに対して実行:

```
deno doc --lint ./src/mod.ts ./src/text/mod.ts ./src/dict/mod.ts ./src/tokenizer/mod.ts \
  ./src/njd/mod.ts ./src/g2p/mod.ts ./src/format/mod.ts ./src/browser/mod.ts
```

結果: `Checked 8 files` — エラー・警告 0件。ADR-0002 の「追加公開シンボルは JSDoc 必須
（`deno doc --lint` を全 entrypoint 0 に保つ）」という規約は現状遵守されている。

## needs-human

- golden-3k.jsonl の本格配線（golden_match.ts 移植）は評価粒度の設計判断を要するため、
  修正方針の選定はオーナー判断が必要（上記「修正案」参照）。
- W-F-7（dictionary.ts と browser/mod.ts のチェックサム検証ロジック重複）は設計是正を伴うため、
  本レビューではテスト gap の指摘に留め、設計変更の要否は別途判断を仰ぐ。
