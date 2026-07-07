// モーラ → SBV2 音素列の展開（唯一の実装）。
// sbv2_bridge.ts（given_phone 生成）と word_alignment.ts（語アライメント）が
// 共有し、音素生成ロジックの二経路化を構造的に防ぐ（ADR-0008 決定3）。
//
// 仕様の出典は docs/sbv2-g2p-interface.md（§9-1/2/4）:
// - 促音 vowel==="cl" → ["q"]（consonant 無視）
// - 撥音 vowel==="N" → ["N"]（consonant 無視）
// - それ以外 → consonant があれば [consonant, vowel]、なければ [vowel]
// - 長音・"-" は result.ts が Mora.vowel に解決済みなので、ここでは通常母音として出す。
// - devoiced は SBV2 に無声化表現が無いため音素には出さない（§1, §9-8）。

import type { Mora } from "./njd/result.ts";
import type { NjdNode } from "./njd/node.ts";

/** モーラ1個を SBV2 音素列に展開する。 */
export const moraToPhones = (mora: Mora): string[] => {
  if (mora.vowel === "cl") return ["q"];
  if (mora.vowel === "N") return ["N"];
  return mora.consonant !== undefined ? [mora.consonant, mora.vowel] : [mora.vowel];
};

/**
 * NjdNode を FrontendResult の Mora 列に加工する（唯一の実装）。
 * buildResult（アクセント句組み立て）と wordPhoneAlignment（語アライメント）が
 * 共有し、モーラ加工の二経路化を防ぐ（ADR-0008 決定3）。
 *
 * - 擬似モーラ（読点・？等の pseudo）はスキップ。
 * - 長音（vowel==="long"）は直前モーラの母音を引き継ぐ（音響モデルへの入力仕様）。
 *   句頭に長音が来る縮退ケースは "o" に倒す（OpenJTalk も同様の防御）。
 * - "-"（長音の内部マーカー）は音素ではないので consonant から落とす。
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
    out.push({
      kana: m.spec.kana,
      consonant: m.spec.consonant === "-" ? undefined : m.spec.consonant ?? undefined,
      vowel,
      devoiced: m.voiced ? undefined : true,
    });
    prev = vowel;
  }
  return out;
};
