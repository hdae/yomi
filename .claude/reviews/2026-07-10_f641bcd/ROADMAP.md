# ROADMAP — 2026-07-10 レビュー後の改善候補（優先度順）

> **同日対応済み（2026-07-10 の後続セッション、f641bcd..）**: 優先度「高」全件
> （E-F-1 golden配線 / E-A-1 / E-A-2 / E-D-2 / E-D-3 / E-B-1）、
> 「中」の W-C-2..7テスト / W-A-4 / W-A-6 / W-A-8+W-F-7テスト側 / W-D-5 / W-E-1..4+W-A-7 /
> W-A-1,2 / W-F-5+X-2（limitations/known-issues新設）/ W-C-6②、
> 「低」の W-D-1（セグメンタ抽出・実施済み）/ W-A-5,9+W-F-6 / W-F-2 / W-F-3。
> **未対応で残るもの**: W-A-3（META 検証 — Zod は実行時依存ゼロ MUST と衝突、手書きバリデータ要設計）、
> W-E-5..8 と L-E 系（ローダ=専用パッケージ化まで据え置き、known-issues.md 起票済み）、
> overlay perf（L）、jpreprocess 本家照合 needs-human 4点（known-issues.md 起票済み）、
> ADR 参照実在チェックの dev スクリプト（任意）。

各行の ID は findings/ の指摘 ID。推定コストは「S=~30分 / M=数時間 / L=半日以上」の相対感。

## 優先度: 高

| ID | 内容 | コスト | 着手タイミング |
|----|------|--------|----------------|
| E-F-1 (=W-B-4/W-C-1) | golden-3k 回帰ハーネスの移植・CI 配線（browser-tts golden_match.ts の等価規約: 平板2表現・核>モーラ数忠実・負値ラップ allowlist） | L | 最優先。他の互換 needs-human 4件をまとめて回帰網に入れる土台 |
| E-A-1 | CSV 数値列に Number.isInteger 検査（parseIntField）+ ネガティブテスト | S | pyopenjtalk-plus 差し替え前必須 |
| E-A-2 | 非最終ユニット surfLen=0 を parseCsvLine で throw + テスト。tokenizer.ts 側にも `cursor === node.end` の fail-loud ガード（W-B-2） | S | 同上 |
| E-D-2 | tones.test.ts 新設（平板/頭高/中高/尾高/クランプ/負核/len 0-1） | S | 即可（純関数） |
| E-D-3 | phonemes.test.ts 新設（cl/N/子音+母音/母音のみ、句頭長音 "o" 縮退、devoiced 透過） | S | 即可（純関数） |
| E-B-1 | lattice.test.ts 新設（辞書モックで tie-break・未知語 invoke/group・unknownWordEnd・枝刈り・サロゲート・throw 2本） | M | 即可 |

## 優先度: 中

| ID | 内容 | コスト | 着手タイミング |
|----|------|--------|----------------|
| W-C-2..7 / W-F-1 | njd 各 pass の単体テスト補完（accent_phrase 18規則・pronunciation 4挙動・digit_sequence 縁・unvoiced R0/R1/R5・calcDigitAcc） | L | golden 配線後でも価値あり（分岐特定の regression） |
| W-A-4 | crc32.test.ts（"123456789"→0xCBF43926 等の既知ベクタ） | S | 即可 |
| W-A-6 | parseMatrixDef / parseUnkDef の最小 fixture テスト（転置固定） | S | 即可 |
| W-A-8 / W-F-7 | 極小合成辞書での JtdDictionary/overlay unit テスト（CRC 検証ループ・fail-loud 群を CI 無条件で） | M | 即可 |
| W-D-5 | result.test.ts（手組みノードで pause/chainFlag/文末 long/last-wins） | S | W-D-1 の判断に先行して価値あり |
| W-E-1..4 + W-A-7 | stale 参照の一掃（ADR-0010×2・release-dict.yml・loadDictionary×2+偽根拠・0003-dict-source-pinning） | S | 1コミットで即可 |
| W-A-1 (=W-F-4) / W-A-2 | jtd1-format.md の CONN ヘッダ順修正・LEXI 物理順の注記 | S | 即可 |
| W-F-5 + X-2 | CLAUDE.md 更新（v0.2.0 済み・golden 記述是正）+ docs/limitations.md / known-issues.md 新設（long_vowel 省略・負値クランプ・CSV non-quoting 前提の移送） | S | 即可 |
| W-E-5 | cache 書込み best-effort 化（要判断①採択時） | S | 判断後 |
| W-E-7 | ローダテスト補完（caches 未定義経路・resolve 失敗・put 失敗・並行×2） | M | W-E-5/6 判断後 |
| W-A-3 | META の Zod 検証（ロード時1回・ホットパス外）※実行時依存ゼロとの整合を先に設計判断 | M | 要設計判断 |
| W-C-6② | accent_type.ts:65 コメント是正（負値は実測発生・golden は allowlist） | S | golden 配線と同時 |

## 優先度: 低

| ID | 内容 | コスト | 着手タイミング |
|----|------|--------|----------------|
| W-D-1 | 句セグメンテーション走査の句イテレータ化（構造共有） | M | 要判断⑤採択時 |
| W-E-6 | 可変 ref のオフライン・フォールバック | M | 要判断③採択時 |
| W-E-8 | bump.ts の部分失敗補償 | S | 任意 |
| W-A-5 / W-A-9 / W-F-6 | reader/layout の死にコード掃除・sectionCount 検証・`!==` 化・失敗パステスト | S | 任意 |
| W-F-2 | 性能アサートを deno bench へ分離（flaky 予防） | S | 任意 |
| W-F-3 | fetch_dict.test の SHA サブスイートを正直な名前に（or sha256Hex export） | S | 任意 |
| L-E-1..3 | resolve 応答の SHA 形検証・cache.open 一本化・verifyJtd 19MB コピー回避 | S | 任意 |
| L-B-3 (=L-D-7) / L-B-4 | normalize 一回化・qBuf ループ外化（perf 微） | S | 任意 |
| L-B-1 / L-B-2 | unknownWordEnd ガード差・i32 飽和加算の方針明記 | S | golden 配線後に確認 |
| 横断 | ADR 参照実在チェックの dev スクリプト（stale 再発防止） | S | 任意 |
| needs-human | jpreprocess/lindera 本家ソース照合（P1≡P2・小数 continue・Rule 08・add 順 tie-break） | M | 別調査タスク |
