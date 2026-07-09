# @hdae/yomi

A pure-TypeScript Japanese TTS text frontend (G2P) that runs fully local in the
browser.

ブラウザ上で完全ローカル動作する、純 TypeScript の日本語 TTS テキストフロントエンド（G2P）。
テキストを **読み・アクセント（ピッチ核位置）・アクセント句境界** に変換します。

## 特徴

- **アクセント付き G2P**: 読み・アクセント核位置・アクセント句境界・ポーズを出力。ブラウザ向け
  TTS に不足していた「日本語のアクセント付き G2P」を提供します
- **実行時依存ゼロ**: ブラウザ / Deno / Node / Workers で同一に動作。外部プロセス・WASM・GPL 依存なし
- **OpenJTalk 系互換**: naist-jdic 辞書・lindera 互換の分かち書き・jpreprocess 互換の NJD アクセント後段
- **モデル非依存**: 読み・モーラ・音素・モーラ毎のトーンを中立な形で出力。モデル固有の音素・トーン形式への
  変換（PAD トークン・トーン規約など）は呼び出し側で行います
- **辞書キャッシュ**: `@hdae/yomi/browser` が Cache API に辞書をキャッシュし、magic + CRC で整合性検証
  （破損は fail loud、破損キャッシュは真実源から取り直す self-heal）

## インストール

```sh
deno add jsr:@hdae/yomi
```

## クイックスタート

```typescript
import { analyze } from "@hdae/yomi";
import { getDictionary } from "@hdae/yomi/browser";

// 既定の辞書を取得（Cache API にキャッシュ・整合性検証つき）。
const dict = await getDictionary();

// テキスト → 読み + アクセント + 句境界。
const result = analyze(dict, "こんにちは、今日はいい天気ですね。");
for (const phrase of result.accentPhrases) {
  console.log(
    phrase.moras.map((m) => m.kana).join(""),
    "核:",
    phrase.accentNucleus,
    phrase.pauseAfter,
  );
}
```

## 使い方

### Deno / サーバ（ローカルの辞書ファイルを使う）

```typescript
import { analyze, JtdDictionary } from "@hdae/yomi";

const dict = JtdDictionary.load((await Deno.readFile("naist-jdic.jtd")).buffer);
console.log(analyze(dict, "音声合成のテストを行います。"));
```

### モデルアダプタ

`@hdae/yomi` はモデル非依存です。読み・モーラ・音素（`moraToPhones`）・モーラ毎のトーン
（`moraTones`）・語/音素アライメント（`wordPhoneAlignment`）・ポーズ記号（`pausePunct`）を出力するので、
特定モデルの音素/トーン形式（PAD トークン・トーン規約など）は、これらを組み合わせて呼び出し側で構築します。

### JTD1 コーデック（辞書ツール向け）

辞書のビルド・検査を行うツールは、低レベルの JTD1 コーデック層を `@hdae/yomi/format` から利用できます
（レイアウト定数・`JtdContainer`・`crc32` など）。G2P を使うだけなら不要です。

## 辞書の配布とキャッシュ

辞書はパッケージに同梱せず、実行時に取得します。既定の取得元は **Hugging Face**（`hdae/yomi-dict`
dataset。GitHub の CORS 制約を避けるため）で、**gzip 版**（~6.4MB）を取得し `DecompressionStream` で
解凍します。`@hdae/yomi/browser` の `getDictionary` は取得結果を **Cache API** に保存し、解凍後のバイト列を
JTD1 の magic とセクション CRC で整合性検証してから `JtdDictionary` を返します（破損は throw＝fail loud）。
破損・解凍失敗キャッシュは真実源（network）から取り直します（self-heal）。

辞書はパッケージ版とは独立に更新されるため、既定の取得は**辞書リポジトリの特定コミット**に固定しています
（そのコミット SHA をコードに埋め込んでいます）。コミットで固定していれば内容が変わらないので、安全にキャッシュ
できます。用途に応じて `revision`（取得するコミット）や `url`（取得元）を指定できます。

```typescript
import { fetchDictionaryBytes, getDictionary } from "@hdae/yomi/browser";

// 既定: 埋め込んだコミットの辞書を取得（推奨。JtdDictionary が返り、キャッシュされる）
const dict = await getDictionary();

// 特定のコミットに固定して取得（40 桁の SHA はキャッシュ対象）
const pinned = await getDictionary({ revision: "<40 桁のコミット SHA>" });

// 常に最新を取得（"main" などの可変 ref はキャッシュせず、毎回取得し直す）
const latest = await getDictionary({ revision: "main" });

// 取得元だけ差し替える（ミラー・自ホスト等。{revision} は取得時に置換される）
const mirrored = await getDictionary({
  url: "https://example.com/naist-jdic-{revision}.jtd.gz",
});

// 生のバイト列が必要な場合（Worker への転送・独自キャッシュ等）は fetchDictionaryBytes
// （解凍・検証済みの JTD1。JtdDictionary.load にそのまま渡せる）
const bytes = await fetchDictionaryBytes();
```

## ライセンス

- **コード: MIT**（`LICENSE`）。
- **辞書データ (naist-jdic): BSD-3-Clause**（`NOTICE`。COPYING 全文は JTD1 の META セクションに埋め込み済み）。

## 謝辞 / Acknowledgements

本プロジェクトは、日本語音声合成のための先行研究・データに深く依存しています。感謝します。

- **[Open JTalk](https://open-jtalk.sourceforge.net/)** — 日本語 TTS フロントエンド（NJD のアクセント
  結合規則など、本実装のアクセント処理の源流）。
- **naist-jdic** — 本パッケージが用いる日本語辞書データ（BSD-3-Clause, Nara Institute of Science and
  Technology ほか）。再配布時は BSD-3-Clause の帰属表示を伴います（`NOTICE`）。
- **[jpreprocess](https://github.com/jpreprocess/jpreprocess)** — OpenJTalk 後段（NJD）の Rust 実装。
  読み・アクセントの移植と検証で主に参照しました。
- **[Lindera](https://github.com/lindera/lindera)** — 形態素解析器。分かち書き（ラティス・未知語生成・
  連接コスト）を互換実装する際に参照しました。
- **[MeCab](https://taku910.github.io/mecab/)** — 形態素解析の基盤（naist-jdic のフォーマット等）。
- **[pyopenjtalk](https://github.com/r9y9/pyopenjtalk) /
  [pyopenjtalk-plus](https://github.com/tsukumijima/pyopenjtalk-plus)** — 品質検証用のゴールデンデータ
  作成に使用。
