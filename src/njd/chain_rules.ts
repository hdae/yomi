// アクセント結合規則（chain_rule）文字列のパースと前語品詞による選択。
// jpreprocess-core/src/accent_rule.rs の忠実移植。
//
// 文法: [品詞%]結合型[@加算値] を '/' 区切りで並べる。
// 例: "C3", "形容詞%F2@-1", "動詞%F1/形容詞%F1/名詞%F1"
// 品詞プレフィクスは「前語の品詞別」にルールを切り替えるためのスロット指定。

import type { PosFeatures } from "./pos.ts";

export type AccentType =
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5"
  | "C1"
  | "C2"
  | "C3"
  | "C4"
  | "C5"
  | "P1"
  | "P2"
  | "P6"
  | "P14"
  | "none";

export type ChainRule = {
  accentType: AccentType;
  addType: number;
};

export type ChainRules = {
  default?: ChainRule;
  doushi?: ChainRule;
  joshi?: ChainRule;
  keiyoushi?: ChainRule;
  meishi?: ChainRule;
};

// 正規表現は accent_rule.rs の PARSE_REGEX と同一。
// NOTE: 「特殊助動詞」は正規表現にはあるが POSMatch が受理せずスキップされる
// （jpreprocess と同挙動 = 警告してルールを無視）。
const PARSE_REGEX =
  /^(?:(?<pos>名詞|形容詞|助詞|特殊助動詞|動詞)%)?(?<accent>[FC][1-5]|P1|P2|P6|P14)?(?:@(?<add>[-0-9]+))?$/;

const cache = new Map<string, ChainRules | null>();

/** ルール文字列 → ChainRules。"*"/"" は null（規則なし）。パース失敗要素はスキップ。 */
export const parseChainRules = (rules: string): ChainRules | null => {
  const hit = cache.get(rules);
  if (hit !== undefined) return hit;
  const parsed = parseChainRulesUncached(rules);
  cache.set(rules, parsed);
  return parsed;
};

const parseChainRulesUncached = (rules: string): ChainRules | null => {
  if (rules === "" || rules === "*") return null;
  const result: ChainRules = {};
  for (const ruleStr of rules.split("/")) {
    const m = PARSE_REGEX.exec(ruleStr);
    if (!m || !m.groups) continue; // jpreprocess: 警告してスキップ
    const rule: ChainRule = {
      accentType: (m.groups.accent as AccentType | undefined) ?? "none",
      addType: m.groups.add !== undefined ? Number(m.groups.add) : 0,
    };
    switch (m.groups.pos) {
      case "動詞":
        result.doushi = rule;
        break;
      case "助詞":
        result.joshi = rule;
        break;
      case "形容詞":
        result.keiyoushi = rule;
        break;
      case "名詞":
        result.meishi = rule;
        break;
      case "特殊助動詞":
        break; // POSMatch::from_str が受理しない（jpreprocess と同挙動）
      default:
        result.default = rule;
        break;
    }
  }
  return result;
};

/**
 * 前語の品詞に対応するルールを選ぶ（accent_rule.rs get_rule）。
 * 助動詞は動詞スロットにマップ。該当スロットが無ければ default。
 */
export const getRule = (rules: ChainRules, prevPos: PosFeatures): ChainRule | undefined => {
  const major = prevPos[0];
  const slot = major === "動詞" || major === "助動詞"
    ? rules.doushi
    : major === "助詞"
    ? rules.joshi
    : major === "形容詞"
    ? rules.keiyoushi
    : major === "名詞"
    ? rules.meishi
    : undefined;
  return slot ?? rules.default;
};
