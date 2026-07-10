// モーラ → 音素列の展開（唯一の実装。モデル非依存の中立表現）。
// buildResult（result.ts）と wordPhoneAlignment（word_alignment.ts）が共有し、
// 音素生成ロジックの二経路化を構造的に防ぐ。
//
// 変換規則:
// - 促音 vowel==="cl" → ["q"]
// - 撥音 vowel==="N" → ["N"]
// - それ以外 → consonant があれば [consonant, vowel]、なければ [vowel]
// - 長音・"-" は result.ts が Mora.vowel に解決済みなので、ここでは通常母音として出す。
// - devoiced（無声化）は音素記号には出さない（Mora.devoiced に別途保持）。
// NOTE: "q"(促音) は表記系の一慣習、"N"(撥音) は広く共通。モデル固有の梱包
//       （PAD・トーン規約）は yomi では持たない（docs/decisions/0001）。

import type { Mora } from "./types.ts";
import type { NjdNode } from "../njd/types.ts";

/** モーラ1個を TTS 向け音素列に展開する。 */
export const moraToPhones = (mora: Mora): string[] => {
  if (mora.vowel === "cl") return ["q"];
  if (mora.vowel === "N") return ["N"];
  return mora.consonant !== undefined ? [mora.consonant, mora.vowel] : [mora.vowel];
};

/**
 * NjdNode を FrontendResult の Mora 列に加工する（唯一の実装）。
 * buildResult（アクセント句組み立て）と wordPhoneAlignment（語アライメント）が
 * 共有し、モーラ加工の二経路化を防ぐ。
 *
 * - 擬似モーラ（読点・？等の pseudo）はスキップ。
 * - 長音（vowel==="long"）は直前モーラの母音を引き継ぐ（音響モデルへの入力仕様）。
 *   句頭に長音が来る縮退ケースは "o" に倒す（OpenJTalk も同様の防御）。
 * - 内部マーカー（長音 "-"）と擬似子音（撥音 "N"・促音 "cl"）は子音音素ではないので
 *   consonant から落とす（撥音・促音は「子音なし」= undefined。vowel "N"/"cl" が表す）。
 * - devoiced は voiced=false のモーラに付ける。
 *
 * @param prevVowel 直前モーラの母音（句/語内で直前が無ければ undefined）。長音解決に使う。
 * @returns 加工済み Mora 列（末尾の母音を次の長音解決に使えるよう prevVowel は呼び出し側が更新する）。
 */
export const nodeToMoras = (node: NjdNode, prevVowel: string | undefined): Mora[] => {
  const out: Mora[] = [];
  let prev = prevVowel;
  for (const m of node.moras) {
    if (m.spec.pseudo) continue;
    const vowel = m.spec.vowel === "long" ? (prev ?? "o") : m.spec.vowel;
    // 長音マーカー "-" と擬似子音（撥音 "N"・促音 "cl"）は子音音素ではないので落とす。
    const pseudoConsonant = m.spec.consonant === "-" || m.spec.vowel === "N" ||
      m.spec.vowel === "cl";
    out.push({
      kana: m.spec.kana,
      consonant: pseudoConsonant ? undefined : m.spec.consonant ?? undefined,
      vowel,
      devoiced: m.voiced ? undefined : true,
    });
    prev = vowel;
  }
  return out;
};
