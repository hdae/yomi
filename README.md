# @hdae/yomi

ブラウザ上で完全ローカル動作する、**純 TypeScript の日本語 TTS テキストフロントエンド（G2P）**。
テキストを **読み・アクセント（ピッチ核位置）・アクセント句境界** に変換します。

- **実行時依存ゼロ**（MUST）。ブラウザ / Deno / Node / Workers で同一動作。
- OpenJTalk 系の解析結果と互換になるよう設計（naist-jdic 辞書・lindera 互換の分かち書き・jpreprocess 互換の NJD 後段）。
- 既存のブラウザ向け TTS が持っていない「日本語のアクセント付き G2P」を、外部プロセス・WASM・GPL 依存なしで提供します。

## インストール

```sh
deno add jsr:@hdae/yomi
```

## 使い方

辞書 `naist-jdic.jtd`（JTD1 バイナリ）は本パッケージには同梱せず、GitHub Release アセットとして配布します。
ブラウザではキャッシュヘルパで取得します（後述）。

```ts
import { analyze, JtdDictionary } from "@hdae/yomi";
import { loadDictionary } from "@hdae/yomi/browser";

// 1) 辞書を取得。引数なしで、このパッケージ版に対応する辞書を GitHub Release から取得する
//    （Cache API にキャッシュ・整合性検証つき）。
const bytes = await loadDictionary();
const dict = JtdDictionary.load(bytes.buffer);

// 2) テキスト → 読み + アクセント + 句境界。
const result = analyze(dict, "こんにちは、今日はいい天気ですね。");
for (const phrase of result.accentPhrases) {
  console.log(phrase.moras.map((m) => m.kana).join(""), "核:", phrase.accentNucleus, phrase.pauseAfter);
}
```

### Deno / サーバで（ローカルの辞書ファイルを使う）

```ts
import { analyze, JtdDictionary } from "@hdae/yomi";

const dict = JtdDictionary.load((await Deno.readFile("naist-jdic.jtd")).buffer);
console.log(analyze(dict, "音声合成のテストを行います。"));
```

### Style-Bert-VITS2 用のアダプタ（任意）

コア（`@hdae/yomi`）はモデル非依存です。SBV2 の `given_phone` / `given_tone` 規約への変換は
サブパス `@hdae/yomi/sbv2` に分離しています（将来 `@hdae/yomi/<model>` を並列に追加可能）。

```ts
import { toSbv2PhoneTone } from "@hdae/yomi/sbv2";
const { phones, tones } = toSbv2PhoneTone(result);
```

## 辞書の配布とキャッシュ

`@hdae/yomi/browser` の `loadDictionary` は辞書を **Cache API** に保存し、取得したバイト列を JTD1 の magic と
セクション CRC で整合性検証します（破損は throw＝fail loud）。破損キャッシュは真実源（network）から取り直します
（self-heal）。

**既定では、このパッケージ自身のバージョンに対応する辞書**を取得します（バージョンを焼き込み済み＝コードと
辞書の版が常に一致し再現性が保たれる）。バージョン固定＝不変なので、次回以降はネットワークなしでキャッシュから返します。

```ts
// 既定: 自身の版の辞書（推奨）
const bytes = await loadDictionary();

// 明示的にバージョンや取得元を指定したい場合（mirror / 自ホスト等）
const other = await loadDictionary({
  version: "0.1.0", // 既定 = パッケージ自身の版
  url: "https://github.com/hdae/yomi/releases/download/v{version}/naist-jdic-{version}.jtd", // 既定 = 同左
});
```

辞書はリリースごとに naist-jdic から再生成され、GitHub Release に `naist-jdic-<version>.jtd` として添付されます
（BSD-3-Clause）。

## ライセンス

- **コード: MIT**（`LICENSE`）。
- **辞書データ (naist-jdic): BSD-3-Clause**（`NOTICE`。JTD1 の META セクションに COPYING を埋め込み済み）。

## 謝辞 / Acknowledgements

本プロジェクトは、日本語音声合成のための先行研究・データに深く依存しています。感謝します。

- **[Open JTalk](https://open-jtalk.sourceforge.net/)** — 日本語 TTS フロントエンド（NJD のアクセント結合規則など、
  本実装のアクセント処理の源流）。
- **naist-jdic** — 本パッケージが用いる日本語辞書データ（BSD-3-Clause, Nara Institute of Science and Technology ほか）。
  配布時は BSD-3-Clause の帰属表示を伴います（`NOTICE`）。
- **[jpreprocess](https://github.com/jpreprocess/jpreprocess)** — OpenJTalk 後段（NJD）の Rust 実装。読み・アクセントの
  移植と検証で主に参照しました。
- **[Lindera](https://github.com/lindera/lindera)** — 形態素解析器。分かち書き（ラティス・未知語生成・連接コスト）を
  互換実装する際に参照しました。
- **[MeCab](https://taku910.github.io/mecab/)** — 形態素解析の基盤（naist-jdic のフォーマット等）。
- **[pyopenjtalk](https://github.com/r9y9/pyopenjtalk) / pyopenjtalk-plus** — 品質検証用のゴールデンデータ作成に使用。
