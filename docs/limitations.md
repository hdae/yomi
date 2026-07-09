# 制約（by-design）

意図的な仕様・互換性・アーキテクチャ上の制約。バグではない（未解決の問題は
[known-issues.md](known-issues.md)）。変更する場合は理由と影響（golden 互換・API）を添えて ADR 化する。

## OpenJTalk / jpreprocess 互換まわり

- **`njd_set_long_vowel` は実装しない。** 本家 OpenJTalk で廃止（全コメントアウト）済みで
  jpreprocess も未実装のため、パイプラインから意図的に省略している（[src/njd/frontend.ts](../src/njd/frontend.ts)）。
- **アクセント結合規則の負値は 0 にクランプする。** Rust（jpreprocess）は
  `(mora_size as isize + add_type) as usize` で負値が巨大値に wrap するが、その再現は無意味なので
  0 に丸める。負になる組は実データで発生する（browser-tts の golden 実測で 100k 文中 2 件）ため、
  golden 照合ではこの 2 件を既知逸脱（allowlist）として扱う（[src/njd/accent_type.ts](../src/njd/accent_type.ts)）。
- **核位置がモーラ数を超える値は忠実に保持する**（辞書由来の値を黙って補正しない）。golden 照合の
  等価規約は browser-tts `docs/golden-format.md` を参照。
- **`moraTones` の範囲外核は尾高相当にクランプする。** 尾高（核=モーラ数）は言語的に正当
  （下降は次句頭で実現）で、それを超える核も尾高として扱う意図的縮退。呼び出し側（overlay 等）の
  軽微な逸脱を許容するためで、挙動は `src/g2p/tones.test.ts` で固定している。
- **正規化は NFKC ではない。** jpreprocess 互換の専用全角化＋ステートフル濁点合成
  （[src/text/normalize.ts](../src/text/normalize.ts)）。合成できない濁点マークが落ちるのも本家同挙動。

## dict-builder

- **CSV パーサは naist-jdic 前提の non-quoting・15列固定。** RFC 4180 のクォートは解釈しない。
  埋め込みカンマは列数不一致として fail-loud に落ちる（黙って列がずれることはない）。
  辞書ソースは SHA-256 ピン留め（[decisions/0004](decisions/0004-dict-source-pinning.md)）が前提。
