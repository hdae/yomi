# ADR-0001: yomi は中立な G2P 建材のみを提供し、モデル固有アダプタは持たない

状態: 採択（2026-07-09、オーナー承認）
関連: browser-tts ADR-0010（`/sbv2` サブパス分離）の該当部を上書きする。

## 文脈

`@hdae/yomi` はモデル非依存の日本語 G2P（テキスト → 読み・アクセント・句境界）。切り出し
当初は Style-Bert-VITS2 変換を `@hdae/yomi/sbv2` サブパス（`toSbv2PhoneTone`）に分離して
同梱していた（browser-tts ADR-0010）。しかし「yomi が特定モデル（SBV2）の音素・トーン梱包
規約を知っている」のは責務の越境であり、対応モデルが増えるほどコアがモデル知識で汚れる。

## 決定

- yomi は **中立な G2P 建材のみ** を export する:
  - 読み・モーラ・アクセント核・句境界（`FrontendResult`）
  - モーラ → 音素（`moraToPhones`）、NJD ノード → モーラ（`nodeToMoras`）
  - 核位置 → 各モーラのトーン 0/1（`moraTones`）
  - 語 → 音素アライメント（`wordPhoneAlignment`）、pause → 句読点（`pausePunct`）
- **モデル固有のアダプタ**（PAD トークン、`given_phone`/`given_tone` 梱包、トーン反転規約、
  句読点の phone 化など）は yomi に置かず、**呼び出し側で組む**。
- 具体的に `@hdae/yomi/sbv2`（`toSbv2PhoneTone` / `Sbv2PhoneTone`）を削除する（破壊的変更・
  v1 前・[[yomi-prerelease-breaking-ok]]）。

## 帰結

- コアがモデル知識から解放され、任意モデルへ再利用可能。
- 破壊的変更: 旧 `@hdae/yomi/sbv2` 利用側は自前で梱包する。従来の `toSbv2PhoneTone` 相当は
  中立 export から再構成できる:

  ```ts
  import { analyze, moraToPhones, moraTones, pausePunct } from "@hdae/yomi";

  const r = analyze(dict, text);
  const phones = ["_"], tones = [0]; // 先頭 PAD
  for (const p of r.accentPhrases) {
    const t = moraTones(p.accentNucleus, p.moras.length);
    p.moras.forEach((m, i) =>
      moraToPhones(m).forEach((ph) => { phones.push(ph); tones.push(t[i]); })
    );
    const punct = pausePunct(p.pauseAfter);
    if (punct !== undefined) { phones.push(punct); tones.push(0); }
  }
  phones.push("_"); tones.push(0); // 末尾 PAD
  ```

- 以後、中立リクエストは「実装 + export」、モデル固有は「呼び出し側」を既定方針とする。
