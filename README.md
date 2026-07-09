# @hdae/yomi

A pure-TypeScript Japanese TTS text frontend (G2P) that runs fully local in the
browser. It converts text into **readings**, **pitch accent** (accent nucleus
position), and **accent-phrase boundaries**.

## Features

- **Accent-aware G2P**: Emits readings, accent nucleus positions, accent-phrase
  boundaries, and pauses — the piece browser TTS stacks are missing for Japanese
- **Zero runtime dependencies**: Identical behavior across the browser, Deno,
  Node, and Workers — no external process, no WASM, no GPL dependency
- **OpenJTalk-compatible**: naist-jdic dictionary, lindera-compatible
  tokenization, and jpreprocess-compatible NJD accent post-processing
- **Model-neutral**: Emits neutral readings, moras, phonemes, and per-mora tones;
  build any model's phone/tone packaging at the call site
- **Cached dictionary**: `@hdae/yomi/browser` caches the dictionary via the Cache
  API with magic + CRC integrity checks and self-healing

## Installation

```bash
deno add jsr:@hdae/yomi
```

## Quick Start

```typescript
import { analyze, JtdDictionary } from "@hdae/yomi";
import { loadDictionary } from "@hdae/yomi/browser";

// Fetch the dictionary for this package version (cached in the Cache API,
// integrity-verified).
const bytes = await loadDictionary();
const dict = JtdDictionary.load(bytes.buffer);

// Text -> reading + accent + phrase boundaries.
const result = analyze(dict, "こんにちは、今日はいい天気ですね。");
for (const phrase of result.accentPhrases) {
  console.log(
    phrase.moras.map((m) => m.kana).join(""),
    "nucleus:",
    phrase.accentNucleus,
    phrase.pauseAfter,
  );
}
```

## Usage

### Deno / server (local dictionary file)

```typescript
import { analyze, JtdDictionary } from "@hdae/yomi";

const dict = JtdDictionary.load((await Deno.readFile("naist-jdic.jtd")).buffer);
console.log(analyze(dict, "音声合成のテストを行います。"));
```

### Model adapters

`@hdae/yomi` is model-neutral. It emits readings, moras, phonemes
(`moraToPhones`), per-mora tones (`moraTones`), word/phone alignment
(`wordPhoneAlignment`), and pause punctuation (`pausePunct`). Assemble a specific
model's phone/tone format (PAD tokens, tone conventions, and so on) at your call
site from these pieces.

## Dictionary distribution & caching

The dictionary `naist-jdic.jtd` (a JTD1 binary) is **not bundled** in the
package. It is distributed as a versioned release asset and fetched at runtime.

`loadDictionary` from `@hdae/yomi/browser` stores the dictionary in the **Cache
API** and verifies the fetched bytes against the JTD1 magic and per-section CRC
(corruption throws — fail loud). A corrupted cache entry is re-fetched from the
source (self-heal).

By default it fetches **the dictionary matching this package's own version** (the
version is baked into the code, so code and dictionary always agree —
reproducible). Because a pinned version is immutable, later calls are served from
the cache with no network access.

```typescript
// Default: the dictionary for this package version (recommended).
const bytes = await loadDictionary();

// Or pin a version / point at a mirror or self-hosted copy explicitly.
const other = await loadDictionary({
  version: "0.1.0", // default = this package's own version
  url: "https://example.com/naist-jdic-{version}.jtd", // {version} is substituted at fetch time
});
```

## License

- **Code: MIT** (`LICENSE`).
- **Dictionary data (naist-jdic): BSD-3-Clause** (`NOTICE`; the full COPYING text
  is embedded in the JTD1 META section).

## Acknowledgements

This project stands on prior research and data for Japanese speech synthesis,
with gratitude:

- **[Open JTalk](https://open-jtalk.sourceforge.net/)** — Japanese TTS frontend;
  the origin of this implementation's accent handling (the NJD accent-combination
  rules and more).
- **naist-jdic** — the Japanese dictionary data used by this package (BSD-3-Clause,
  Nara Institute of Science and Technology and others). Redistribution carries the
  BSD-3-Clause attribution (`NOTICE`).
- **[jpreprocess](https://github.com/jpreprocess/jpreprocess)** — a Rust
  implementation of the OpenJTalk NJD post-stage; the primary reference for
  porting and verifying readings and accent.
- **[Lindera](https://github.com/lindera/lindera)** — the morphological analyzer
  referenced when reimplementing compatible tokenization (lattice, unknown-word
  generation, connection costs).
- **[MeCab](https://taku910.github.io/mecab/)** — the foundation of morphological
  analysis (the naist-jdic format and more).
- **[pyopenjtalk](https://github.com/r9y9/pyopenjtalk) /
  [pyopenjtalk-plus](https://github.com/tsukumijima/pyopenjtalk-plus)** — used to
  build the golden data for quality verification.
