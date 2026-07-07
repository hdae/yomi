// 修正辞書オーバーレイの統合テスト（実辞書使用。辞書が無い環境では skip。src/_dict_path.ts）。

import { JtdDictionary } from "./dictionary.ts";
import { analyze } from "./analyze.ts";
import { loadOverlay, OverlayDictionary } from "./overlay.ts";
import { dictAvailable, dictPath } from "./_dict_path.ts";

const dictExists = dictAvailable();

const loadDict = (() => {
  let cached: JtdDictionary | undefined;
  return () => {
    if (!cached) {
      const bytes = Deno.readFileSync(dictPath());
      cached = JtdDictionary.load(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        { verifyChecksums: false },
      );
    }
    return cached;
  };
})();

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const phraseOf = (dict: JtdDictionary, text: string, overlay?: OverlayDictionary) =>
  analyze(dict, text, overlay).accentPhrases
    .map((p) => p.moras.map((m) => m.kana).join("") + ":" + p.accentNucleus)
    .join("|");

Deno.test({
  name: "overlay: 未知語に読みとアクセントを与える（誤読→修正エントリ1行のループ）",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    const text = "グーグリフィケーションを試す";
    // 修正前: 未知語カタカナはフィラー化され、核はデフォルト規則の値（8ではない）になる。
    const before = phraseOf(dict, text);
    assert(
      before.startsWith("グーグリフィケーションヲ:") &&
        !before.startsWith("グーグリフィケーションヲ:8"),
      `前提が崩れた（辞書に登録された?）: ${before}`,
    );

    const overlay = loadOverlay(
      dict,
      JSON.stringify([
        { surface: "グーグリフィケーション", reading: "グーグリフィケーション", accentType: 8 },
      ]),
    );
    const after = phraseOf(dict, text, overlay);
    assert(
      after.startsWith("グーグリフィケーションヲ:8"),
      `修正後に核が反映されない: ${after}`,
    );
  },
});

Deno.test({
  name: "overlay: 本辞書の読みを上書きし、結合規則もアクセント句計算に参加する",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    const text = "東京に行く";
    assert(phraseOf(dict, text).startsWith("トーキョーニ:0"), "前提: 東京=トーキョー平板");

    const overlay = loadOverlay(
      dict,
      JSON.stringify([
        {
          surface: "東京",
          reading: "トキオ",
          accentType: 1,
          pos: ["名詞", "固有名詞", "地域", "一般"],
        },
      ]),
    );
    const after = phraseOf(dict, text, overlay);
    assert(after.startsWith("トキオニ:1"), `上書きが効いていない: ${after}`);
  },
});

Deno.test({
  name: "overlay: ホットリロード = 新しいインスタンスへの差し替えで即反映",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    const v1 = new OverlayDictionary(dict, [
      { surface: "東京", reading: "トキオ", accentType: 1 },
    ]);
    const v2 = new OverlayDictionary(dict, [
      { surface: "東京", reading: "トンキン", accentType: 1 },
    ]);
    assert(phraseOf(dict, "東京", v1).startsWith("トキオ:1"), "v1");
    assert(phraseOf(dict, "東京", v2).startsWith("トンキン:1"), "v2 への差し替えが反映されない");
    assert(phraseOf(dict, "東京").startsWith("トーキョー:0"), "overlay なしは元のまま");
  },
});

Deno.test({
  name: "overlay: 壊れたエントリは fail loudly（未正規化表層・核範囲外・未知品詞）",
  ignore: !dictExists,
  fn() {
    const dict = loadDict();
    const throws = (entries: unknown[]) => {
      try {
        new OverlayDictionary(dict, entries as never);
        return false;
      } catch {
        return true;
      }
    };
    assert(
      throws([{ surface: "ABC", reading: "エービーシー", accentType: 0 }]),
      "半角英字（未正規化）を通してしまう",
    );
    assert(throws([{ surface: "堂々", reading: "ドードー", accentType: 5 }]), "核範囲外を通す");
    assert(
      throws([{ surface: "堂々", reading: "ドードー", accentType: 1, pos: ["存在しない品詞"] }]),
      "未知品詞を通す",
    );
  },
});
