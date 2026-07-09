---
id: C
topic: NJD 処理段（jpreprocess NJD 後段の移植）— frontend / from_tokens / pronunciation / digit(+lut/sequence) / accent_phrase / accent_type / chain_rules / unvoiced_vowel / pos / node / rule_node / types
files_reviewed:
  - src/njd/frontend.ts
  - src/njd/mod.ts
  - src/njd/types.ts
  - src/njd/node.ts
  - src/njd/from_tokens.ts
  - src/njd/pos.ts
  - src/njd/pronunciation.ts
  - src/njd/accent_phrase.ts
  - src/njd/accent_type.ts
  - src/njd/chain_rules.ts
  - src/njd/rule_node.ts
  - src/njd/unvoiced_vowel.ts
  - src/njd/digit.ts
  - src/njd/digit_sequence.ts
  - src/njd/digit_lut.ts
  - src/njd/njd.test.ts
  - src/njd/digit_lut.test.ts
date: 2026-07-10
model: opus
---

# NJD 処理段 全域レビュー（group C）

## 総評

移植の品質は高い。**最重点の col12/col13 取り違え（Critical 候補筆頭）は本ドメイン内に
一切なし**。`from_tokens.ts` は `t.pronRaw`（発音=col13）を、`digit.ts` の class3 照合は
`pronOrig`（発音由来）を、`rule_node.ts` は CSV 行の f[9]=発音を使う。dict-builder 側も
`COL.PRON: 12`(0-origin) = col13 を実使用列として名前付き定数経由で参照している
（`dict-builder/src/csv.ts:20`）。取り違えの痕跡はゼロ。

依存方向も健全: `frontend.ts` は `../tokenizer`・`../dict`（型のみ）・`../text` を import する
のみで back-edge なし。`digit_lut.ts` は ADR-0002 の要請どおり `mod.ts` から再 export されず
非公開に留まる（実装詳細の秘匿 OK）。実行時依存もゼロ。ハックマーカー（TODO/FIXME/HACK）は
njd 配下に皆無。git churn も無し（`c592071` 導入以降、再編のみで反復バグ修正なし＝根本未解決の
兆候なし）。

パイプライン適用順は jpreprocess/OpenJTalk と整合する（下部の図参照）。唯一 OpenJTalk に
ある `njd_set_long_vowel` が欠けるが、これは**意図的省略**であり本家 OpenJTalk で廃止
（全コメントアウト）・jpreprocess も未実装、と参照リポ `../browser-tts/docs/limitations.md:11`
に明記されている。実装漏れではない。

一方で **確信できるバグ（E/C）は検出されなかった** ことと裏腹に、**リスクは「テストの薄さ」に
集中している**。njd ドメインは実装約1500行に対しユニットテストは実質 22 件で、うち3件
（`njd.test.ts`）は Rust からの移植ケース、19件（`digit_lut.test.ts`）はテーブルの件数突合と
数件の end-to-end に留まる。そして最大の問題として、コードが繰り返し安全網として言及する
**ゴールデン回帰（`fixtures/golden-3k.jsonl`）を実行するテストがリポジトリに存在しない**
（後述 W-C-1）。「差が出ればゴールデンが検出する」（`accent_type.ts:65`）という前提は現状
成立していない。

needs-human に倒した項目: jpreprocess 本家挙動は手元で照合できないため、(a) 十進小数の連続
セパレータ処理の continue/fall-through 差、(b) `P1`/`P2` の式が同一で正しいか、(c) `calcDigitAcc`
の各定数、は本家ソース確認が必要。

---

## ファイル別分類テーブル（全17ファイル）

| # | ファイル | 分類 | 要旨 |
|---|---------|------|------|
| 1 | frontend.ts | 🟢 S | 適用順は jpreprocess と整合。long_vowel 欠落は意図的（browser-tts で文書化）。ただし yomi 自身の docs には未記載（→ X-2） |
| 2 | mod.ts | 🟢 S | バレル。digit_lut を再 export しない＝ADR-0002 準拠 |
| 3 | types.ts | 🟢 S | 型定義は明瞭・JSDoc 完備。`AccentType` union の網羅は本家 PARSE_REGEX と一致 |
| 4 | node.ts | 🟢 S | `moraSize`/`isTouten`/`isQuestion`/`makeMoras` の小ヘルパ。問題なし |
| 5 | from_tokens.ts | 🔵 L | 発音(col13)を正しく使用。未知語/`*` 分岐 OK。既知語で pronRaw=undefined の場合に isUnknown=true と誤ラベルする縮退（起きない前提）。テスト無し（→ W-C-2） |
| 6 | pos.ts | 🔵 L | 述語は col 位置 p[0..5] 直参照（設計方針どおり）。`isRenyou` の `p[5].startsWith` は 6-arity 不変条件依存（実務上安全、破れれば loudly throw）。述語/`convertToKigou` のテスト無し |
| 7 | pronunciation.ts | 🟡 W | 4 挙動（かな分割・フィラー併合・動詞+う→長音・です/ます+？）を持つ複雑パスがテスト皆無（W-C-3） |
| 8 | accent_phrase.ts | 🟡 W | R01–R18 の18規則が直接テスト皆無（W-C-2）。「Rule 08」ラベル重複はコメント上の紛らわしさ（→ W-C-2 詳細） |
| 9 | accent_type.ts | 🟡 W | `calcDigitAcc`/十-特例/桁アクセント直接テスト無し（W-C-6）。負値クランプのコメントが browser-tts の実測と矛盾（W-C-6）。`P1`≡`P2` は needs-human |
| 10 | chain_rules.ts | 🔵 L | パーサは堅牢。module-global キャッシュは純関数メモ化で無害。直接パーステスト無し（間接のみ） |
| 11 | rule_node.ts | 🔵 L | `makeRuleNode`/`resetNode`/`setPron`。不正入力は fail loudly。失敗パスのテスト無し（→ W-C-7 境界） |
| 12 | unvoiced_vowel.ts | 🟡 W | R2/R3/R4 は2件で担保。R0（フィラー）・R1（です/ます）・R5 例外ペアが未検証（W-C-5） |
| 13 | digit.ts | 🟡 W | 小数 skip 状態機の continue/fall-through 差（L・needs-human, W-C-7）。日付複合・class3/others の多数分岐が未検証（W-C-7） |
| 14 | digit_sequence.ts | 🟡 W | `score()`/桁読み/順読み/カンマ区切り/zeroStart が直接テスト皆無（W-C-4）。本ドメインで最も複雑かつ未検証 |
| 15 | digit_lut.ts | 🔵 L | データ表。スポット検算は妥当（下記）。件数突合はあるが個別エントリの内容検証は大半が穴（W-C-4/6 に含む） |
| 16 | njd.test.ts | 🟡 W | NJD 全域で3件のみ。accent_phrase/pronunciation/digit_sequence/pos/from_tokens の単体が無い（W-C-2） |
| 17 | digit_lut.test.ts | 🔵 L | 19件。構造ガードとして良質だが多くのテーブルは件数のみ（内容は未検証, W-C-6） |

分類凡例: 🟢 Safe / 🔵 Low / 🟡 Warning / 🟠 Error(=バグ確実) / 🔴 Critical(=設計原則違反)。
**E/C は0件**。Warning は主に「振る舞い+分岐のテスト欠落」（タスクの重大度マッピング準拠）。

データ・スポット検算（digit_lut, いずれも一致）: 一分=イッ+プン（1G促音化＋2B半濁）、
六本=ロッ+ポン（1G＋2C半濁）、三本=サン+ボン（2C連濁）、八百=ハッ+ピャク（numeral DIGIT LIST9
＋NUMERATIVE LIST7）、十分=ジュッ（1G, 現代読み）。

---

## Warning 以上の詳細

### W-C-1 🟡→🟠 ゴールデン回帰テストがリポジトリに存在しない（横断・最重要）

- **path**: `fixtures/golden-3k.jsonl`（9.9MB, committed）を消費するテストが皆無。
  `deno.jsonc` の `check`/`test` タスクは `deno test` を回すのみで、golden を読むランナーは
  src/・scripts/ のどこにもない（`rg golden-3k` はコメントのみヒット）。
- **症状**: `CLAUDE.md` は golden を「回帰の真実源（committed）」と位置づけ、njd のコードは
  要所で「差が出ればゴールデンが検出する」（`accent_type.ts:65`）「ゴールデンが検出」を前提に
  クランプ等の逸脱を許容している。しかし現状その検出器は動いていない。1500行の NJD 後段の
  end-to-end 互換性を担保する唯一の仕組みが未接続。
- **根本原因**: golden ハーネス（JSONL の各レコードの `tokens` を入力に `analyzeToNodes`→
  `accentPhrases` 相当を組み立て、期待 `accentPhrases`/`nucleus`/`devoiced` と突合）が未実装。
  `../browser-tts/docs/golden-format.md` に等価規約（平板 `nucleus∈{0,モーラ数}`・核>モーラ数の
  忠実保持・負値ラップ2件の既知逸脱）まで定義済みなのに、yomi 側に移植されていない。
- **修正案（レビュアー提案・実装は別タスク）**: `src/` 外（例 `scripts/golden.test.ts` か
  `fixtures` を読む統合テスト、`--allow-read` は既に付与済み）に golden ランナーを追加し、
  golden-format.md の等価クラス（平板の2表現、核>モーラ数の忠実、負値ラップの既知逸脱
  allowlist）を実装する。辞書 fixture 非在時は skip（tokenizer 統合テストと同方針）。
- **追加すべきテスト**: 上記ランナー本体がテスト。最低限、golden 全件の
  (a) モーラ連結一致、(b) 核の等価クラス一致、(c) devoiced 集合一致 を assert。
- **重大度**: 振る舞い網羅の観点では Warning だが、「唯一の互換安全網が欠落」という
  波及の大きさから Error 寄り。★このドメインで最初に埋めるべき穴。

### W-C-2 🟡 NJD 単体テストが3件のみ — accent_phrase（18規則）が完全未検証

- **path**: `src/njd/njd.test.ts:1-178`（3件）、`src/njd/accent_phrase.ts:38-92`。
- **症状**: `accent_phrase.ts` の `chainFlag` 判定は R01–R18 の順序依存 match（コメントで
  「順番を変えてはならない MUST」と宣言）。この18分岐に対する直接テストがゼロ。同様に
  `from_tokens`・`pos` 述語・`convertToKigou`・`chain_rules.parseChainRules` の単体も無い。
- **根本原因**: 移植時にコアロジック（accent_type cow test / unvoiced 2件）だけ Rust から
  移植し、他パスの behavior テストを起こしていない。
- **修正案（テスト追加）**: `accent_phrase` は各規則を発火させる最小2ノード列で
  `chainFlag` を assert（特に R08 の3分岐＝付属語連続 chain / 付属語後自立語 break /
  付属語 chain の優先順）。`parseChainRules` は `"C3"` / `"形容詞%F2@-1"` /
  `"動詞%F1/形容詞%F1/名詞%F1"` / `"特殊助動詞%..."`（スキップされる）/ `"*"`（null）を網羅。
- **付記（Low）**: `accent_phrase.ts:70-75` はコメントラベルが「Rule 08 / Rule 09 / Rule 08」と
  08 が重複。挙動（付属語連続→chain, 付属語後自立語→break, 付属語→chain）は論理的に正しいが、
  ラベル重複は本家 match 対応の追跡を鈍らせる。needs-human: 本家 accent_phrase.rs の実際の
  規則番号割当と照合してコメントを正すのが望ましい。

### W-C-3 🟡 pronunciation.ts の4挙動がテスト皆無

- **path**: `src/njd/pronunciation.ts:16-103`。
- **症状**: (1) モーラ0ノードの表層かな分割＋フィラー/記号化、(2) 無音ノード除去、
  (3) 連続かなフィラーの先頭併合（chain kana sequence）、(4) 動詞/助動詞+助動詞「う」→長音ー・
  です/ます+「？」→核1、の4挙動すべてに直接テストが無い。特に (4) は `LONG_MORA`/`splitPlain`
  という内部ヘルパを絡め、`analyzeToNodes` 経由でしか触れられていない。
- **根本原因**: パスの behavior テスト未整備。
- **修正案（テスト追加）**: 「行こう」→ イコー（動詞+う→長音, accent 0 化）、「です？」→
  デス核1、未知語表層のかな分割（フィラー化）と読点相当の記号化、連続 kana フィラー併合を
  それぞれ独立に assert。`makeRuleNode`/手書きノードで入力を構成できる。

### W-C-4 🟡 digit_sequence.ts（順読み/桁読み判別・スコア・カンマ）が直接テスト皆無

- **path**: `src/njd/digit_sequence.ts`（全域, 302行）。`score()`(21-52)、`buildSequences`/
  `isCommaSequence`/`zeroStart`(95-187)、`convertNumerical`/`convertNonNumerical`(192-253)。
- **症状**: 本ドメイン最複雑モジュールが未検証。`digit_lut.test.ts` は `njdSetDigit`（digit.ts）
  のみを叩き、digit_sequence は一切通っていない。桁読み/順読みの文脈スコア、4桁カンマ整合、
  先頭ゼロ→順読み強制、小数隣接での加点、位取り語ノード挿入時の index offset 管理、72桁上限
  （`NUMERAL_LIST3.length*4`）などの分岐・境界がノーガード。
- **根本原因**: パス単体テスト未整備。挿入/削除に伴う offset 計算（`convertNumerical` の
  `offset`/`offsetComma`）はオフバイワンの温床で、回帰検出網（W-C-1）も未接続。
- **修正案（テスト追加）**: 縁ケースを behavior テストで固定 —
  「1234」桁読み→センニヒャクサンジューヨン相当（万未満）、「12345678」→万境界での NUMERAL_LIST3
  挿入、「0123」先頭ゼロ→順読み、「1,234,567」カンマ整合→桁読み、「1,23」不整合→チャンク分割、
  電話番号風（前後がハイフン/括弧）→順読み（score<0）、73桁以上→早期 return（読み下し）。
  0/2/5 の順読み特殊音（ゼロ/ニー/ゴー, `convertNonNumerical:196-205`）も assert。

### W-C-5 🟡 unvoiced_vowel の R0/R1/R5例外ペアが未検証

- **path**: `src/njd/unvoiced_vowel.ts:67-104,133-158`。
- **症状**: 既存2テストは R2（語頭シ）/R3（連続無声化しない）/R4（核）を通すが、
  R1（です・ますの「す」: 次が ？/長音なら有声、それ以外無声, `:67-79`）、R0（フィラー不無声化,
  `:109`）、R5 の例外ペア（s→s/sh・f/h→f/h/hy は無声化しない, `:142-148`）が未検証。
- **根本原因**: 移植テストが interpretation ケースに限定。
- **修正案（テスト追加）**: 「です。」→ス無声 vs 「です？」→ス有声、「ですし」型の f/h・s 連続で
  例外ペアが無声化を回避すること、フィラー母音が無声化しないこと、を assert。

### W-C-6 🟡 accent_type: 数詞アクセント未検証 ＋ 負値クランプのコメント矛盾 ＋ P1≡P2

- **path**: `src/njd/accent_type.ts:29,51-100,102-134`。
- **症状①（テスト欠落）**: `calcDigitAcc`（十/百/千/万/億/兆の桁アクセント, `:103-134`）と
  「十＋数詞→平板」特例（`:29`）に直接テストが無い。cow test は `calcTopNodeAcc` の F 系のみ通す。
  十百千万…の各定数（例: 百で prev=七→2, 三四九何→1, それ以外→moraSize和）は本家値の写経で、
  golden も未接続のため誤りが素通りする。
- **症状②（コメント vs 実測の矛盾, Low）**: `:63-65` の NOTE は「実データで負になる組は
  観測されていない…差が出ればゴールデンが検出する」とするが、`../browser-tts/docs/limitations.md`
  は「負値ラップは実データで発生（100k中2文）／本実装は0にクランプ／評価では既知逸脱として扱う」
  と記す。つまり (a) 負値は実際に発生する、(b) golden は検出ではなく allowlist で許容する、の
  2点でコメントの前提が崩れている。クランプ（`Math.max(0, moraAcc+rule.addType)`, `:66`）自体は
  browser-tts の設計判断と一致し正しいが、コメントの根拠説明が古い/誤り。
  → 「『実データで負にならない』という前提はここで崩れる、理由は browser-tts 実測2件」。
- **症状③（needs-human）**: `:89-92` で `P1` と `P2` の式が完全同一
  （`topAcc===0 ? 0 : moraAcc+nodeAcc`）。本家 accent_type.rs で P1/P2 が本当に同一式か、
  写経時の取りこぼしかは手元で確認不能。要本家ソース照合。
- **修正案**: (①) `calcDigitAcc` を「十一/五十三/七百/二百/三千/一億/六兆」等で個別 assert。
  (②) コメントを「負値は実データで発生し得る（browser-tts 実測2件）。本実装は 0 にクランプする
  意図的逸脱で、golden 側は既知逸脱として allowlist する」に是正（コード変更ではなく文言修正、
  実装は別タスク）。(③) P1/P2 は本家照合を要判断として起票。

### W-C-7 🟡/🔵 digit.ts: 小数連続セパレータの continue/fall-through 差（needs-human）＋日付複合の分岐未検証

- **path**: `src/njd/digit.ts:78-119`（小数 skip 状態機）、`:151-223`（class3/others・日付複合）。
- **症状①（needs-human, Low）**: 小数処理の3状態機（`disabled`/`ifMeishi`/`skipping`）は
  `skipping` 中に非「名詞」ノードへ達したとき `skip="disabled"; continue;`（`:88-90`）と、その
  ノードの小数点再検出を**スキップ**する。単一 bool の素朴実装なら fall-through して同ノードを
  小数点判定に回す。差が出るのは「N〔sep〕M〔sep〕K」の連続小数で、かつ2つ目セパレータの pos が
  「名詞」でない場合。ゴールデン実測では小数点「．」は変換後 名詞（テン）、生「・」は 記号
  （`fixtures/golden-3k.jsonl`）。従って**「1・2・3」型**（記号セパレータ連続）で
  yomi=「1テン2・3」/ fall-through 実装=「1テン2テン3」の分岐が起こり得る。本家 njd_set_digit の
  該当ループが continue か fall-through か手元で確認できないため needs-human。yomi の continue は
  「連続小数を二重変換しない」意図としては妥当にも読め、どちらが本家準拠かは要ソース確認。
- **症状②（テスト欠落, Warning）**: 日付複合（十四日→ジューヨッカ, 二十日→ハツカ,
  二十四日→ニジュー・ヨッカ, `:186-223`）と class3 発音置換（`:160-167`）、others 丸ごと置換の
  「月＋一日→ツイタチ」特例（`:169-183`）が未検証。`digit_lut.test.ts` は一人/二人/一日単独/一分/
  三百のみ。`resetNode`＋`splice` による index 操作と `remove_silent_node`（`:225`）が絡む経路の
  境界が穴。
- **修正案**: 「三月一日」→ツイタチ、「十四日」→ジューヨッカ、「二十日」→ハツカ、
  「二十四日」→ニジューヨッカ、「二人前」（class3 前置数字ガード `:157` の効き）を behavior テスト
  で固定。①は本家ソース確認後に「1・2・3」の期待を確定し回帰化。

---

## NJD パス パイプライン（適用順・実行番号・jpreprocess 対応）

`analyzeToNodes(dict, text, overlay?)`（`frontend.ts:24`）= jpreprocess `run_frontend` /
pyopenjtalk `run_frontend` 相当。**上から順に in-place/再代入で適用**（順序は load-bearing）。

```
  入力 text
    │
 [T] tokenize(dict,text,overlay)         ../tokenizer  … 分かち書き（本レビュー対象外）
    │  Token[]（pron=発音col13, accType, chainRule, chainFlag）
    ▼
 [0] nodesFromTokens(tokens)             from_tokens.ts   ← NJD::from_tokens / NJDNode::load
    │  既知語=発音列をモーラ化 / 未知語=空モーラ（pronOrig=発音キーを保持）
    ▼
 [1] njdSetPronunciation(nodes)          pronunciation.ts ← njd_set_pronunciation
    │  表層かな分割→フィラー/記号化, 無音除去, かな連続併合, 動詞+う→長音, です/ます+？
    ▼
 [2] njdDigitSequence(nodes)             digit_sequence.ts← njd_set_digit_sequence（jpreprocess独自）
    │  未知数字展開・数字正規化・順読み/桁読み判別・位取り語ノード挿入
    ▼
 [3] njdSetDigit(nodes)                  digit.ts (+lut)  ← njd_set_digit
    │  小数点テン化, class1/2 音便・連濁, numeral 連声, class3/others 特殊読み, 日付複合
    ▼
 [4] njdSetAccentPhrase(nodes)           accent_phrase.ts ← njd_set_accent_phrase
    │  隣接2ノードの品詞から chainFlag（R01–R18, 先勝ち match）
    ▼
 [5] njdSetAccentType(nodes)             accent_type.ts   ← njd_set_accent_type
    │  句頭ノードへ核位置書込（F/C/P 結合型 + calcDigitAcc + 十特例）
    ▼
 [6] njdSetUnvoicedVowel(nodes)          unvoiced_vowel.ts← njd_set_unvoiced_vowel
    │  母音無声化フラグ tri-state 確定（R0–R5）
    ▼
 [×] （njd_set_long_vowel は不実装）        ―               ← 本家 OpenJTalk で廃止(全コメントアウト)
    │                                                        jpreprocess も未実装＝意図的省略
    ▼
  NjdNode[]（読み・アクセント・無声化 確定）
```

対応表:

| 実行# | yomi 関数 (path) | jpreprocess/OpenJTalk 対応 | 状態 |
|------|------------------|---------------------------|------|
| [0] | `nodesFromTokens` (from_tokens.ts:12) | `NJD::from_tokens` / `NJDNode::load` | ✅ 発音(col13)使用 |
| [1] | `njdSetPronunciation` (pronunciation.ts:16) | `njd_set_pronunciation` | ✅（テスト無 W-C-3） |
| [2] | `njdDigitSequence` (digit_sequence.ts:258) | `njd_set_digit_sequence`（jpreprocess独自） | ✅（テスト無 W-C-4） |
| [3] | `njdSetDigit` (digit.ts:76) | `njd_set_digit` | ✅（小数連続=needs-human W-C-7） |
| [4] | `njdSetAccentPhrase` (accent_phrase.ts:30) | `njd_set_accent_phrase` | ✅（テスト無 W-C-2） |
| [5] | `njdSetAccentType` (accent_type.ts:11) | `njd_set_accent_type` | ✅（P1≡P2=needs-human W-C-6） |
| [6] | `njdSetUnvoicedVowel` (unvoiced_vowel.ts:40) | `njd_set_unvoiced_vowel` | ✅（R0/R1/R5例外 未検証 W-C-5） |
| [×] | （無し） | `njd_set_long_vowel` | ⬜ 意図的省略（browser-tts limitations.md:11） |

**欠けている pass の分類**: `njd_set_long_vowel` のみが未実装で、これは**意図的省略**
（本家廃止・jpreprocess 未実装）。それ以外の主要 pass は全て実装済みで順序も整合。実装漏れの
パスは検出されなかった。

---

## 横断所見

- **X-1（最重要, W-C-1 再掲）**: ゴールデン回帰ハーネス未接続。njd の随所（`accent_type.ts:65` 他）
  が拠り所にする安全網が現状 no-op。負値クランプ・核>モーラ数など「golden が担保」前提の逸脱が
  実は無検証で通っている。最優先で埋めるべき。

- **X-2（Low, ドキュメント欠落）**: yomi は正リポになったが `docs/limitations.md` と
  `docs/known-issues.md` を持たない（`docs/` は decisions と jtd1-format のみ）。njd 由来の
  設計上の逸脱＝(a) `njd_set_long_vowel` 非実装、(b) 負値ラップの 0 クランプ（実測2件の既知逸脱）、
  (c) 核>モーラ数の忠実保持、は現状 `../browser-tts/docs/` にしか記録がない。ユーザーの
  グローバル規約（docs/limitations.md・known-issues.md を正準ホームとする）と CLAUDE.md の
  doc 索引に照らし、これらを yomi 側 docs へ移送するのが望ましい。

- **X-3（Safe, 良い設計として記録）**: 数詞処理の pass 間協調が精巧。「十一」で `digit.ts` numeral
  パスが `一.chainFlag=false`（`:141-143`）を先に確定させることで、後段 `accent_type` の
  十特例（`:29` currentAcc=0）が後続ノードの `calcTopNodeAcc` に上書きされない。この順序依存は
  正しく効いており、レビュー中に疑った「十→0 が C3 で上書きされる」懸念は成立しない（撤回）。
  ただしこの不変条件はテストで固定されておらず、パス順を変えると静かに壊れる脆さがある
  （→ W-C-1/W-C-4 のテストで縛るべき）。

- **X-4（Low）**: `pos.ts:62` `isRenyou` は `p[5].startsWith` を無防備に呼ぶ。NjdNode.pos は
  posTable（dict-builder が [POS..CFORM] の6要素を intern, `dict-builder/src/build.ts:94,241`）か
  `makeRuleNode`（常に6要素）由来なので実務上は常に6-arity で安全。破れれば TypeError で
  loudly throw（v1前の fail-loudly 方針に合致）。要すれば「6要素前提」を型/コメントで明示すると
  意図が固まる。

- **X-5（Low, 純度）**: `chain_rules.ts:16` の module-global `cache` は共有可変状態だが、
  `parseChainRules` が入力文字列の純関数であるためメモ化として無害（同入力→同出力、辞書有限で
  上限あり）。DI 化の必要はないが、テスト間で状態を持ち越す点は認識しておくとよい。

---

*全指摘は path:line 付き。E/C（確信バグ・設計違反）は0件。needs-human: W-C-6③(P1≡P2)、
W-C-7①(小数連続の continue/fall-through)、W-C-2 付記(Rule 08 ラベル)。いずれも jpreprocess
本家ソース照合が必要で、手元では断定不能。*
