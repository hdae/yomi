# ADR-0004: 辞書ソースは jpreprocess/naist-jdic v0.1.3 に固定・リポジトリ非同梱

状態: 採択（切り出し元 browser-tts の ADR-0003 を yomi へ移入。番号は本リポの採番に合わせ 0004）。
関連: [0003-dict-distribution.md](0003-dict-distribution.md)（こちらは**生成物 JTD1 の配布**。本 ADR は**ソース CSV の取得**で別問題）。

## 文脈

アクセント型（col14）・結合規則（col15）列を含む naist-jdic ソース CSV の現実的な入手元は
GitHub jpreprocess/naist-jdic のみ（BSD-3-Clause × 4著作権者、再配布可・表示義務あり）。
CSV + matrix.def で生 76MiB とリポジトリ同梱には大きい。ビルド（dict-builder）は開発時と CI
でのみ走るため、ソースは都度取得でよいが、supply-chain と再現性の担保が要る。

## 決定

- ソースは jpreprocess/naist-jdic の **tag v0.1.3** に固定し、`dict-builder/src/fetch_dict.ts` が
  **tarball と必要ファイル各々の SHA-256 ピン**を検証して `data/naist-jdic/` に展開する
  （リポジトリにはコミットしない）。不一致は上流の改竄・破損として fail loudly。
- 初期スコープは naist-jdic.csv（486,751語・15列）+ matrix.def + char.def + unk.def + COPYING。
  unidic-csj.csv 等はスコープ外。
- COPYING の4著作権者表示を JTD1 バイナリの META セクションに必ず埋め込む。
- CI は展開済みソースを Actions Cache（key = fetch_dict.ts のハッシュ）に保存する。ピンを
  変えればキーが変わり自動失効。キャッシュヒット時も fetch_dict が checksum を再検証する。

## 帰結

- ビルド再現性はタグ＋チェックサムで担保。改版（pyopenjtalk-plus 化など）はピンの更新と
  本 ADR の改訂（または後続 ADR）をセットで行う。
- 辞書ソースの固定（本 ADR）と生成物の配布先・リビジョン固定（ADR-0003）は独立に更新できる。
