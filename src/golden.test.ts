// golden-3k 回帰: fixtures/golden-3k.jsonl（jpreprocess オラクルの出力、回帰の真実源）と
// yomi の全経路（tokenize → NJD 後段 → buildResult）の出力を全レコード突合する。
//
// ベースライン（2026-07-10 実測・naist-jdic v0.1.3）: 3,031 文・33,253 アクセント句の
// すべてで 分かち書き・発音・句境界・核位置・ポーズ・無声化 が完全一致（mismatch 0）。
// このテストは「完全一致」を固定する。落ちた場合は互換退行なので、テストを緩めず原因を直す。
// 辞書ソースを差し替えた場合（pyopenjtalk-plus 計画）は golden を新オラクルで再生成する。
//
// 等価規約は browser-tts docs/golden-format.md を正とする。うち本テストに関係するもの:
// - 核の符号化は golden・yomi とも NJD 直読み（0=平板）なので厳密一致で比較する。
// - 例外: golden の巨大核は jpreprocess の usize 負値ラップ（docs/limitations.md）。yomi は
//   0 にクランプする意図的逸脱なので等価扱いする（golden-3k では 0 件・100k 級で 2 件実測）。

import { JtdDictionary } from "./dict/dictionary.ts";
import { analyzeToNodes } from "./njd/frontend.ts";
import { buildResult } from "./g2p/result.ts";
import { normalizeForDict } from "./text/normalize.ts";
import { dictAvailable, dictPath } from "./_dict_path.ts";

type GoldenToken = {
  surface: string;
  pron: string;
  pos: string;
  accType: number | null;
  chainRule: string | null;
};
type GoldenAccentPhrase = {
  moras: string[];
  nucleus: number;
  devoiced: number[];
  pauseAfter: "none" | "short" | "long";
};
type GoldenRecord = {
  id: string;
  text: string;
  tokens: GoldenToken[];
  accentPhrases: GoldenAccentPhrase[];
};

const GOLDEN_PATH = new URL("../fixtures/golden-3k.jsonl", import.meta.url).pathname;
// golden-3k.jsonl は committed なので、辞書（別管理・build-dict で生成）が在れば走れる。
const available = dictAvailable();

/** 期待レコード数（fixture の同一性ガード。golden を再生成したら更新する）。 */
const EXPECTED_SENTENCES = 3031;
/** 期待アクセント句数（全件一致が「空振りの緑」でないことのガード）。 */
const EXPECTED_PHRASE_PAIRS = 33253;

const assertNoMiss = (label: string, miss: string[]) => {
  if (miss.length === 0) return;
  const head = miss.slice(0, 5).join("\n");
  throw new Error(`${label} の不一致 ${miss.length} 件（互換退行）。先頭5件:\n${head}`);
};

Deno.test({
  name: "golden-3k 回帰: jpreprocess オラクルと全レコード完全一致",
  ignore: !available,
  async fn(t) {
    const bytes = Deno.readFileSync(dictPath());
    const dict = JtdDictionary.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const records: GoldenRecord[] = Deno.readTextFileSync(GOLDEN_PATH)
      .split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l));

    const miss = {
      surface: [] as string[],
      pron: [] as string[],
      boundary: [] as string[],
      nucleus: [] as string[],
      pause: [] as string[],
      devoiced: [] as string[],
    };
    let phrasePairs = 0;

    for (const r of records) {
      const nodes = analyzeToNodes(dict, r.text);

      // --- トークン層（NJD ノード単位。golden の tokens と 1:1 対応）---
      const gotSurface = nodes.map((n) => n.surface).join("/");
      const goldSurface = r.tokens.map((tk) => tk.surface).join("/");
      if (gotSurface !== goldSurface) {
        miss.surface.push(`${r.id}\n  got:  ${gotSurface}\n  want: ${goldSurface}`);
      }
      // golden は記号を pron:"" にする。yomi の記号は擬似モーラなので除外して kana 連結を比べる。
      const gotPron = nodes
        .map((n) =>
          n.moras.filter((m) => m.spec.pseudo === undefined).map((m) => m.spec.kana).join("")
        )
        .join("/");
      const goldPron = r.tokens.map((tk) => tk.pron).join("/");
      if (gotPron !== goldPron) {
        miss.pron.push(`${r.id}\n  got:  ${gotPron}\n  want: ${goldPron}`);
      }

      // --- アクセント句層（buildResult 出力。境界一致時のみ句を突合できる）---
      const res = buildResult(normalizeForDict(r.text), nodes);
      const gotKeys = res.accentPhrases.map((p) => p.moras.map((m) => m.kana).join(""));
      const goldKeys = r.accentPhrases.map((p) => p.moras.join(""));
      if (gotKeys.join("|") !== goldKeys.join("|")) {
        miss.boundary.push(`${r.id}\n  got:  ${gotKeys.join("|")}\n  want: ${goldKeys.join("|")}`);
        continue;
      }
      for (let k = 0; k < res.accentPhrases.length; k++) {
        const g = res.accentPhrases[k];
        const w = r.accentPhrases[k];
        phrasePairs++;
        const wrapEquivalent = w.nucleus > 0xffffffff && g.accentNucleus === 0;
        if (g.accentNucleus !== w.nucleus && !wrapEquivalent) {
          miss.nucleus.push(`${r.id}#${k} ${goldKeys[k]} got=${g.accentNucleus} want=${w.nucleus}`);
        }
        if (g.pauseAfter !== w.pauseAfter) {
          miss.pause.push(`${r.id}#${k} ${goldKeys[k]} got=${g.pauseAfter} want=${w.pauseAfter}`);
        }
        const gotDev = g.moras.flatMap((m, mi) => (m.devoiced ? [mi] : [])).join(",");
        if (gotDev !== w.devoiced.join(",")) {
          miss.devoiced.push(
            `${r.id}#${k} ${goldKeys[k]} got=[${gotDev}] want=[${w.devoiced.join(",")}]`,
          );
        }
      }
    }

    // fixture の同一性ガード: 空・切り詰めの golden で全件一致が空振りの緑になるのを防ぐ。
    if (records.length !== EXPECTED_SENTENCES) {
      throw new Error(
        `golden レコード数 ${records.length} != ${EXPECTED_SENTENCES}（fixture 変更?）`,
      );
    }

    await t.step("分かち書き（NJDノード表層列）が全文一致", () => {
      assertNoMiss("表層列", miss.surface);
    });
    await t.step("発音列（記号除くモーラ kana 連結）が全文一致", () => {
      assertNoMiss("発音列", miss.pron);
    });
    await t.step("アクセント句境界が全文一致", () => {
      assertNoMiss("句境界", miss.boundary);
    });
    await t.step("核位置が全句一致（負値ラップは等価扱い）", () => {
      assertNoMiss("核位置", miss.nucleus);
    });
    await t.step("ポーズ種別が全句一致", () => {
      assertNoMiss("ポーズ", miss.pause);
    });
    await t.step("無声化 index 集合が全句一致", () => {
      assertNoMiss("無声化", miss.devoiced);
    });
    await t.step("突合した句数がベースラインと一致（空振り防止）", () => {
      if (phrasePairs !== EXPECTED_PHRASE_PAIRS) {
        throw new Error(
          `句数 ${phrasePairs} != ${EXPECTED_PHRASE_PAIRS}（境界不一致か fixture 変更）`,
        );
      }
    });
  },
});
