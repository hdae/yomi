// njd_set_pronunciation の移植。
// 1. 実モーラを持たないノード（未知語・記号）を表層のかな解析でモーラ化する。
//    かな連続の range ごとにノードを分割し、モーラ化できたものはフィラーへ、
//    読点相当は記号へ品詞変換する。モーラ化不能な文字は消える（jpreprocess と同挙動）
// 2. 無音ノード（モーラ0個）を除去する
// 3. 連続する「1モーラのかなフィラー」を先頭ノードへ併合する（chain kana sequence）
// 4. 動詞/助動詞 + 助動詞「う」→ 長音ー。助動詞です/ます + 「？」→ 核1に戻す

import { isMoraString, splitMorasWithRanges } from "../text/mora_table.ts";
import type { MoraSpec } from "../text/types.ts";
import { convertToKigou, isDoushi, isFiller, isJodoushi } from "./pos.ts";
import { makeMoras, moraSize } from "./node.ts";
import type { NjdNode } from "./types.ts";

/** 未知語・記号を表層のかな解析でモーラ化し、無音除去・かな連続併合などを行う（njd_set_pronunciation 移植）。 */
export const njdSetPronunciation = (nodes: NjdNode[]): NjdNode[] => {
  // ---- 1. モーラ0ノードの表層かな解析と分割 ----
  let result: NjdNode[] = [];
  for (const node of nodes) {
    if (moraSize(node) !== 0) {
      result.push(node);
      continue;
    }
    const segments = splitMorasWithRanges(node.surface);
    for (const seg of segments) {
      const surface = node.surface.slice(seg.start, seg.end);
      const child: NjdNode = {
        surface,
        pos: [...node.pos],
        moras: makeMoras(seg.moras, seg.devoiced),
        pronOrig: seg.moras.map((m) => m.kana).join(""),
        accent: 0,
        chainRule: node.chainRule,
        chainFlag: node.chainFlag,
        isUnknown: node.isUnknown,
      };
      const size = moraSize(child);
      if (size === 0) {
        // 実モーラなし（読点・疑問符等の擬似モーラのみ）。読点相当は記号へ。
        if (child.moras.length === 1 && child.moras[0].spec.pseudo === "touten") {
          convertToKigou(child.pos);
        }
      } else {
        child.pos = ["フィラー", "*", "*", "*", child.pos[4], child.pos[5]];
      }
      if (child.moras.length > 0) result.push(child);
    }
  }

  // ---- 2. 無音ノード除去 ----
  result = result.filter((n) => n.moras.length > 0);

  // ---- 3. 連続かなフィラーの併合（chain kana sequence）----
  // 表層が「単一モーラ文字列そのもの」であるフィラーを、直前の同種列の先頭へ移す。
  {
    let head: NjdNode | undefined;
    const merged: NjdNode[] = [];
    for (const node of result) {
      if (isFiller(node.pos) && isMoraString(node.surface)) {
        if (head !== undefined) {
          head.surface += node.surface;
          head.moras.push(...node.moras);
          continue; // node は head に吸収
        }
        head = node;
      } else {
        head = undefined;
      }
      merged.push(node);
    }
    result = merged;
  }

  // ---- 4. 特例規則 ----
  for (let i = 0; i + 1 < result.length; i++) {
    const node = result[i];
    const next = result[i + 1];
    // 動詞/助動詞 + 助動詞「う」(1モーラのウ) → 長音ー（例: 行こう → イコー）
    if (
      next.moras.length === 1 &&
      next.moras[0].spec.kana === "ウ" &&
      !next.moras[0].spec.pseudo &&
      isJodoushi(next.pos) &&
      (isDoushi(node.pos) || isJodoushi(node.pos)) &&
      moraSize(node) > 0
    ) {
      next.moras = makeMoras([LONG_MORA], []);
      next.accent = 0;
    }
    // 助動詞です/ます + 「？」→ 核1のデス/マス（無声化を解除して上昇調に備える）
    if (isJodoushi(node.pos) && next.surface === "？") {
      if (node.surface === "です") {
        node.moras = makeMoras(splitPlain("デス"), []);
        node.accent = 1;
      } else if (node.surface === "ます") {
        node.moras = makeMoras(splitPlain("マス"), []);
        node.accent = 1;
      }
    }
  }

  return result;
};

/** 長音モーラ（MoraEnum::Long）。consonant は Rust phoneme.rs に忠実に "-"。 */
const LONG_MORA: MoraSpec = { kana: "ー", consonant: "-", vowel: "long" };

/** 検証済みの純カナ文字列を分割する内部ヘルパ（失敗は実装バグなので throw）。 */
const splitPlain = (kana: string): MoraSpec[] => {
  const segs = splitMorasWithRanges(kana);
  if (segs.length !== 1 || segs[0].start !== 0 || segs[0].end !== kana.length) {
    throw new Error(`内部エラー: ${kana} がモーラ分割できない`);
  }
  return segs[0].moras;
};
