---
id: D
topic: G2P 出力層 & 公開ファサード（result/phonemes/tones/word_alignment/types/mod, analyze, facade mod, constants, _dict_path）
files_reviewed:
  - src/g2p/result.ts
  - src/g2p/phonemes.ts
  - src/g2p/tones.ts
  - src/g2p/word_alignment.ts
  - src/g2p/types.ts
  - src/g2p/mod.ts
  - src/g2p/word_alignment.test.ts
  - src/analyze.ts
  - src/mod.ts
  - src/mod.test.ts
  - src/constants.ts
  - src/_dict_path.ts
date: 2026-07-10
model: opus
---

# グループD: G2P 出力層 & 公開ファサード

## 総評

担当範囲は健全。最重点の「二重経路の乖離リスク」（buildResult vs wordPhoneAlignment）は、
**音素・モーラ生成ロジックが単一実装（`nodeToMoras` / `moraToPhones` / `pausePunct` /
`symbolPause`）に集約**されており、生成側の二経路化は構造的に防がれている。両経路の
prevVowel（長音解決）・pause 確定・chainFlag グルーピング・文末 long 強制の全分岐を手で突合せた
結果、**現時点で観測可能な乖離は無い**（下の「2経路データフロー図」に実行番号付きで対応関係を明示）。

ただし残る構造的懸念が1点: **句セグメンテーションの「走査」ロジックだけは buildResult と
wordPhoneAlignment に手書きで2箇所**存在する（生成は共有だが走査は非共有）。現状は
`word_alignment.test.ts` の全文一致テスト（flatMap 音素連結の同値）がガードだが、これは
**振る舞いテストであって構造的共有ではない**。将来グルーピング規則を片側だけ触ると、コーパス
15文が踏まない入力で黙って乖離しうる（CLAUDE.md「二経路は1経路に構造的に共有せよ」）。→ W-D-1。

正規化タイミング（タスク観点2）は正しい: `analyze` / `analyzeWithWords` はいずれも
`buildResult(normalizeForDict(text), analyzeToNodes(dict, text, overlay))` で、生ノードは
`tokenize` 内部の `normalizeForDict` 由来、`normalizedText` フィールドも同じ純関数由来。**正規化前後
テキストの取り違えは無く、overlay も両経路で同一 nodes に伝播**（result と words が同じ nodes を
共有）。→ 問題なし。

トーン変換（観点3）は標準スキーム（平板/頭高/中高/尾高）を正しく実装し、核位置→トーン列の
オフバイワンも無い（`moraTones(nucleus, moras.length)` が 1:1 長で返る）。→ ロジックは正しい。

ファサード面（観点4）は ADR-0002 と一致（薄い `.` + 全量 `./g2p`、同名は同一シンボルを指す）。
publish 除外（観点5）も健全: **`_dict_path.ts` は `*.test.ts` からのみ import され、deno.jsonc の
publish.exclude で除外済み** → 公開パッケージ破壊は無い（Critical 該当なし）。

主リスクは**設計原則系の W が1件（走査二重化）**と、**核位置/モーラ境界の縁のテスト不在（E×2）**。
バグ確実（E=誤実装）や Critical（設計原則違反の実害）は検出せず。

## ファイル別分類

| File | 分類 | 要点 |
| --- | --- | --- |
| src/g2p/result.ts | 🟡 W | buildResult は正しく共有ヘルパ利用。ただし走査が word_alignment と手書き二重化（W-D-1）＋ 専用単体テスト不在（W-D-5） |
| src/g2p/phonemes.ts | 🟠 E | 唯一実装で正しい。長音の句頭 "o" 縮退・cl/N/母音のみ分岐の純単体テスト不在（dict-gated 統合のみ）（E-D-3） |
| src/g2p/tones.ts | 🟠 E | ロジックは標準スキームで正しいが**テスト完全不在**（核位置の縁・クランプ・負核）（E-D-2）。加えて clamp が fail-loud 既定と緊張（W-D-4） |
| src/g2p/word_alignment.ts | 🟡 W | 正しく共有ヘルパ利用。走査二重化の当事者（W-D-1）。`?? prevVowel` は到達しない防御（無害） |
| src/g2p/types.ts | 🟢 S | 型定義のみ。JSDoc 完備。循環回避のため最下層配置 |
| src/g2p/mod.ts | 🔵 L | `export *` で symbolPause/nodeToMoras/buildResult も公開面に露出（L-D-6: 意図確認） |
| src/g2p/word_alignment.test.ts | 🔵 L | 経路同値の中核テストとして良質。ただし dict-gated（辞書無で skip）＋コーパス15文どまり（L-D-6 系: 純単体で縁を固めよ） |
| src/analyze.ts | 🔵 L | 正規化・overlay 伝播は正しい。normalizeForDict を二重呼び（同一純関数、乖離なし・微冗長）（L-D-7）。専用テストなし |
| src/mod.ts (facade) | 🟢 S | ADR-0002 と一致。薄い・同名同一シンボル。VERSION は constants 単一源 |
| src/mod.test.ts | 🟢 S | VERSION semver 正規表現のみ（範囲相応） |
| src/constants.ts | 🟢 S | VERSION/DICT_* 定数。drift ガードは version_sync/verify_tag（範囲外）に委譲。JSDoc 完備 |
| src/_dict_path.ts | 🟢 S | テスト専用。publish 除外済み・非テスト src から未 import（公開破壊なし・確認済） |

---

## Warning 以上の詳細

### W-D-1 🟡 句セグメンテーション走査が buildResult と wordPhoneAlignment に二重実装
- path: `src/g2p/result.ts:16-38` ／ `src/g2p/word_alignment.ts:55-79`
- 症状: 音素/モーラ**生成**は共有ヘルパ（`nodeToMoras`/`moraToPhones`/`pausePunct`/`symbolPause`）に
  一元化されている一方、**「走査＝句グルーピング（chainFlag）＋記号→pause 確定＋prevVowel リセット＋
  文末 long 強制」の制御フローは両ファイルに手書きで2本**存在する。現状の全分岐突合せでは出力は一致
  （下図参照）。だが不変条件を守っているのは構造ではなく `word_alignment.test.ts` の全文一致テスト
  （flatMap 音素連結の同値）であり、テストが踏むのはコーパス15文のみ。
- 根本原因: 走査状態の持ち方が両者で別物（result.ts は `phrases[last]` を直接ミューテート＝pause を即時
  上書き／prevVowel を `phrase.moras.at(-1)?.vowel` から都度導出。word_alignment.ts は `pendingPause` /
  `hasOpenPhrase` / `prevVowel` のローカル変数で遅延 flush）。**同じ「句の区切り」を二通りの状態機械で
  再現している**ため、片側だけの改修で黙って乖離しうる（CLAUDE.md「2経路は1経路に構造的共有」違反の芽）。
- 修正案（レビュアー提案・要判断）: NJD ノード列を**句単位イテレータ**（例
  `iterPhrases(nodes): {moras, accentNucleus, pauseAfter, wordSpans}[]` 相当、prevVowel/pause/文末long を
  1箇所で確定）へ抽出し、buildResult と wordPhoneAlignment を**同一のセグメンテーション結果の別ビュー**として
  組む。走査が構造的に1本になれば全文一致テストは回帰網ではなく単なる確認に格下げできる。
- 追加すべきテスト: セグメンタ抽出前でも、記号連続で last-wins（"！？"）／読点直後に chainFlag 継続句が
  来る／句頭長音／文末が読点（short が文末 long に上書き）を**辞書非依存の合成 NjdNode 列**で固定する
  ユニットテスト（現状これらは dict-gated 統合でしか触れない）。
- 補足（厳しい側の読み）: 本 review の分類規約では「二重経路乖離＝Critical」。ただし①生成は既に構造的共有、
  ②現時点の実出力に乖離なし（全分岐突合せ済）、③同値テストが存在、の3点から**現状は W** と判定。走査を
  片側改修する PR が出た時点で E→C に格上げされる性質の負債である旨を明示する。needs-human: セグメンタ
  抽出をやるか、テスト網の明示で据え置くか。

### E-D-2 🟠 moraTones（tones.ts）にテストが一切無い（核位置の縁が未固定）
- path: `src/g2p/tones.ts:14-27`（テスト: 該当ファイル無し）
- 症状: `moraTones` は平板/頭高/中高/尾高＋範囲外クランプ＋（暗黙の）負核という**分岐の塊**だが、
  ユニットテストも間接カバレッジも**ゼロ**（buildResult/wordPhoneAlignment は moraTones を呼ばないため、
  コーパス統合テストでも一度も実行されない・純粋に呼び出し側 API）。
- 根本原因: 純関数だが公開建材で、リファレンス実装（VOICEVOX/OpenJTalk）のトーン規約に一致する必要が
  ある——にもかかわらず**振る舞いを縛るテストが無い**。ロジック自体は精査の結果正しい（accent=3,len=5→
  [0,1,1,0,0]／頭高→[1,0,0,0,0]／平板→[0,1,1,1,1]／尾高 k=len→[0,1,…,1]）が、回帰時に無防備。
- 修正案: `tones.test.ts` を新設し、(a) 平板 k=0、(b) 頭高 k=1、(c) 中高 k=3/len=5、(d) 尾高 k=len、
  (e) 範囲外 k>len のクランプ（=尾高相当）、(f) len=1・len=0、(g) 負核（現状全 low）を t-wada 形式で表明。
- 追加すべきテスト: 上記 (a)–(g)。特に (d)/(e) の境界（`i+1<=k` の等号）と (g) の未文書挙動を固定。

### E-D-3 🟠 phonemes.ts の分岐・モーラ境界の縁が純単体テストで未固定
- path: `src/g2p/phonemes.ts:18-22`（moraToPhones）／`src/g2p/phonemes.ts:38-53`（nodeToMoras）
- 症状: `moraToPhones` の cl→["q"]／N→["N"]／子音有→[c,v]／母音のみ→[v]、`nodeToMoras` の擬似モーラ
  skip・長音の直前母音引継ぎ・**句頭長音の "o" 縮退フォールバック（:43 `prev ?? "o"`）**・"-"→consonant
  落とし・devoiced マーキングは、いずれも**dict-gated 統合テスト（辞書無で skip）でしか実行されない**。
  純関数なのに手組み Mora/NjdNode による単体テストが無い。
- 根本原因: 生成の**唯一実装**（＝ここが乖離防止の要）でありながら、境界（特に句頭長音の "o" 縮退は
  コーパス15文が踏まない可能性が高い）が回帰無防備。
- 修正案: `phonemes.test.ts` を新設。moraToPhones は Mora リテラル4種で分岐網羅。nodeToMoras は
  手組み NjdMora（pseudo/長音先頭/長音連続/"-"/voiced=false）で prevVowel あり/なしを表明。
- 追加すべきテスト: `nodeToMoras(node(先頭ー), undefined)` が "o" に倒れること（縮退の明示固定）／
  `moraToPhones({vowel:"cl"})===["q"]`・`{vowel:"N"}===["N"]`／子音付き拗音 [ky,a]／devoiced=true の透過。

### W-D-4 🟡 moraTones の範囲外クランプが「fail loudly」既定と緊張・負核が未文書
- path: `src/g2p/tones.ts:19-20`（`k = Math.min(accentNucleus, moraCount)`）＋ JSDoc `:11-12`
- 症状: 範囲外核を**黙ってクランプ**する（JSDoc は "fail loudly を避ける" と明記）。CLAUDE.md は pre-v1 で
  「壊れた/古いデータを黙って矯正せず fail loudly」を既定とするため、特に**ユーザ overlay 由来の
  範囲外核を黙って丸める**のは方針と緊張する。さらに負核（unset の -1 等）は全 low になるが未文書。
- 根本原因: 尾高（k==len）は言語的に正当（下降は次句で実現）で、`k>len` のクランプも尾高相当として
  概ね妥当——つまり「壊れたデータ」ではなく「正当な縮退」の側面もある。よって throw が正解とは限らず、
  **意図の明文化と挙動固定が欠けている**のが本質。
- 修正案（needs-human）: ①現状クランプを維持しつつ ADR/JSDoc に「範囲外核＝尾高相当に丸める（呼び出し側
  overlay の軽微逸脱を許容）」と DECIDED 明記＋E-D-2 の (e)(g) でテスト固定、または ②overlay 由来の
  範囲外を境界（analyze/overlay 解決時）で fail-loud に倒す、の二択。どちらを取るかはオーナー判断。
- 追加すべきテスト: E-D-2 の (e)(g) に同じ（本 W の固定はテストで担保する）。

### W-D-5 🟡 buildResult に専用単体テストが無い（走査分岐が dict-gated 統合任せ）
- path: `src/g2p/result.ts:13-38`（テスト: 直接の単体無し。間接は `word_alignment.test.ts` の
  `analyzeWithWords` 表明のみ・dict-gated）
- 症状: 句グルーピング（chainFlag）・記号→pause（読点 short/句点 long）・先頭記号の無視・文末 long 強制・
  複数記号 last-wins という**制御分岐が、辞書がある環境の統合テストでしか実行されない**。辞書無 CI や
  純ロジック回帰では無防備。
- 根本原因: buildResult は NjdNode 列があれば辞書不要で単体テスト可能（`symbolPause` も同様）にもかかわらず、
  手組みノードによる直接テストが無い。
- 修正案: `result.test.ts` を新設し、手組み NjdNode 列で (a) 先頭記号無視、(b) 読点=short/句点=long、
  (c) 複数記号 last-wins、(d) 文末 long 強制（読点で終わる→ "." に上書き）、(e) chainFlag グルーピング、
  (f) 句頭リセットされた prevVowel を表明。W-D-1 のセグメンタ抽出をするなら、このテストはそのままセグメンタの
  仕様テストへ昇格できる。
- 追加すべきテスト: 上記 (a)–(f)。特に (d) は buildResult:36 の強制 long と `symbolPause` の相互作用を固定。

---

## Low 詳細（参考）

- **L-D-6**（`src/g2p/mod.ts:12-16`）: `export *` により `symbolPause`（内部ヘルパ）・`nodeToMoras`・
  `buildResult` も `./g2p` 公開面へ露出。buildResult/nodeToMoras は ADR-0002 文脈（sbv2-web が要求）で
  意図的だが、**symbolPause は word_alignment 内部専用の補助**で、公開意図は不明。needs-human: 公開面に
  残すか（残すなら JSDoc は既にあり deno doc --lint は通る）、`_` 前置等で非公開化するか。
- **L-D-7**（`src/analyze.ts:18,41`）: `analyze`/`analyzeWithWords` は `normalizeForDict(text)` を明示呼び＋
  `analyzeToNodes`→`tokenize` 内でも同一入力に対し再度呼ぶ＝**同一純関数の二重実行**。乖離リスクは無い
  （同じ関数・同じ入力）が、微冗長。normalizedText を tokenize 側から受け取る形にすれば1回化できる（任意）。

---

## NJDノード列 → result / words の2経路データフロー（共有関数・実行番号併記）

```
                         analyzeToNodes(dict, text, overlay)              [analyze.ts / frontend.ts]
                                        │
                                        ▼
                            readonly NjdNode[]  (surface / pos / moras[NjdMora] / accent / chainFlag)
                                        │
                 ┌──────────────────────┴───────────────────────┐
                 │ 経路A: buildResult()                          │ 経路B: wordPhoneAlignment()
                 │ [result.ts]  → FrontendResult                │ [word_alignment.ts]  → WordPhones[]
                 │                                               │
    走査(手書き)  ▼                                               ▼  走査(手書き)   ★W-D-1: この2本の走査だけ非共有
   (A1) node ごとに:                                     (B1) node ごとに:
        moraSize(node)==0 ─記号─┐                             moraSize(node)==0 ─記号─┐
          │                     ▼                                 │                    ▼
          │        (A2) symbolPause(node) ◀────[共有:result.ts]────▶ (B2) symbolPause(node)
          │        読点→short / 句点→long                          読点→short / 句点→long
          │        phrases[last].pauseAfter=… (即時上書き)          pendingPause=…  (遅延/新句 or 末尾で flush)
          │                                                        │
        (A3) 実モーラ node:                                     (B3) 実モーラ node:
          chainFlag!==true||空 → 新 phrase                        chainFlag!==true||!open → flushPause();
          (accentNucleus=node.accent, pauseAfter="none")            open=true; prevVowel=undefined
          prevVowel := phrase.moras.at(-1)?.vowel                   (prevVowel はローカル変数で保持)
                 │                                                        │
          (A4) nodeToMoras(node, prevVowel) ◀──[共有:phonemes.ts]──▶ (B4) nodeToMoras(node, prevVowel)
               ・擬似モーラ skip                                       （同一実装＝長音/-/devoiced/縮退"o"を一元化）
               ・長音 vowel="long"→ prev ?? "o"
               ・"-"→consonant 落とし
                 │                                                        │
          (A5) phrase.moras.push(...moras)                        (B5) words.push({surface, phones:
                 │                                                        moras.flatMap(moraToPhones)}) ◀─┐
                 │                                                     prevVowel := moras.at(-1)?.vowel   │
                 ▼                                            ┌──[共有:phonemes.ts moraToPhones]──────────┘
          (A6) 末尾: phrases[last].pauseAfter="long"          (B6) 末尾: open なら pendingPause="long"; flush
                 │  (文末 long 強制・両経路同一規則)                  │  (文末 long 強制・両経路同一規則)
                 ▼                                                        ▼
       FrontendResult.accentPhrases                            WordPhones[]（記号は pausePunct で独立語）
                 │                                                        │
                 └──── moraToPhones + pausePunct ────[共有]──── flatMap(w=>w.phones) ────┘
                        │                                                  │
                        └──────────── 全文一致テスト（word_alignment.test.ts）────────────┘
                                     ※現状の乖離防止ガード＝構造ではなく振る舞いテスト

  共有関数（生成は一元化・乖離しない）:
    nodeToMoras / moraToPhones  … phonemes.ts（唯一実装）
    symbolPause                 … result.ts（両経路が import）
    pausePunct                  … word_alignment.ts（テスト期待側も import）
  非共有（★リスク）:
    A1-A6 と B1-B6 の「走査/状態機械」… 出力は一致するが実装が別（W-D-1）
  moraTones … どちらの経路も呼ばない。呼び出し側（SBV2 等）が result.accentPhrases から使う中立建材（E-D-2）
```

---

## 横断所見

- **生成の一元化は達成、走査の一元化は未達**: 「二重経路の乖離」対策として最重要な音素/モーラ**生成**は
  `phonemes.ts` 単一実装で構造的に守られている（高評価）。残債は走査（W-D-1）のみ。ここを句イテレータへ
  抽出すれば、`word_alignment.test.ts` の全文一致テストは「回帰の綱」から「確認」へ降格でき、負債が消える。
- **テスト戦略が dict-gated 統合に寄り過ぎ**: result/phonemes/tones/analyze はいずれも純ロジックだが、
  現状の縛りは①`mod.test.ts`（VERSION のみ）②`word_alignment.test.ts`（辞書がある時だけ走る統合）に集中。
  **辞書非依存の単体テスト（手組み NjdNode/Mora）が丸ごと欠落**しており、核位置・モーラ境界の縁
  （句頭長音 "o"・尾高クランプ・負核・文末 long 上書き）が無防備。E-D-2/E-D-3/W-D-5 は同じ「純単体不在」の
  三面。優先度は tones（呼び出し側専用で一切実行されない）> phonemes（縁が skip 依存）> result。
- **ファサード・publish・正規化・overlay・トーン整合は健全**: ADR-0002 対応、`_dict_path` の publish 除外、
  正規化タイミングの一致、overlay の同一 nodes 伝播、核→トーンのオフバイワン無し——タスクの観点2/3/4/5は
  いずれも「問題なし」を確認済み（Critical/Error の設計・実装バグは非検出）。
- **needs-human 2点**: (1) W-D-4 の範囲外核クランプを DECIDED 明文化＋テスト固定にするか、境界 fail-loud に
  倒すか。(2) L-D-6 の `symbolPause` を公開面に残すか非公開化するか。いずれもオーナー方針依存。
