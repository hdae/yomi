// version 焼き込みの drift 検出（dev/CI）: 公開 `.` エントリ（src/mod.ts）が export する VERSION が
// deno.jsonc の version と一致するか。src/mod.ts と src/loader/mod.ts は src/constants.ts を re-export し、
// constants.ts は deno.jsonc の焼き込みコピー。deno task bump が deno.jsonc と constants.ts を同時更新するが、
// 手動編集や re-export の破壊（mod.ts に literal を書き戻す等）による drift をここで fail-loud にする
// （公開 VERSION が JSR publish 版とズレるのを防ぐ。辞書 URL は DICT_REVISION 固定＝ADR-0003 で
// VERSION とは独立なので、このガードの目的は publish 版の一致のみ）。
import { VERSION } from "../src/mod.ts";
import { readVersion } from "./config_version.ts";

Deno.test("version 焼き込み: 公開 VERSION == deno.jsonc.version", async () => {
  const declared = await readVersion("./deno.jsonc");
  if (VERSION !== declared) {
    throw new Error(
      `公開 VERSION(${VERSION}) が deno.jsonc の version(${declared}) と不一致。` +
        `src/constants.ts を単一の真実源に、mod.ts / loader は re-export に保ち、deno task bump で同期すること。`,
    );
  }
});
