---
title: Deep Review — @hdae/yomi 全域（初回）
date: 2026-07-10
head: f641bcd
prev_review: なし（初回）
mode: A（差分モードだが初回のため全域を6グループでカバー）
reviewer: Claude (orchestrator) + 6 並列レビューエージェント
---

# SUMMARY — 2026-07-10 @ f641bcd

## 実施概要

- **モード**: A（初回＝全域）。対象は src/ 全域 + dict-builder/ + scripts/ + .github/ + docs/ + テスト16本。
  除外: fixtures/（データ）、生成物。
- **対象コミット範囲**: リポ誕生 c592071 〜 f641bcd（v0.2.0 タグ時点。レビュー中に v0.2.0 が
  2026-07-09 リリース済みであることを確認）。
- **モデル配分**: 精読5グループ（A: format/dict/builder, B: text/tokenizer, C: njd, D: g2p/facade,
  E: browser/release）= Opus、横断1グループ（F: テスト品質+docs整合）= Sonnet。
  Pass2 = オーケストレータ（session model）が負荷の高い主張4件を実コードで直接検証。
- **ベースライン**: 辞書 fixture ビルド後 `deno task check` 77 passed / 0 failed、
  dict-builder 14 passed、`deno doc --lint` 8 entrypoints 0 件。素の checkout では 12 件が silent skip。

## 敵対的検証（Pass2）の記録

フル Pass2 のトリガー（1領域に E/C 3件以上集中・断定不能の残置）は非該当。代わりに提示の根幹となる
4主張をオーケストレータが実コードで反証チェックし、**全て CONFIRMED**:
E-A-1（NaN が範囲検証をすり抜け 0 化）/ E-A-2（surfLen=0 センチネル衝突）/
E-D-2（moraTones は内部から一切呼ばれない）/ W-E-5（cache.put 失敗が load 全体を throw）。
残る needs-human は「jpreprocess/lindera 本家ソース照合が必要」または「オーナー設計判断」であり、
セッション内エスカレーションの対象外として ROADMAP / 要判断に回した。

## グループ別レポート

| G | 担当 | findings | C | E | W |
|---|------|----------|---|---|---|
| A | JTD1 format / dict / dict-builder | findings/group-A-format-dict.md | 0 | 2 | 9 |
| B | text / tokenizer | findings/group-B-text-tokenizer.md | 0 | 1 | 4 |
| C | njd | findings/group-C-njd.md | 0 | 0 | 7 |
| D | g2p / facade | findings/group-D-g2p-facade.md | 0 | 2 | 3 |
| E | browser loader / release 基盤 | findings/group-E-browser-release.md | 0 | 0 | 8 |
| F | テスト品質横断 / docs 整合 | findings/group-F-tests-docs.md | 0 | 1 | 7 |

**集計（重複統合前）: Critical 0 / Error 6 / Warning 38 / Low 多数**。
重複統合: golden 未配線（W-B-4 = W-C-1 = **E-F-1** ← 主担当）、CONN ヘッダ順 docs 矛盾
（W-A-1 = W-F-4 ← 主担当 A）、normalize 二重呼び（L-B-3 = L-D-7）、
checksum 検証二重実装（W-F-7、W-A-3 と関連）。

## 全体評価

**実装ロジックの品質は高い**。6班とも Critical 0、happy-path の即死バグ 0。
依存方向 back-edge なし・col12/13 取り違えゼロ・publish 整合健全・検証スキップ経路なし・
jpreprocess との pass 対応も欠落なし（long_vowel は本家廃止済みの意図的省略）。

リスクは実装ではなく**検証網とドキュメント整合**に集中している:

1. 🟠 **golden 回帰が未配線**（E-F-1・最重要）: CLAUDE.md が「回帰の真実源」と呼ぶ
   fixtures/golden-3k.jsonl（9.9MB, committed）は **init コミット以来消費者ゼロ**。
   browser-tts ADR-0010 の切り出し計画「fixture を持参して CI 回帰に使う」の後半が未実施。
   消費側ロジックは ../browser-tts/tools/eval/src/golden_match.ts に実在。
   コード中の「差が出れば golden が検出する」前提（accent_type.ts:65 等）が現状 no-op。
2. 🟠 **dict-builder の fail-loud 穴 2件**（E-A-1 / E-A-2・CONFIRMED）: SHA ピンで現在は
   到達不能だが、ロードマップの pyopenjtalk-plus 辞書ソース差し替えで現実の発火経路になる。
3. 🟠 **純ロジック単体テストの空白地帯**（E-B-1 / E-D-2 / E-D-3 + W 多数）: テスト戦略が
   dict-gated 統合に一極集中。lattice の Viterbi 分岐・tones（実行ゼロ）・phonemes の縁・
   njd 各 pass（accent_phrase 18規則 / digit_sequence 302行 / pronunciation 4挙動）・
   crc32 既知ベクタ・parseMatrixDef が無防備。素の clone では 12 件 silent skip ＝
   コアモジュールのカバレッジが文字通りゼロになる。
4. 🟡 **走査の二重実装**（W-D-1 / W-F-7）: 句セグメンテーション走査（result vs word_alignment）と
   checksum 検証ループ（dictionary.ts vs browser verifyJtd）が手書き2本。生成側は単一実装で
   守られており、現時点の出力乖離はなし。
5. 🟡 **ローダ堅牢性の設計判断 2点**（W-E-5 / W-E-6・要判断）: cache 書込み失敗で取得成功後でも
   全損 throw（JSDoc NOTE と実装が乖離）／可変 ref の resolve 失敗にオフライン・フォールバック無し。
6. 🟡 **stale 参照・doc 乖離の束**: ADR-0010×2（bump.ts / release_tag.ts）、release-dict.yml
   （verify_tag.ts）、loadDictionary×2 + 偽の根拠（verify_tag.ts / version_sync.test.ts）、
   0003-dict-source-pinning（fetch_dict.ts）、CONN ヘッダ順（jtd1-format.md:89 ⇔ layout.ts:92）、
   CLAUDE.md のリリース節1日遅れ + golden 記述矛盾、accent_type.ts:65 コメントの前提崩れ
   （負値は browser-tts 実測で発生済み）。yomi 自身の docs/limitations.md・known-issues.md が未作成。
7. 🟡 **型境界の as**（W-A-3）: META の `JSON.parse(...) as DictMeta`（CRC 非対象・Zod 規約違反）。

## 🟠 Error 一覧（統合後）

| ID | 内容 | 検証 |
|----|------|------|
| E-F-1 | golden-3k.jsonl 回帰が init 以来未配線（CLAUDE.md の記述が事実に反する） | git 履歴全走査で確定 |
| E-A-1 | CSV 数値列の NaN が範囲検証をすり抜け TypedArray で黙って 0 化 | CONFIRMED（オーケストレータ再検証） |
| E-A-2 | 複合語の非最終ユニット surfLen=0 が「残り全部」センチネルと衝突 | CONFIRMED（同上） |
| E-B-1 | lattice.ts（Viterbi 中核）に辞書非依存の単体テスト皆無 | 事実（テスト不在） |
| E-D-2 | tones.ts moraTones はテスト・実行カバレッジ完全ゼロ | CONFIRMED（rg で呼び出しゼロ） |
| E-D-3 | phonemes.ts（生成の唯一実装）の縁が dict-gated 統合でしか実行されない | 事実（テスト不在） |

## 要判断（オーナー決定が必要）

1. **golden 回帰の配線方式**: 本格移植（golden_match.ts の等価規約＝閾値付き一致率）か、
   まず最小の完全一致 subset か。評価粒度の設計が要る（JTD1 は col12 読みを持たない）。
2. **W-E-5**: cache 書込みを ①best-effort+console.warn 告知（推奨・JSDoc NOTE とも整合）
   ②現状維持（fail-loud、その場合 NOTE を実態に修正）。
3. **W-E-6**: 可変 ref resolve 失敗時に last-known SHA へ degrade するか、fail-loud のままか。
4. **W-D-4**: moraTones の範囲外核クランプを DECIDED 文書化+テスト固定か、境界 fail-loud 化か。
5. **W-D-1**: 句セグメンテーション走査を句イテレータへ構造共有するか、テスト網明示で据え置くか。
6. **L-D-6**: symbolPause を公開面に残すか。
7. **needs-human（本家ソース照合が必要）**: P1≡P2 の式同一性（accent_type.ts:89-92）、
   小数連続セパレータの continue/fall-through（digit.ts:88-90）、Rule 08 ラベル重複
   （accent_phrase.ts:70-75）、既知語 add 順の lindera タイブレーク一致（lattice.ts:85-101）。
   → jpreprocess/lindera ソースの取得調査を別タスク化可能。

## 本セッションで実施した修正

なし（ユーザー指示により提示まで。コード変更はゼロ）。

## 次回レビューの観点

- golden 回帰配線後: 一致率の実測値・既知逸脱 allowlist の妥当性。
- 単体テスト補完後: fault injection で新テストが実際に発火するかの確認。
- pyopenjtalk-plus 差し替え前: E-A-1 / E-A-2 が閉じていることの再確認（ブロッカー）。

## 検査メソッドのメモ

- 6グループ並列（Opus×5 + Sonnet×1）は本規模（~8.6k 行）に適正。全班が締切内に完遂・断定的。
- Sonnet の横断班（F）が golden 未配線の履歴確定・skip 実測など最重要級の成果 → docs/テスト整合は
  Sonnet で十分という配分学習。
- Pass2 はフル再派遣でなくオーケストレータ直接検証で足りた（主張が path:line 付きで具体的だったため）。
