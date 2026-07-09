---
id: B
topic: テキスト正規化 & ラティス分かち書き（src/text/** · src/tokenizer/**）
files_reviewed:
  - src/text/normalize.ts
  - src/text/mora_table.ts
  - src/text/types.ts
  - src/text/mod.ts
  - src/text/normalize.test.ts
  - src/text/mora_table.test.ts
  - src/tokenizer/lattice.ts
  - src/tokenizer/tokenizer.ts
  - src/tokenizer/types.ts
  - src/tokenizer/mod.ts
  - src/tokenizer/tokenizer_integration.test.ts
refs (read-only):
  - src/dict/dictionary.ts
  - src/dict/overlay.ts
  - src/format/louds.ts
  - src/analyze.ts
  - dict-builder/src/defs.ts
  - ../browser-tts/docs/tokenizer-compat.md
date: 2026-07-10
model: opus
commit: f641bcd
---

# グループ B レビュー — テキスト正規化 & ラティス分かち書き

## 総評

実装ロジックそのものは**極めて堅い**。lattice.ts の前向き Viterbi は lindera
3.0.7 `viterbi.rs` の互換仕様（研究リポ `browser-tts/docs/tokenizer-compat.md`）と
逐条で突き合わせて確認したところ、**連接コスト引数順（forward=前語 rightId /
backward=注目語 leftId, §7.1）・BOS/EOS 文脈 ID=0・タイブレーク厳密 `<`・未知語の
invoke/group・`unknownWordEnd` 抑制・到達不能位置の枝刈り・複数カテゴリ ord ごとの
生成**すべてが仕様に一致している。normalize.ts は NFKC ではなく naist-jdic 専用
全角化＋ステートフル濁点合成で、jpreprocess のテストベクタで固められている。
mora_table の 373 キーは機械検査で全ユニーク・長さ 1/2 のみを確認でき（コメントの
主張が正しい）、greedy 2-then-1 走査が Aho-Corasick LeftmostLongest と等価という論拠は
成立している。オーバーフロー懸念（i16 conn × 語コストの number 累積）は float64 の
安全整数域内で問題なし。依存方向（text は葉、tokenizer→dict/text は順方向）に back-edge
なし。JSDoc は全公開シンボルに付与済み（`deno doc --lint` 0）。lint 0 / 対象テスト
23 件全緑。

**したがって指摘の本丸は「バグ」ではなく「検証の穴」と「互換上の潜在点」である。**
最重要は次の 2 点:

1. **lattice.ts に辞書非依存の単体テストが 1 本も無い**（E-B-1）。Viterbi のコスト選択・
   タイブレーク・未知語 group 連結・`unknownWordEnd` 抑制・到達性枝刈り・2 本の throw
   失敗パスが、実辞書ゲート付き統合テスト 3 本（代表文 ~5 例）でしか触られていない。
   これらは小さな辞書モックで縛れる（＝テスト可能なのに未テスト）ため、分類規約
   「分岐・失敗パス・境界を含む未テストは Error」に該当。
2. **既知語エッジの add 順が lindera のタイブレークと一致する保証が無い**（W-B-1）。
   同コスト衝突時のみ影響する潜在互換点で、研究リポでも「未検証」と明記されている。
   さらに **golden-3k.jsonl（回帰の真実源）を走らせるテストがこのリポに存在しない**
   （W-B-4）ため、互換性の連続検証が in-repo では効いていない。

以下、分類テーブル → Warning 以上の詳細 → データフロー図 → 横断所見。全指摘に
path:line を付す。確証が持てないもの（実装依存・別ドメイン依存）は `needs-human` を明記。

---

## ファイル別分類テーブル（漏れゼロ）

| # | ファイル | 分類 | 要点 |
|---|----------|------|------|
| 1 | `src/text/normalize.ts` | 🔵 L | コアは jpreprocess ベクタで堅牢。冪等性・サロゲート通過が未テスト。analyze 経路の二重呼び出し（L-B-3） |
| 2 | `src/text/mora_table.ts` | 🟡 W | データは機械検査でクリーン。greedy=LeftmostLongest の前提不変条件（キー一意・長さ1/2）がコメント主張のみでテスト無し（W-B-3） |
| 3 | `src/text/types.ts` | 🟢 S | 純型定義。JSDoc 完備。指摘なし |
| 4 | `src/text/mod.ts` | 🟢 S | バレル。指摘なし |
| 5 | `src/text/normalize.test.ts` | 🔵 L | ASCII/半角カナ/濁点脱落/文分割を的確に固定。冪等性・サロゲート境界が欠落（L-B-5） |
| 6 | `src/text/mora_table.test.ts` | 🔵 L | 振る舞いテストは良質。表の性質（一意性・長さ・prefix 非衝突）を縛る機械テストが無い（W-B-3 の対） |
| 7 | `src/tokenizer/lattice.ts` | 🟠 E | ロジックは仕様一致。ただし分岐・失敗パスを覆う辞書非依存単体テストが皆無（E-B-1）。付随して W-B-1 / L-B-1 / L-B-2 |
| 8 | `src/tokenizer/tokenizer.ts` | 🟡 W | ユニット分割がノード表層を完全被覆する不変条件に fail-loud ガード無し＋空白除去・断片オフセットが未テスト（W-B-2） |
| 9 | `src/tokenizer/types.ts` | 🟢 S | 型定義。JSDoc 完備。指摘なし |
| 10 | `src/tokenizer/mod.ts` | 🟢 S | バレル。指摘なし |
| 11 | `src/tokenizer/tokenizer_integration.test.ts` | 🟡 W | 実辞書ゲートの統合のみ。代表文数例で分岐網羅せず、純ロジック単体テストが無い（E-B-1/W-B-2 の受け皿） |

分類集計: 🔴C=0 / 🟠E=1 / 🟡W=3 / 🔵L=3 / 🟢S=4

（横断・別ドメイン参照の付随所見: L-B-1 / L-B-2 / L-B-3 / L-B-4 / L-B-5 を後述）

---

## Warning 以上の詳細

### 🟠 E-B-1 — lattice.ts に辞書非依存の単体テストが皆無（分岐・失敗パス未カバー）

- **path**: `src/tokenizer/lattice.ts:31-182`（全体）／唯一の呼び出しテストは
  `src/tokenizer/tokenizer_integration.test.ts:37-70`（実辞書 `ignore: !dictExists` ゲート）
- **症状**: Viterbi の中核分岐がどれも純ロジック単体テストで縛られていない。具体的に
  無検証の分岐/境界:
  - タイブレーク（`lattice.ts:57` 厳密 `<`、`170-176` EOS 選択の同点先勝ち）
  - BOS コスト経路（`lattice.ts:50-52`）と EOS 接続（`170-176`）
  - 未知語 group 連結の継続判定（`lattice.ts:132-144`、「同 category_ord 同カテゴリ」）
  - `unknownWordEnd` による未知語再生成抑制（`lattice.ts:122,160`）
  - 到達不能位置の枝刈り（`lattice.ts:78`）
  - サロゲートペア歩幅（`charLen` `lattice.ts:19-26`／`123,137`）
  - 2 本の throw 失敗パス（`lattice.ts:63` 到達不能ノード追加、`177` 経路なし）
- **根本原因**: テスト戦略が「実辞書での代表文スポットチェック」に一極集中。lattice が
  依存する辞書表面は狭い（`trie.commonPrefixSearch` / `entryIndex` / `leftId` /
  `rightId` / `cost` / `connectionCost` / `charCategoriesOf` / `charCategories` /
  `unkCatIndex` / `unkLeftId/RightId/Cost/PosId`）ため、小さな手組みモックで全分岐を
  決定的に駆動できる。**テスト可能なのに未テスト**。統合テスト 3 本（`tokenizer_integration.test.ts`）
  は辞書欠如時に丸ごと skip されるため、CI 辞書ビルド失敗時はゼロカバレッジになる。
- **修正案（テスター向け・実装変更不要）**: `src/tokenizer/lattice.test.ts` を新設し、
  最小 `JtdDictionary` 風モック（上記メソッド/配列のみ実装）で以下を behavior テスト化:
  1. 2 経路が同コストになるよう conn/word コストを設計し、**先に add されたエッジが
     勝つ**ことを間接不変量で確認（タイブレーク／フォールトインジェクションでコストを
     1 ずらすと勝者が入れ替わること）。
  2. invoke=0/group=0（漢字相当）1 文字未知語、invoke=1/group=1（記号相当）連結未知語、
     `unknownWordEnd` 内側で未知語が再生成されない・既知語は張られること。
  3. 到達不能位置（先行エッジが張れないコスト設計）で該当区間に語が生成されないこと。
  4. サロゲートペア入力で end が +2 進むこと。
  5. 失敗パス: 経路が構成できないモックで `177` の throw が発火すること
     （tautological にならぬよう「本来なら通る」入力との対比で）。
- **追加テスト**: 上記 1–5。

---

### 🟡 W-B-1 — 既知語エッジの add 順が lindera のタイブレークと一致する保証が無い（`needs-human`）

- **path**: `src/tokenizer/lattice.ts:11-12`（コメント「同点は先に追加されたエッジが勝つ」）、
  `lattice.ts:85-101`（`commonPrefixSearch` による既知語追加）、`src/format/louds.ts:86-98`
  （マッチを **end 昇順＝短→長** で列挙）
- **症状**: yomi は既知語を `commonPrefixSearch` の自然順（同一 start の複数表層を
  **短い順**）で `endsAt` に push する。lindera は daachorse `find_overlapping_iter` の
  列挙結果を **頭挿入で反転**して消費する（compat doc §7.3, l.332-337, 370）。両者は
  同点コスト時のタイブレーク（backpointer 選択・EOS 選択）を変えうる。
- **影響範囲の精査（正直な留保つき）**: 同一 start で長さの異なるマッチは**別の
  `endsAt` バケット**に入る（end が違う）ため、多くのケースでは同点競合を起こさない。
  実際に反転が効くのは (a) **同一 start・同一表層の複数 POS エントリ**の並び（yomi は
  `entryIndex` 順=`lattice.ts:88` の `for e=from..to`／lindera は decode 反転順）と、
  (b) それらが下流ノードの backpointer で**厳密同点**を作った場合に限られる。狭いが実在
  する。研究リポも「完全一致の再現が難しい潜在点／TS 側の長短どちらが一致するかは
  **未検証**」と明記（§7.3, §落とし穴 l.370）。
- **根本原因**: これは**実装挙動依存で仕様保証ではない**（daachorse の列挙順自体が
  実装依存）。yomi のインラインコメント（`lattice.ts:11-12`）は「先勝ち」しか書いておらず、
  「add 順を lindera の反転に合わせねばタイブレークがずれる」という既知リスクを明文化して
  いない。
- **修正案**: (1) `lattice.ts` のヘッダに、既知語 add 順と lindera 頭挿入反転の関係／
  未検証点を DECIDED または NOTE で明記し、compat doc §7.3 へのポインタを残す。(2) golden-3k
  を in-repo で走らせ（W-B-4）、同点衝突が golden 集合内で実害を出していないことを回帰で
  固定する。(3) それでも心配なら、同一 (start,表層) 多 POS エントリの並びを lindera の
  反転順に合わせるか、少なくとも「多 POS 同表層」ケースの golden 対を追加。
- **追加テスト**: 多 POS 同一表層のモックで、下流同点時の勝者が lindera 期待と一致するか
  を pin（`needs-human`: 期待値は lindera 実挙動から確定が必要）。

---

### 🟡 W-B-2 — tokenizer.ts: ユニット分割のノード表層完全被覆に fail-loud ガードが無い＋空白除去/断片オフセットが未テスト

- **path**: `src/tokenizer/tokenizer.ts:80-105`（ユニット展開）、特に `89-90`
  （`len===0 → node.end`）、`104`（`cursor = end`）／空白除去 `31-40,45`／断片オフセット
  写像 `44-47`
- **症状 (a)**: 複合語エントリのユニット表層長 `unitSurfLen[u]` を `cursor` から積んで
  トークンを切り出すが、「**最終ユニットのみ `len===0`（残り全部）**」「**ユニット長の総和 =
  ノード表層長**」という不変条件を**信頼するのみで検証しない**。builder が非最終ユニットに
  `len===0` を出す／総和がノード表層長と食い違うと、後続ユニットが空表層になったり末尾文字が
  トークンから**黙って脱落**しうる（`cursor` がノード末尾に届かないまま終了）。プロジェクト
  方針は「fail loudly」なのに、ここはループ後 `cursor === node.end` を assert していない。
- **症状 (b) テスト欠落**: 空白のみトークン除去（`isSpaceOnly` `31-40`、`45` の除去）を
  駆動する統合ケースが無い（代表文 `tokenizer_integration.test.ts:51` にはタブ/半角空白が
  無い）。U+3000（SYMBOL で残る）と `\t`（SPACE で除去）の分岐が未検証。断片オフセット写像
  （`node.start + f.start`、`44-47`）を複数断片×非零 f.start で縛るテストも無い。
- **根本原因**: builder 側データ不変条件への暗黙依存（1 モジュール 1 責務で tokenizer は
  データを信頼）＋統合テストのケース不足。
- **修正案**: (1) ユニット展開ループ後に `if (cursor !== node.end) throw ...`（または非最終
  ユニットの `len===0` 検出で throw）を入れ、データ破損を fail-loud 化。(2) 空白/断片跨ぎの
  統合テスト追加（例: `"あ　い"`＝U+3000 残存、`"あ\tい"`＝タブ除去、複数句点で断片オフセットが
  絶対位置に正しく写るか）。
- **追加テスト**: 上記 (2)、加えてユニット非被覆モックで (1) の throw をフォールト
  インジェクションで発火確認。

---

### 🟡 W-B-3 — mora_table: greedy=LeftmostLongest の前提不変条件がコメント主張のみでテスト無し

- **path**: `src/text/mora_table.ts:820-826`（「373 キー全てユニーク、長さは 1 か 2 のみ」の
  コメント主張）、`843-911`（`scanMoraSegments` の 2-then-1 greedy 走査）／テスト側
  `src/text/mora_table.test.ts`（該当不変条件テストが不在）
- **症状**: 「2 文字キーを先に試し無ければ 1 文字」という決定的走査が Aho-Corasick
  LeftmostLongest と等価であることの根拠＝「全キーが長さ 1 or 2・prefix 衝突なし・重複なし」
  は、コメントで「生成データで確認済み」と述べるのみで、**表の性質を縛る機械テストが無い**。
  将来 3 文字キーや重複キー・prefix 衝突キーが混入すると、等価性が黙って崩れても既存テストは
  素通りする（振る舞い例は個別ケースのみで表全体を網羅しない）。本レビューの機械検査では
  現状クリーン（373 ユニーク・長さ {1,2} のみ・U+2019 キー無し・母音集合は期待 8 種）。
- **根本原因**: データ表の構造的不変条件を「実装の前提」に置きつつ、その前提を回帰で
  保護していない。
- **修正案**: `mora_table.test.ts` に表不変条件テストを追加:
  `ALL_MORA_TABLE_ENTRIES` のキーが (i) 全ユニーク (ii) 長さ ∈ {1,2} (iii) 全 expansion の
  vowel が既知集合 (iv)（任意）devoice マーク U+2019 をキーに含まない、を assert。
- **追加テスト**: 上記（`ALL_MORA_TABLE_ENTRIES` は既に export 済みなので実装変更不要）。

---

### 🟡 W-B-4 — 回帰の真実源 golden-3k.jsonl を走らせるテストがリポに存在しない（横断・`needs-human`）

- **path**: `fixtures/golden-3k.jsonl`（9.9MB, committed）／消費側テスト**不在**
  （リポ全域 `rg golden` はコメント・CLAUDE.md のみヒット、テストファイルは無し。
  参考: `src/**/*.test.ts` の実辞書テストは `dictPath()` を読むが golden は読まない）
- **症状**: CLAUDE.md は `fixtures/golden-3k.jsonl` を「回帰の真実源（committed）」と位置づけ、
  lindera/jpreprocess オラクル互換（W-B-1 のタイブレーク含む）はこれで担保する建付け。だが
  **このリポには golden を読み込んで analyze/tokenize 出力と突き合わせる runner が無い**。
  互換性の連続検証が in-repo では効いておらず、統合テストの代表文 ~5 例のみが番人。
- **根本原因（推定）**: golden 回帰は切り出し元 `../browser-tts` 側に置かれたまま、yomi へ
  未移設の可能性（`needs-human`: 意図的にオラクル生成環境側へ寄せているのか、移植漏れかの
  確認が要る）。
- **修正案**: golden-3k を読み `analyze`/`tokenize` と JSONL 期待を照合する回帰テスト（辞書
  ゲート付き）を追加し、`deno task check`（`--allow-read --allow-env`）で走らせる。これにより
  W-B-1 の潜在タイブレーク差も含めた互換退行が初めて自動検知される。
- **追加テスト**: golden 回帰 runner 1 本。

---

## ラティス構築 〜 Viterbi 後退 データフロー（実行番号併記）

```
tokenize(dict, text, overlay)                                        [tokenizer.ts:21]
  │
  ① normalizeForDict(text) ───────────────► normalized               [tokenizer.ts:26 / normalize.ts:59-83]
  │     専用全角化＋ステートフル濁点合成（NFKC ではない）
  │
  ② splitFragments(normalized) ─► [{start,end}, ...]                 [tokenizer.ts:43 / normalize.ts:90-102]
  │     。(3002) 、(3001) \n(0a) \t(09) で分割・区切り文字は前断片末尾
  │     各断片＝独立ラティス（BOS/EOS リセット・連接は断片を跨がない）
  │
  └─ for each fragment f:  text_f = normalized.slice(f.start, f.end)
        tokenizeToNodes(dict, text_f, overlay)                        [lattice.ts:31]
          nodes[] · endsAt[p][] · total[] · prev[]  ← 前向きDP状態     [lattice.ts:39-44]
          │
          while p < n:                                                [lattice.ts:75]
            ③ 到達性枝刈り  p>0 && endsAt[p].length==0 → p+=step;続行  [lattice.ts:78-81]
            ④ 既知語  trie.commonPrefixSearch(text_f, p)  短→長で列挙   [lattice.ts:85 / louds.ts:86-98]
            │      各 surfaceId の entryIndex[..] を addNode           [lattice.ts:86-100]  found=true
            ⑤ overlay.lookup(text_f, p)（あれば）→ addNode             [lattice.ts:104-118]  found=true
            ⑥ 未知語  (unknownWordEnd <= p のとき)                     [lattice.ts:122]
            │      cp=codePoint(p); charCategoriesOf(cp)→cats[ord]     [lattice.ts:123-124 / dictionary.ts:218]
            │      for ord: if(!invoke && found) skip                  [lattice.ts:125-128]
            │        group=1 → 同 category_ord 同カテゴリ連結で end 延長 [lattice.ts:132-144]
            │        unkCatIndex[catId] 範囲の各行を addNode           [lattice.ts:146-159]
            │        unknownWordEnd = end   (rTo>rFrom 時のみ ← L-B-1) [lattice.ts:160]
            └─ p += charLen(text_f, p)     (サロゲートは +2)           [lattice.ts:164 / 19-26]

          addNode(node):                                              [lattice.ts:47-69]
            start==0 → best = connectionCost(0, node.leftId)  (BOS)    [lattice.ts:50-52]
            else     → min over pi ∈ endsAt[start] of                  [lattice.ts:55-62]
                        total[pi] + connectionCost(nodes[pi].rightId, node.leftId)
                        厳密 <  ⇒ 先に push された pi が同点勝ち        [lattice.ts:57]  (← W-B-1)
            i=nodes.push(node); total[i]=best+wordCost (saturationなし ← L-B-2) [lattice.ts:64-66]
            prev[i]=bestPrev; endsAt[node.end].push(i)                 [lattice.ts:67-68]

          ⑦ EOS 接続  min over i ∈ endsAt[n] of                       [lattice.ts:170-176]
                        total[i] + connectionCost(nodes[i].rightId, 0)
                        経路なし → throw（fail-loud）                   [lattice.ts:177]
          ⑧ 後退  best から prev[] を辿り reverse（BOS/EOS 除外）       [lattice.ts:179-181]
          └► 最小コスト経路 LatticeNode[]
        │
        ⑨ 空白のみトークン除去 isSpaceOnly ＋ f.start オフセット付与   [tokenizer.ts:44-47]  (← W-B-2b)
  │
  ⑩ LatticeNode → Token 展開                                          [tokenizer.ts:51-106]
       overlay 由来 → 1 エントリ=1 トークン（reading の ’ 除去）        [tokenizer.ts:52-66]
       未知語      → pos のみ・pron/accType 無し                       [tokenizer.ts:68-78]
       既知語      → unitIndex[e..] を unitSurfLen で切り分け複数トークン [tokenizer.ts:80-105]  (← W-B-2a)
                     chainFlag: 先頭ユニット undefined / 以降 false
```

主要不変条件（レビューで確認済み）:
- オフセットは全経路で**正規化後テキストの UTF-16 index** に統一。`analyze` は
  `buildResult(normalizeForDict(text), …)` と `tokenize` 内 `normalizeForDict(text)` が
  同一関数・同一入力なので内容一致（冪等ゆえ二重呼び出しでも整合。L-B-3）。
- 到達性: builder が全 BMP コードポイントに DEFAULT を充填する（`dict-builder/src/defs.ts:89-90`）
  ため `charCategoriesOf` は BMP で必ず ≥1 カテゴリを返し、③ の枝刈りで死んだ末尾が
  残らない限り ⑦ の throw は防御的（正常系で発火しない）。

---

## 横断所見（付随・別ドメイン参照を含む）

- **🔵 L-B-1 — `unknownWordEnd = end` の `rTo>rFrom` ガードは lindera と微差（`needs-human`）**:
  `src/tokenizer/lattice.ts:160`。lindera `process_unknown_word` は invoke/found を満たせば
  unk 行が 0 でも `return start+byte_len` して `unknown_word_end` を進める（compat doc l.128-145）。
  yomi は unk 行 0 のカテゴリでは進めない。naist-jdic は全カテゴリに unk 行がある想定
  （§5.3）ため実害はほぼ無いが、厳密には挙動差。**要確認**: 全カテゴリが unk 行を持つことの
  保証（builder 側 UNKD 生成）。差を無くすなら `if (rTo > rFrom)` を外し常時
  `unknownWordEnd = end` に。
- **🔵 L-B-2 — コスト累積に i32 飽和加算が無い（`needs-human`・病的入力のみ）**:
  `src/tokenizer/lattice.ts:66,171`。lindera は `saturating_add`（i32 飽和）、compat doc §7.1 は
  「TS は加算＋クランプで可」と示すが yomi は素の number 加算でクランプ無し。i16 コストの
  float64 累積は安全整数域内で正確なので、差が出るのは 1 断片（句読点なし）が数万文字級で
  累積が ±2^31 を跨ぐ病的ケースのみ。実運用では発生しない見込み。方針として明記 or クランプ
  追加を検討。
- **🔵 L-B-3 — analyze 経路で `normalizeForDict` を二重に計算（perf/DRY）**:
  `src/analyze.ts:18,41`（`buildResult(normalizeForDict(text), analyzeToNodes(dict, text, …))`）は
  `analyzeToNodes → tokenize` 内（`src/tokenizer/tokenizer.ts:26`）で再度 `normalizeForDict(text)`
  を呼ぶ。同一関数・同一入力・冪等ゆえ**結果は常に一致**（正確性問題なし）だが、解析ごとに
  正規化を 2 回計算する冗長。`analyze.ts` は out-of-scope ファイルだが tokenizer 由来なので
  記載。1 回正規化して両者へ渡す設計にすれば冗長解消＋整合を構造的に固定できる。
- **🔵 L-B-4 — 未知語 group 連結で `qBuf` をホットループ内 new**:
  `src/tokenizer/lattice.ts:133`。`const qBuf: number[] = [0,0,0,0]` が
  「位置×group カテゴリ」ごとに確保される（外側 `catsBuf` は再利用しているのに）。記号連続の
  多い入力で小さな GC 圧。ループ外に括り出せば割り当てゼロ化できる（perf 微）。
- **🔵 L-B-5 — normalize の冪等性・サロゲート通過が未テスト**:
  `src/text/normalize.ts:59-83`（レビューでは冪等・サロゲート通過を確認済み）。回帰保護として
  `normalizeForDict(normalizeForDict(x)) === normalizeForDict(x)`、およびサロゲートペア入力が
  素通りする（+0xFEE0 されない）ことのテストを `normalize.test.ts` に追加すると L-B-3 の
  「冪等前提」も明示的に守られる。

### 依存方向・fail-loudly・黙った補正（設計原則）チェック — 違反なし（C=0）

- 依存方向: `text`（葉・自己完結）／`tokenizer → dict, text`（順方向・`import type` 中心）。
  back-edge 無し（`format,text → dict → tokenizer` に整合）。
- fail-loudly: `lattice.ts:63,177`・`overlay.ts` の各 throw、`normalize` の非合成マーク脱落は
  jpreprocess 互換の**意図的**挙動（テスト済み）。黙った補正・症状糊塗は検出されず。
- 列参照事故（col13 発音/col12 読み取り違え）は本スコープ（text/tokenizer）には無関係
  （dict-builder 側の関心）。
