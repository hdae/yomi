// NJD 後段が参照する品詞述語。
// jpreprocess は POS を enum に正規化するが、本実装は辞書の素性文字列
// [品詞, 細分類1, 細分類2, 細分類3, 活用型, 活用形] を直接述語で判定する
// （enum 移植より対応表が1段減り、辞書との乖離が構造的に起きない）。

import type { PosFeatures } from "./types.ts";

export const isMeishi = (p: PosFeatures): boolean => p[0] === "名詞";
export const isDoushi = (p: PosFeatures): boolean => p[0] === "動詞";
export const isKeiyoushi = (p: PosFeatures): boolean => p[0] === "形容詞";
export const isJoshi = (p: PosFeatures): boolean => p[0] === "助詞";
export const isJodoushi = (p: PosFeatures): boolean => p[0] === "助動詞";
export const isKigou = (p: PosFeatures): boolean => p[0] === "記号";
export const isFiller = (p: PosFeatures): boolean => p[0] === "フィラー";
export const isKandoushi = (p: PosFeatures): boolean => p[0] === "感動詞";
export const isSettoushi = (p: PosFeatures): boolean => p[0] === "接頭詞";
export const isFukushi = (p: PosFeatures): boolean => p[0] === "副詞";
export const isSetsuzokushi = (p: PosFeatures): boolean => p[0] === "接続詞";
export const isRentaishi = (p: PosFeatures): boolean => p[0] === "連体詞";

/** 名詞/動詞/形容詞の「接尾」（accent_phrase Rule 10/18）。 */
export const isSetsubi = (p: PosFeatures): boolean =>
  (p[0] === "名詞" || p[0] === "動詞" || p[0] === "形容詞") && p[1] === "接尾";

export const isMeishiKeiyoudoushiGokan = (p: PosFeatures): boolean =>
  p[0] === "名詞" && p[1] === "形容動詞語幹";
export const isMeishiFukushiKanou = (p: PosFeatures): boolean =>
  p[0] === "名詞" && p[1] === "副詞可能";
export const isDoushiHijiritsu = (p: PosFeatures): boolean => p[0] === "動詞" && p[1] === "非自立";
export const isKeiyoushiHijiritsu = (p: PosFeatures): boolean =>
  p[0] === "形容詞" && p[1] === "非自立";
export const isSetsuzokuJoshi = (p: PosFeatures): boolean => p[0] === "助詞" && p[1] === "接続助詞";
export const isPersonSei = (p: PosFeatures): boolean =>
  p[0] === "名詞" && p[1] === "固有名詞" && p[2] === "人名" && p[3] === "姓";
export const isPersonMei = (p: PosFeatures): boolean =>
  p[0] === "名詞" && p[1] === "固有名詞" && p[2] === "人名" && p[3] === "名";

/** 数詞（accent_type の連数詞規則）。名詞,数 と 記号,数（convert_to_kigou 後）。 */
export const isKazu = (p: PosFeatures): boolean =>
  (p[0] === "名詞" || p[0] === "記号") && p[1] === "数";

/** 活用形が連用系か（cform.rs is_renyou: 連用形/連用タ・テ・デ・ニ・ゴザイ接続）。 */
export const isRenyou = (p: PosFeatures): boolean => p[5].startsWith("連用");

/**
 * njd_set_pronunciation の convert_to_kigou 相当（in-place で品詞を記号化する）。
 * 数→記号,数 / 副詞,一般・名詞,一般→記号,一般 / 記号はそのまま / それ以外→記号,*。
 */
export const convertToKigou = (p: PosFeatures): void => {
  if (p[0] === "記号") return;
  if (p[0] === "名詞" && p[1] === "数") {
    p[0] = "記号";
    return; // 細分類「数」は維持
  }
  if ((p[0] === "副詞" || p[0] === "名詞") && p[1] === "一般") {
    p[0] = "記号";
    p[1] = "一般";
    return;
  }
  p[0] = "記号";
  p[1] = "*";
};
