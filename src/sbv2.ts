// @hdae/yomi/sbv2 — Style-Bert-VITS2 向けアダプタ（サブパス export）。
// コア（mod.ts）はモデル非依存に保ち、SBV2 固有の音素・トーン規約はここへ分離する
// （ADR-0010）。将来 @hdae/yomi/<model> を並列に追加できる構造。
//
// 変換規約の唯一の出典は sbv2_bridge.ts のドキュメントコメント（docs/sbv2-g2p-interface.md）。

export { pausePunct, type Sbv2PhoneTone, toSbv2PhoneTone } from "./sbv2_bridge.ts";
