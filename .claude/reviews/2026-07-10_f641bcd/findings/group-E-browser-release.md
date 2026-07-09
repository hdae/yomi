---
id: E
topic: ブラウザ辞書ローダ & リリース基盤（getDictionary / Cache API / CRC 検証 / scripts / workflows / deno.jsonc）
files_reviewed:
  - src/browser/mod.ts
  - src/browser/mod.test.ts
  - scripts/bump.ts
  - scripts/verify_tag.ts
  - scripts/release_tag.ts
  - scripts/release_tag.test.ts
  - scripts/version_sync.test.ts
  - scripts/config_version.ts
  - scripts/verify_jtd.ts
  - .github/workflows/ci.yml
  - .github/workflows/release.yml
  - deno.jsonc
date: 2026-07-10
model: opus
commit: f641bcd
severity_summary: { C: 0, E: 0, W: 8, L: 5, S: 6positives }
id_format: "<Severity>-E-<n>（例 W-E-1 = Warning / group E / #1）"
---

# group-E: ブラウザ辞書ローダ & リリース基盤 レビュー

## 総評

現状の生きたソース（commit f641bcd）から起こした所見。**Critical / Error（確実なバグ）は 0 件**。
ローダの中核設計（gzip 自動判定・CRC self-heal・SHA 固定キャッシュ・「検証は必ず1回走る」導線）は
堅牢で、重点観点で挙がった失敗形状の多くは**証明の結果 SAFE**だった（下記「棄却できた失敗形状」）。

重心は 2 つに割れる:

1. **stale 参照の束（W-E-1〜4）** — browser-tts から切り出した際に comment が更新されず残った
   `ADR-0010`（本リポに存在せず＝0001/0002/0003 のみ）、削除済み `release-dict.yml`、改名前
   `loadDictionary`（→ `getDictionary`）への参照。特に version-sync 系 comment（W-E-4）は
   「VERSION が既定辞書 URL を決める」と述べるが、ADR-0003 で辞書 URL は `DICT_REVISION` にピンされ
   **パッケージ VERSION と完全独立**になった＝**根拠(効力の理由)が現在偽**。CLAUDE.md「comments explain
   WHY／untraceable な歴史参照を残さない」に反する。効力は低いが、将来の読者が「VERSION と辞書 URL が
   結合している」と誤読して設計判断を誤るリスクがある。リリース前に一掃を推奨。

2. **ローダの堅牢性 2 点＋テスト不在（W-E-5〜7）＝要人間判断** —
   (i) **Cache 書込み失敗（quota/SecurityError）が、辞書を取得・検証し終えた後でも load 全体を throw**
   させる（W-E-5）。キャッシュは最適化なのに、storage 満杯・Safari private 等のユーザは **DL 成功済みでも
   辞書ゼロ**になる。fail-loud 方針との整合か、best-effort にすべきかは設計判断。
   (ii) **可変 ref（`"main"`）で resolve が失敗（オフライン/HF 障害）すると、有効な SHA 固定キャッシュが
   あっても throw**（W-E-6）。既定（不変 SHA）経路は初回以降オフライン動作するが、`main` 経路は
   オフライン退行の余地ゼロ。意図（常に最新＝確認できなければ fail loud）か、last-known-SHA フォールバックを
   足すかは要判断。
   (iii) これらと**「caches 未定義＝Worker/Deno の fetch-only 経路」「並行呼び出し」を突くテストが 1 件も無い**
   （W-E-7）。ドキュメント済みのフォールバック経路がテストで縛られていない。

リリース基盤（release.yml の最小権限・verify_tag の三重照合・bump.ts の clean-tree ガード・`deno
bump-version -c` の実在性）は健全。bump.ts に**部分失敗時の非原子性**（W-E-8）が 1 点あるが、
未コミット＝回復可能で blast radius は小さい。

**v0.2.0 release の可否**: 上記はいずれも release をブロックする欠陥（publish 壊れ・検証スキップ）ではない。
stale comment（W-E-1〜4）は「コード docだから日本語」規約対象で、リリース前掃除が望ましいが機能影響なし。
W-E-5/6 は挙動仕様の判断待ちで、現状でも既定経路は正しく動く。

### 棄却できた失敗形状（重点観点 1・2 の SAFE 判定 — 明示）

- **検証は全経路で必ず 1 回走る（検証スキップ経路なし）**: `getDictionary` は
  `JtdDictionary.load(buffer, { verifyChecksums:false })`（mod.ts:170）を使うが、`buffer` は
  `fetchVerifiedBuffer`→`materialize`（mod.ts:88-92）を必ず通り、materialize は **キャッシュヒット経路
  （mod.ts:134）でも network 経路（mod.ts:147）でも** `verifyJtd` を無条件に呼ぶ。∴ `verifyChecksums:false`
  は二重検証の省略であって検証穴ではない。**holds**。
- **gzip 判定の偽陽性/偽陰性なし**: JTD1 magic は `fourCC("JTD1")`＝ファイル先頭バイトが `0x4A 0x54`（"JT"）。
  gzip magic は `0x1f 0x8b`。**衝突不能**＝正当な JTD1 が gzip 誤判定されることは原理的に無い（mod.ts:71）。
  gzip 先頭が壊れて `1f8b` を欠く場合は raw 扱い→`verifyJtd` が magic 不一致で throw（fail loud）。**holds**。
- **self-heal は 1 回限りの再取得（無限ループ無し）**: cache 破損→`materialize` throw→`cache.delete`
  （mod.ts:137）→fallthrough で network 取得 1 回。network も破損なら materialize が throw して伝播
  （キャッシュしない、mod.ts:147）。恒久破損でもループしない。**holds**。
- **Response body の二重消費/clone 漏れなし**: fetch Response は `arrayBuffer()` で 1 回だけ消費
  （mod.ts:146）。`materialize`/`gunzip` は `raw` を消費せず**新しい Response ラッパ**を作る（mod.ts:78,88）。
  cache.put は `new Response(raw)`（mod.ts:151）と別ラッパ。**holds**。
- **match→evict TOCTOU は安全**: 並行に valid を put した相手を delete しても、fallthrough で network から
  取り直して再 put＝真実源が勝つ。データ喪失なし（idempotent put）。**holds**。
- **release.yml 権限最小**: `id-token: write` は release.yml のみ（JSR OIDC 用）、ci.yml は
  `contents: read` のみ。verify_tag は VERSION==deno.jsonc（verify_tag.ts:21）＋tag prefix＋tag==version
  （release_tag.ts）の三重照合。**holds**。
- **`_dict_path.ts` の publish 除外は安全**: 非テストコードからの import ゼロ（rg 確認済み・import 元は
  4 つの *.test.ts のみ）。かつ Deno 専用 API（Deno.permissions/env/statSync）を使うため src/ の
  「ブラウザ標準のみ MUST」上も除外が正しい。**holds**。
- **`deno bump-version -c` は実在**（deno 2.8.3 で確認。`-c` は single-file mode 強制）。bump.ts の使用は正。

---

## ファイル別分類（全ファイル・漏れゼロ）

| # | ファイル | 分類 | 主な所見 |
|---|---------|------|---------|
| 1 | src/browser/mod.ts | 🟡 W | Cache 書込み失敗が load 全体を落とす(W-E-5) / 可変ref resolve失敗にオフライン退行なし(W-E-6) / resolve は SHA 形を検証せず(L-E-1) / cache.open 二重・verifyJtd 二重コピー(L-E-2) / 大文字SHA誤分類(L-E-3)。中核設計は堅牢（上記 SAFE 群） |
| 2 | src/browser/mod.test.ts | 🟡 W | caches 未定義(Worker/Deno)経路・resolve失敗・並行・quota のテスト不在(W-E-7)。モック忠実度に限界（下記） |
| 3 | scripts/bump.ts | 🟡 W | stale `ADR-0010`(W-E-1) / 部分失敗の非原子性(W-E-8) |
| 4 | scripts/verify_tag.ts | 🟡 W | stale `release-dict.yml`(W-E-3) / stale `loadDictionary`＋偽の根拠(W-E-4) |
| 5 | scripts/release_tag.ts | 🟡 W | stale `ADR-0010`(W-E-2)。判定ロジックは健全 |
| 6 | scripts/version_sync.test.ts | 🟡 W | stale `loadDictionary`＋「VERSION が辞書 URL を決める」偽の根拠(W-E-4) |
| 7 | scripts/release_tag.test.ts | 🔵 L | 4 ケースは妥当。境界（末尾空白・`v` 単体・大文字）未網羅(L-E-5) |
| 8 | scripts/config_version.ts | 🟢 S | JSONC 正パース・fail loud。version_sync 経由で間接被覆 |
| 9 | scripts/verify_jtd.ts | 🟢 S | magic+全CRC+サイズ下限で fail loud。良い |
| 10 | .github/workflows/ci.yml | 🔵 L | dict source を Actions Cache（key=fetch_dict.ts hash）。JTD1 は毎回再ビルド＝設計通り（L-E-5 情報） |
| 11 | .github/workflows/release.yml | 🔵 L | 権限最小・導線正。deno.lock 非コミット＋--no-lock ⇒ @std/jsonc 未ピン(L-E-4) |
| 12 | deno.jsonc | 🟢 S | exports 8 本実在・include/exclude 整合・`_dict_path` 除外安全（rg 確認） |

（src/constants.ts は D 班担当。bump.ts→constants.ts の regex 書換えの脆さは本 group で W-E-8/該当節に記載）

---

## Warning 以上の詳細

### W-E-1 — bump.ts:4 に存在しない `ADR-0010` 参照（stale・browser-tts 由来）
- **path:line**: `scripts/bump.ts:4`
- **症状**: `// tag / push はしない（オーナーが実施。ADR-0010: タグは v<version>）。` 本リポの
  `docs/decisions/` は 0001/0002/0003 のみで **0010 は存在しない**（`ls docs/decisions/` 確認）。
- **根本原因**: `../browser-tts` から切り出した際に comment の ADR 番号が旧リポのまま残った。
- **修正案**: ADR 番号を除去、または本リポの該当 ADR に付け替え。タグ規約（`v<version>`）は現状 ADR に
  未記載＝どの決定にも紐づかない prose。CLAUDE.md 上「traceable pointer 無しの `DECIDED:` は prose」に
  該当するので、必要なら 0002/0003 内に「タグは `v*`」を 1 行追記して参照させる。
- **追加テスト**: 不要（comment 修正）。任意で「ソース内 ADR 参照が実在 ADR に解決するか」を検査する
  dev スクリプトを足せば再発防止になる（横断所見に記載）。

### W-E-2 — release_tag.ts:3 にも `ADR-0010` 参照（第2の stale・タスク未指摘）
- **path:line**: `scripts/release_tag.ts:3`
- **症状**: `…タグ prefix は JSR 公開と独立（ADR-0010: tag v*）。` W-E-1 と同一の存在しない ADR 参照。
  タスクは bump.ts:4 のみを既知として挙げたが、**同じ stale が release_tag.ts にも複製**されている。
- **根本原因**: 同上（browser-tts 由来のコピー）。
- **修正案**: W-E-1 と同時に除去/付け替え。

### W-E-3 — verify_tag.ts:5 が削除済み `release-dict.yml` を参照（stale・誤誘導）
- **path:line**: `scripts/verify_tag.ts:5`
- **症状**: `//   release-dict.yml は stdout（bare version）を受けてアセット名 naist-jdic-<version>.jtd に
  無変換で使う。` `release-dict.yml` は **ADR-0003 で削除済み**（git 履歴に存在: cf5a7b5 で HF 移行、
  現在 `.github/workflows/` は ci.yml と release.yml のみ）。version 付きアセット名
  `naist-jdic-<version>.jtd` の運用も**廃止**（辞書は HF・`DICT_REVISION` ピン）。
- **根本原因**: HF 配布移行（ADR-0003）時に verify_tag の doc comment が更新されなかった。
- **影響**: `verify_tag.ts` の stdout（bare version）は現在 release.yml から**消費されていない**
  （release.yml:29-32 は verify のみで stdout を使わない）。この comment は存在しないコンシューマを
  説明しており、将来の読者に「アセット生成がある」と誤解させる。
- **修正案**: 「stdout は bare version（現状コンシューマ無し・診断/将来用）」に更新するか、削除。
  併せて stdout 出力（verify_tag.ts:32 `console.log`）が真に必要か再検討（現状 release.yml は
  exit code のみ利用）。
- **追加テスト**: 不要。

### W-E-4 — `loadDictionary`＋「VERSION が既定辞書 URL を決める」偽の根拠（stale・要注意）
- **path:line**: `scripts/verify_tag.ts:19` / `scripts/version_sync.test.ts:5`
- **症状**:
  - verify_tag.ts:19 `// 公開 VERSION（loadDictionary の既定辞書 URL や `.` export が使う）…`
  - version_sync.test.ts:5 `// （loadDictionary の既定辞書 URL や公開 VERSION が実バージョンとズレるのを防ぐ）。`
  `loadDictionary` は **`getDictionary` に改名済み**（git c042dbd）。さらに深刻なのは、両 comment が
  **「VERSION が既定辞書 URL を決める」と述べる**点。ADR-0003 で既定辞書 URL は `DICT_URL` +
  `DICT_REVISION`（HF コミット SHA）にピンされ、**パッケージ VERSION と完全に独立**した
  （constants.ts:11-26・ADR-0003 決定 2）。つまり**この根拠は現在偽**。
- **根本原因**: 辞書 URL の版依存廃止（ADR-0003）後に、version-sync ガードの「なぜ」comment が旧設計
  （版依存 URL）のまま残った。
- **効力/リスク**: version-sync ガード**自体は依然妥当**（VERSION は JSR publish 版として deno.jsonc と
  一致すべき）。壊れているのは**理由**。CLAUDE.md「recommendation が実装挙動でなく設計に依るとき、
  根拠が偽なら誤誘導」。将来の読者が「VERSION↔辞書 URL 結合」を前提に判断を誤る恐れ。
- **修正案**: 両 comment の根拠を「公開 `.` の `VERSION` re-export が JSR publish 版（deno.jsonc）と
  drift しないことを保証する（辞書 URL とは無関係＝ADR-0003 で分離）」に修正。`loadDictionary`→
  `getDictionary`。
- **追加テスト**: 不要（rationale 修正）。ガードのテストは version_sync.test.ts で既に成立。

### W-E-5 — Cache 書込み失敗が、辞書取得・検証成功後でも load 全体を throw（要人間判断・blast radius 大）
- **path:line**: `src/browser/mod.ts:151`（`await cache.put`）／同 :137（self-heal `cache.delete`）
  ／:129,:150（`caches.open`）
- **症状**: network 取得＋`materialize`（解凍＋CRC 検証）が成功して `buffer` が手元にあっても、直後の
  `await cache.put(requestUrl, new Response(raw))`（:151）が **QuotaExceededError / SecurityError で
  reject すると `fetchVerifiedBuffer` 全体が throw** し、`getDictionary` が失敗する。キャッシュは
  最適化（次回 network 省略）に過ぎないのに、**書込み失敗が「辞書が取れた」を「辞書ゼロ」に変える**。
- **根本原因**: cache 書込みを best-effort と扱わず、致命エラーと同じ経路で伝播させている。`cache.delete`
  （:137）・`caches.open`（:129,:150）も同様に throw が伝播しうる。
- **blast radius**: storage 満杯・ブラウザの storage 制限・Safari private mode 等で `put` が reject する
  実ユーザ層が、**6.4MB の DL に成功していても辞書を得られない**（＝TTS 不能）。低頻度だが影響は機能全損。
- **設計上の緊張**: プロジェクトは fail-loud 方針だが、これは「破損データを黙認」ではなく「任意の最適化の
  失敗」。CRC 不一致（データ破損＝真に loud にすべき）とは質が違う。**無言の swallow は禁止**（規約）だが、
  ここは「キャッシュは best-effort、失敗しても検証済み buffer を返す（＋任意で `console.warn` 告知）」が
  root-cause 的に妥当な可能性が高い。
- **修正案（要判断・needs-human）**: 構造化選択で提示 →
  ①**best-effort+告知（推奨）**: `cache.put`/`delete`/`open` を try/catch し、失敗時は `console.warn` で
  一度だけ告知して検証済み `buffer` を返す（黙って握り潰さない）。
  ②**現状維持（無条件 fail-loud）**: cache 書込み不能環境は明示エラーとする（ただし NOTE の
  「非対応環境は fetch のみで取得しキャッシュはスキップ」＝mod.ts:164-166 と**挙動が矛盾**する点は要修正）。
  → JSDoc の NOTE（:164-166）は「Cache 非対応環境では fetch のみでキャッシュをスキップ」と謳うが、
  現コードは「`caches` が**未定義**なら skip」だけで、「`caches` は在るが `open`/`put` が**失敗**」する
  ケースは skip せず throw する。**doc と実装の乖離**。①なら乖離解消、②なら NOTE を実態に合わせて修正。
- **追加テスト**: `cache.put` が reject するモックで「検証済み bytes は返る（①）／throw する（②）」を固定。
  `caches.open` reject 時も同様。（現状テストは put 成功しか通らない。）
- **確証度**: cache 書込み失敗が throw を伝播すること自体は**コード上確実**。best-effort にすべきか否かは
  **needs-human（設計判断）**。

### W-E-6 — 可変 ref の resolve 失敗にオフライン・フォールバックが無い（要人間判断）
- **path:line**: `src/browser/mod.ts:121-123`（resolve 呼出）＋`98-108`（`resolveRevision`）
- **症状**: `revision: "main"`（＋既定 host）では、まず `resolveRevision` が HF API を叩く（:99）。
  **オフライン/HF 障害で fetch が reject** すると `fetchVerifiedBuffer` は **cache を一切見る前に throw**。
  過去に `main`→SHA を解決して**有効な SHA 固定キャッシュが残っていても**、それを返せない。
- **根本原因**: 「resolve 成功」が辞書取得の前提条件になっており、resolve 失敗時に last-known SHA へ
  degrade する経路が無い。
- **対比（重要）**: **既定（不変 SHA）経路は本問題の影響を受けない** — resolve を通らず、初回 DL 後は
  cache ヒットで**オフライン動作する**。退行するのは可変 ref 経路のみ。
- **設計判断**: `main`＝「常に最新」の意味論なら「最新を確認できない＝fail loud」は一貫している。しかし
  「オフラインでも直近の辞書で動きたい」ニーズがあるなら、resolve 失敗時に「同一 cacheName 内の
  最後に解決した SHA の cache があればそれで動く」フォールバックが要る。**要判断（needs-human）**。
- **修正案**: 採用するなら、resolve の catch で「cacheName を走査し、DICT_URL パターンに一致する
  cache 済み SHA-URL があれば materialize して返す（無ければ元の throw）」。ただし「どの SHA が最新
  だったか」の記録が無いと任意の古い cache を選ぶ曖昧さが出る＝別途 last-resolved-SHA の記録設計が必要。
  複雑化するため、まず**意図の確認**を推奨。
- **追加テスト**: resolve 用 fetch のみ reject するモックで、cache 有り/無しの両ケースの挙動を固定。
- **確証度**: 「resolve 失敗で cache を見ずに throw」は**コード上確実**。フォールバックの要否は needs-human。

### W-E-7 — mod.test.ts: 文書化済みフォールバック経路・並行・quota のテスト不在
- **path:line**: `src/browser/mod.test.ts`（ファイル全体・13 件）
- **症状**: 現行 13 件は verify（3）・fetch 経路（default/immutable/url-override/gzip/cache-hit/main-resolve/
  self-heal/http-error/network-corrupt）（9）・実辞書 getDictionary（1・辞書無しは ignore）を縛るが、
  以下が**未被覆**:
  - **`caches` 未定義（Worker/Deno）→ fetch-only 経路**（JSDoc:164-166 で明記の**サポート経路**）。
    モックは常に `caches` を定義するため（test:108-112）、`typeof caches === "undefined"` 分岐が
    一度も実行されない。
  - **`resolveRevision` 失敗の伝播**（W-E-6）。
  - **cache 書込み失敗（quota/SecurityError）**（W-E-5）。
  - **同一ページからの並行 `getDictionary`×2**（二重 DL 許容/last-write-wins の固定）。
- **重大度**: 「caches 未定義経路」の不在が最も重い＝**ドキュメント済みの主要フォールバックがテストで
  縛られていない**（回帰で黙って壊れても検知できない）。W-E-5/6 は挙動判断が済めば同時にテスト追加すべき。
- **モック忠実度の限界（実 Cache API との意味差）**:
  - `cache.match` が `new Response(hit)` を返す（test:98-101）＝実 API は毎回 clone を返す点は模せている
    が、**Request の正規化（URL 完全一致以外の vary/query 差）を模さない**（本コードは文字列 URL 完全一致
    のみなので実害小）。
  - **quota・secure-context gating・書込み reject を一切模さない**（W-E-5 の穴の温床）。
  - put が `await res.arrayBuffer()`（test:103）で消費＝実 API 準拠。忠実。
  - **既定 `revisionSha: ""`（test:119）が footgun**: revisionSha 未指定で `revision:"main"` を渡すと
    resolve が `""` を返し、`isImmutableRevision("")===false`→キャッシュ無効＋URL が
    `…/resolve//naist-jdic.jtd.gz`（二重スラッシュ）になる。現行テストは該当しないが、将来テストの罠。
- **追加テスト（推奨）**:
  1. `caches` を undefined にして fetch-only（キャッシュ非使用でも辞書が返る）を固定。
  2. resolve 用 fetch だけ reject → W-E-6 の決着に沿って throw/フォールバックを固定。
  3. `cache.put` reject → W-E-5 の決着に沿って固定。
  4. 並行 `getDictionary`×2 → 二重 DL される（or single-flight 導入後は 1 回）ことを固定。

### W-E-8 — bump.ts: 部分失敗時の非原子性（deno.jsonc 先行更新後の regex miss で half-bump が残る）
- **path:line**: `scripts/bump.ts:58`（deno.jsonc 更新）→ `71-80`（constants.ts regex 更新）→ `83-89`（commit）
- **症状**: 実行順は ①`deno bump-version -c ./deno.jsonc`（**deno.jsonc を書換え**, :58）→
  ②constants.ts の `VERSION` を regex 置換（:72-75）→ regex miss なら exit 1（:76-79）→ ③2 ファイルを
  commit（:83-89）。②で regex が当たらない（例: 手動編集で VERSION 行が改変されていた）と、**deno.jsonc は
  既に bump 済み・constants.ts は旧版・commit 無し**の**half-bump 状態**で working tree に残る。ロールバック
  処理が無い。
- **根本原因**: 「先に真実源(deno.jsonc)を書換えてから焼き込みコピーを更新」する順序で、後段失敗時の
  補償（deno.jsonc の revert）が無い。開始時の clean-tree ガード（:37-54）は**開始前**の保証で、途中失敗は
  カバーしない。
- **blast radius**: **小**。未コミット＝`git checkout deno.jsonc` で回復可能。かつ次回 bump の clean-tree
  ガードが drift を検知して**先に進めない**（fail loud）し、version_sync.test も CI で drift を捕まえる。
  ∴ リリースに漏れる恐れは低い。ただし「bump が中途半端に成功した」状態はユーザに不親切。
- **修正案（低優先）**: ②の regex 置換を**①より前に「乾式計算」**しておき（新版は
  `deno bump-version --dry-run` で先取り or semver 計算）、両ファイル**書込みを揃えてから**実行する。
  最小対応なら、②失敗時の exit 前に deno.jsonc を `git checkout -- deno.jsonc` で戻す補償を足す
  （ただし「元が本当に clean だった」前提は開始ガードで担保済み）。
- **追加テスト**: bump.ts は Deno.Command でサブプロセス起動＝純関数化しにくい。regex 置換部分
  （「VERSION 行を新版に置換し、無ければ throw」）を純関数に切り出せば、置換ロジックの単体テストは可能。
- **確証度**: 順序と補償欠如は**コード上確実**。blast radius 小のため W（Error ではない）。

---

## Low / 情報

### L-E-1 — resolveRevision が SHA 形を検証しない（malformed resolve でキャッシュ最適化が黙って無効化）
- **path:line**: `src/browser/mod.ts:98-108`
- `resolveRevision` は `typeof info.sha === "string"`（:104）のみ検査し、**40-hex SHA 形は検証しない**。
  HF が短縮 SHA / branch 名 / 空文字を返すと、`isImmutableRevision(resolved)===false`→
  `useCache=false`（:126）＝**再 DL 回避という resolve の存在意義が黙って無効化**され、`main` の度に
  6.4MB を DL し続ける（機能は動くが最適化が消える）。空文字なら URL が二重スラッシュになる。
- **修正案**: resolve 応答を `isImmutableRevision` で検証し、不正なら throw（fail loud）。少なくとも
  「resolve 結果が不変 SHA でなければキャッシュ不能＝設計前提破れ」を明示。

### L-E-2 — 微小な非効率（cache.open 二重・verifyJtd の 19MB 防御コピー）
- **path:line**: `src/browser/mod.ts:129 & 150`（`caches.open` を match 用と put 用で 2 回）／`mod.ts:50`
  （`verifyJtd` が `new Uint8Array(bytes)` で全体コピー）
- caches.open は idempotent で安価なので実害はほぼ無いが、1 回に纏められる。`verifyJtd` の防御コピー
  （:50, SharedArrayBuffer 対策）は**ホット load 経路で 19MB の一時確保**を生む（materialize は既に
  専用 ArrayBuffer を渡すので、この経路では不要なコピー）。公開 API として SAB 入力を守る意図は妥当だが、
  内部 load 経路では `ArrayBuffer.isView`/`instanceof SharedArrayBuffer` で分岐すればコピー回避可能。低優先。

### L-E-3 — isImmutableRevision が大文字 hex SHA を可変扱い
- **path:line**: `src/browser/mod.ts:74`（`/^[0-9a-f]{40}$/`）
- 大文字の 40-hex SHA は「可変」判定され不要な resolve API を叩く（git SHA は慣習上小文字なので実害小）。
  逆に 40 文字の全 hex ブランチ名（非現実的）は不変誤判定。仕様上は現状で十分だが、意図（小文字限定）を
  JSDoc に明記推奨。

### L-E-4 — deno.lock 非コミット＋--no-lock で @std/jsonc が未ピン（dev-only 供給網）
- **path:line**: `.github/workflows/release.yml:32`（`--no-lock`）／`scripts/config_version.ts:7`
  （`import { parse } from "@std/jsonc"`）／deno.jsonc:33（`jsr:@std/jsonc@^1.0.2`）
- deno.lock は gitignore 済み（config_version.ts の NOTE）＋release/bump は `--no-lock`＝**@std/jsonc は
  `^1.0.2` の範囲で毎回解決**（ピン無し）。scripts/ は dev/CI 用で src/ の依存ゼロ MUST 対象外なので方針違反
  ではないが、release job が公開直前に走る文脈で外部 jsr を未ピン解決する点は供給網上の低リスク。
  `--no-lock` の理由（jsr import が deno.lock を書いて publish を dirty にするのを防ぐ）は妥当。
  代替: verify_tag を jsonc 非依存（config_version を使わず、verify_tag は deno.jsonc を読まず src の
  VERSION と tag のみ照合）にすれば release 経路から jsr 依存を外せる。低優先・要判断。

### L-E-5 — CI 辞書キャッシュは設計通り（情報）／release_tag.test の境界未網羅
- **path:line**: `.github/workflows/ci.yml:29-40`／`scripts/release_tag.test.ts`
- ci.yml は naist-jdic **ソース**を Actions Cache（key=`fetch_dict.ts` の hash＝SHA-256 pin 変更で失効）
  に保存し、`deno task build-dict` で **JTD1 は毎回再ビルド**。「ソースだけ cache・JTD1 は決定的再生成」の
  分割は妥当（欠陥ではない・情報）。`restore-keys` 無し＝exact-match のみ＝pin 変更で full miss は意図通り。
  release_tag.test.ts は 4 ケース良好だが、`checkReleaseTag("v", "0.1.0")`（bare 空）・末尾空白
  `"v0.1.0 "`・`"vv0.1.0"` の境界が未網羅。低優先の網羅性向上余地。

---

## getDictionary — 取得 / キャッシュ / 検証フロー（分岐と失敗パス・実行番号併記）

```
getDictionary(opts) / fetchDictionaryBytes(opts)
  └─(1) fetchVerifiedBuffer(opts)                                    [mod.ts:116]
        │
        ├─(2) rawRevision = opts.revision ?? DICT_REVISION           [:117]
        │
        ├─(3) revision 決定:                                          [:121-123]
        │       opts.url 未指定 かつ rawRevision が可変(非40hex)?
        │        ├─ YES → resolveRevision(rawRevision)  ── HF API GET [:99]
        │        │          ├─ fetch reject/!ok/sha無し ─▶ **throw**  [:100-106]  ★F1
        │        │          │      （cache は一切見ない＝オフライン退行 / W-E-6）
        │        │          └─ OK → revision = sha
        │        └─ NO  → revision = rawRevision（SHA/url上書き）
        │
        ├─(4) requestUrl = (opts.url ?? DICT_URL).replace({revision}) [:124]
        ├─(5) useCache = (typeof caches!=="undefined") && 40hex(rev)  [:126]
        │        ├─ caches 未定義（Worker/Deno/非secure）→ useCache=false
        │        │     （テスト不在 / W-E-7）
        │        └─ 可変 ref を url 上書きで渡した場合も false
        │
        ├─(6) if useCache:                                            [:128-140]
        │        caches.open ─(open reject ─▶ **throw** ★F2 / W-E-5)  [:129]
        │        cache.match(requestUrl)                              [:130]
        │         └─ HIT:
        │             raw = cached.arrayBuffer()                      [:132]
        │             materialize(raw):                              [:88]
        │               ├ isGzip(1f8b)? → gunzip → verifyJtd          [:89-90]
        │               │    gzip 破損 ─▶ throw（下の catch へ）
        │               ├ 非gzip → verifyJtd(raw)                      [:90]
        │               │    magic/CRC 破損 ─▶ throw（下の catch へ）
        │               └ OK → **return buffer**  ✅（検証1回・完了）  [:91,134]
        │             catch（破損/解凍失敗）:                          [:135-138]
        │               cache.delete(requestUrl)（self-heal・1回のみ） [:137]
        │                 └(delete reject ─▶ throw ★F3 / W-E-5)
        │               → fallthrough（network へ）
        │
        ├─(7) response = fetch(requestUrl)                            [:142]
        │        └─ !response.ok ─▶ **throw** HTTP error（fail loud）  [:143-145]  ★F4
        │
        ├─(8) raw = response.arrayBuffer()（body 1回消費）             [:146]
        ├─(9) buffer = materialize(raw)  ← 検証（gzip自動判定+CRC）      [:147]
        │        └─ 破損/解凍失敗 ─▶ **throw**（キャッシュしない）      ★F5（network破損は保存しない）
        │
        ├─(10) if useCache:                                           [:149-152]
        │         caches.open（★F2 同様 reject 可）                    [:150]
        │         cache.put(requestUrl, new Response(raw))            [:151]
        │           └─ quota/Security reject ─▶ **throw**              ★F6 / W-E-5
        │                （辞書は検証済み・手元にあるのに load 全体が失敗）
        │
        └─(11) return buffer                                          [:153]
                 │
   getDictionary ┴→(12) JtdDictionary.load(buffer,{verifyChecksums:false}) [:170]
                        （検証は(6)/(9)で必ず済＝二重検証を省くだけ・穴なし）

  失敗パス凡例:
    ★F1 resolve 失敗（オフライン/HF障害）＝cache 見ずに throw（W-E-6・要判断）
    ★F2/F3/F6 Cache 操作失敗（open/delete/put）＝辞書取得成功でも throw（W-E-5・要判断）
    ★F4 HTTP !ok ＝fail loud（正しい）
    ★F5 network データ破損 ＝throw・非キャッシュ（正しい・self-heal は無限ループしない）
  正常完了 ✅: (6)cacheヒット or (9)network、どちらでも materialize で必ず 1 回検証してから返す
```

---

## 横断所見

1. **stale 参照の一掃を 1 コミットで**（W-E-1〜4）。`ADR-0010`×2・`release-dict.yml`・`loadDictionary`×2
   は全て browser-tts→yomi 切り出し / HF 移行 / 改名の**取り残し**。CLAUDE.md「comments explain WHY／
   untraceable historical references を残さない」に直接該当。特に W-E-4 は**根拠が現在偽**で誤誘導リスク。
   **再発防止**: dev スクリプトで「ソース comment 内の `ADR-\d+` が `docs/decisions/` に実在するか」
   「参照シンボル名が export に実在するか」を CI で軽く検査すると、切り出し系リポで有効
   （提案・要判断）。

2. **ローダの「キャッシュは best-effort か fail-loud か」を明示決定**（W-E-5/6 の根）。現状はキャッシュ
   read（materialize 失敗→self-heal）は best-effort だが、**cache write（put/delete/open）と resolve は
   fail-loud**で、この非対称が JSDoc の NOTE（「非対応環境は fetch のみでキャッシュ skip」）と齟齬。
   一貫方針（推奨: read/write とも best-effort＋告知、データ破損のみ loud）を ADR-0003 に 1 行追記して
   実装と doc を揃えると、W-E-5/6/7 が同時に片付く。

3. **検証の網羅は良好・穴なし**（重点観点 2 の結論）。`verifyJtd` の CRC 検証は全経路（cache hit / network）
   で materialize 経由で必ず走り、`JtdDictionary.load({verifyChecksums:false})` は二重検証の省略に留まる。
   gzip magic と JTD1 magic は衝突不能。**検証スキップ経路は存在しない**。残る改善はテスト側（W-E-7）。

4. **リリース基盤は堅牢**。release.yml 最小権限（id-token:write は release のみ）・verify_tag 三重照合・
   `deno bump-version -c`（実在確認済み）・bump.ts clean-tree ガードは良い設計。唯一 bump.ts の
   部分失敗非原子性（W-E-8）が残るが未コミット＝回復可能で blast radius 小。

5. **publish 整合は健全**。exports 8 本すべて実在、include（src/・deno.jsonc・README・LICENSE・NOTICE）
   実在、exclude の `_dict_path.ts` は非テストから import ゼロ＋Deno 専用 API 使用のため除外が二重に正しい。
   v0.2.0 の JSR publish を壊す要素は本 group に無し。

（本レビューはコードを一切変更していない。全指摘は path:line 付き。W-E-5/6 の「best-effort 化すべきか」・
W-E-6 の「オフライン・フォールバック要否」・W-E-8 の「補償追加要否」・横断 1/2/4 の再発防止策採否は
needs-human＝オーナー判断。）
