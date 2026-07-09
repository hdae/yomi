// njd_set_accent_phrase の移植: 隣接2ノードの品詞からアクセント句境界を決める。
// 規則一覧はソース jpreprocess accent_phrase.rs の doc（R01〜R18）と同一。
// Rust の match と同じく「上から最初に当たった規則が勝つ」順序依存があるため、
// 分岐の順番を変えてはならない（MUST）。

import {
  isDoushi,
  isDoushiHijiritsu,
  isFukushi,
  isJodoushi,
  isJoshi,
  isKeiyoushi,
  isKeiyoushiHijiritsu,
  isKigou,
  isMeishi,
  isMeishiFukushiKanou,
  isMeishiKeiyoudoushiGokan,
  isPersonMei,
  isPersonSei,
  isRentaishi,
  isRenyou,
  isSetsubi,
  isSetsuzokuJoshi,
  isSetsuzokushi,
  isSettoushi,
} from "./pos.ts";
import type { NjdNode } from "./types.ts";

export const njdSetAccentPhrase = (nodes: NjdNode[]): void => {
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].chainFlag === undefined) {
      nodes[i].chainFlag = chainFlag(nodes[i - 1], nodes[i]);
    }
  }
};

const chainFlag = (prev: NjdNode, node: NjdNode): boolean => {
  const p = prev.pos;
  const c = node.pos;

  /* Rule 18: 「*,接尾」は前にくっつける */
  if (isSetsubi(c)) return true;
  /* Rule 17: 「名詞」の後の「*,*,*,名」は別のアクセント句に */
  if (isMeishi(p) && isPersonMei(c)) return false;
  /* Rule 16: 「*,*,*,姓」の後の「名詞」は別のアクセント句に */
  if (isPersonSei(p) && isMeishi(c)) return false;
  /* Rule 15: 「接頭詞」は単独のアクセント句に */
  if (isSettoushi(c)) return false;
  /* Rule 14: 「記号」は単独のアクセント句に */
  if (isKigou(p) || isKigou(c)) return false;
  /* Rule 13: 「名詞」の後に「動詞」「形容詞」「名詞,形容動詞語幹」がきたら別の句に */
  if (isMeishi(p) && isDoushi(c)) return false;
  if (isMeishi(p) && isKeiyoushi(c)) return false;
  if (isMeishi(p) && isMeishiKeiyoudoushiGokan(c)) return false;
  /* Rule 12: 「動詞,非自立」は「動詞,連用*」に接続する場合に前にくっつける */
  if (isDoushi(p) && isDoushiHijiritsu(c) && isRenyou(p)) return true;
  /* Rule 11: 「形容詞,非自立」は 動詞連用/形容詞連用/助詞接続助詞て・で に接続で前にくっつける */
  if (isDoushi(p) && isKeiyoushiHijiritsu(c) && isRenyou(p)) return true;
  if (isKeiyoushi(p) && isKeiyoushiHijiritsu(c) && isRenyou(p)) return true;
  if (
    isSetsuzokuJoshi(p) &&
    isKeiyoushiHijiritsu(c) &&
    (prev.surface === "て" || prev.surface === "で")
  ) {
    return true;
  }
  /* Rule 10: 「*,接尾」の後の「名詞」は別のアクセント句に */
  if (isSetsubi(p) && isMeishi(c)) return false;
  /* Rule 08: 付属語の連続はくっつける */
  if ((isJodoushi(p) || isJoshi(p)) && (isJodoushi(c) || isJoshi(c))) return true;
  /* Rule 09: 付属語の後の自立語は別のアクセント句に */
  if (isJodoushi(p) || isJoshi(p)) return false;
  /* Rule 08: 付属語は前にくっつける */
  if (isJodoushi(c) || isJoshi(c)) return true;
  /* Rule 07: 「名詞,副詞可能」は単独のアクセント句に */
  if (isMeishiFukushiKanou(p)) return false;
  if (isMeishiFukushiKanou(c)) return false;
  /* Rule 06: 「副詞」「接続詞」「連体詞」は単独のアクセント句に */
  if (isFukushi(p) || isSetsuzokushi(p) || isRentaishi(p)) return false;
  if (isFukushi(c) || isSetsuzokushi(c) || isRentaishi(c)) return false;
  /* Rule 05: 「動詞」の後に「形容詞」or「名詞」がきたら別のアクセント句に */
  if (isDoushi(p) && (isKeiyoushi(c) || isMeishi(c))) return false;
  /* Rule 04: 「名詞,形容動詞語幹」の後に「名詞」がきたら別のアクセント句に */
  if (isMeishiKeiyoudoushiGokan(p) && isMeishi(c)) return false;
  /* Rule 03: 「形容詞」の後に「名詞」がきたら別のアクセント句に */
  if (isKeiyoushi(p) && isMeishi(c)) return false;
  /* Rule 02: 「名詞」の連続はくっつける */
  if (isMeishi(p) && isMeishi(c)) return true;
  /* Rule 01: デフォルトはくっつける */
  return true;
};
