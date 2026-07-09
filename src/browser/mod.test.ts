// browser/mod.ts の単体テスト。fetch と Cache API をモックして、既定バージョン解決・上書き・
// キャッシュヒット/ミス・self-heal（破損キャッシュの取り直し）・整合性検証（fail loud）を検証する。
// 依存ゼロを守るため、テスト用の最小 JTD1 バイト列は format 定数から手組みする。

import { fetchDictionaryBytes, getDictionary, verifyJtd, VERSION } from "./mod.ts";
import {
  fourCC,
  HEADER_BYTES,
  MAGIC,
  SECTION_ALIGN,
  SECTION_ENTRY_BYTES,
} from "../format/constants.ts";
import { crc32Hex } from "../format/crc32.ts";
import { JtdDictionary } from "../dict/dictionary.ts";
import { dictAvailable, dictPath } from "../_dict_path.ts";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

// 既定（引数なし）で fetchDictionaryBytes が取りに行く URL（HF dataset）。VERSION の焼き込みに追従する。
const defaultUrl =
  `https://huggingface.co/datasets/hdae/yomi-dict/resolve/main/naist-jdic-${VERSION}.jtd`;

const align = (n: number) => Math.ceil(n / SECTION_ALIGN) * SECTION_ALIGN;

/**
 * 検証を通る最小の JTD1 を作る。META（checksums 付き）と 1つのダミーセクション DATA。
 * corruptCrc=true のときは checksums をわざと壊し、verifyJtd が throw することを確認する。
 * dataBytes を変えると内容の異なる別の JTD1 を作れる（stale/fresh の区別に使う）。
 */
const buildMinimalJtd = (
  corruptCrc = false,
  dataBytes: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3, 4]),
): Uint8Array<ArrayBuffer> => {
  const dataCrc = crc32Hex(dataBytes);
  const meta = {
    dictName: "test",
    checksums: { DATA: corruptCrc ? "deadbeef" : dataCrc },
  };
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));

  const sections = [
    { name: "META", bytes: metaBytes },
    { name: "DATA", bytes: dataBytes },
  ];
  const tableBytes = HEADER_BYTES + sections.length * SECTION_ENTRY_BYTES;
  let cursor = align(tableBytes);
  const offsets: number[] = [];
  for (const s of sections) {
    offsets.push(cursor);
    cursor = align(cursor + s.bytes.length);
  }

  const out = new Uint8Array(cursor);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, 1, true); // FORMAT_VERSION
  dv.setUint32(8, sections.length, true);
  dv.setUint32(12, 0, true);
  sections.forEach((s, i) => {
    const base = HEADER_BYTES + i * SECTION_ENTRY_BYTES;
    dv.setUint32(base, fourCC(s.name), true);
    dv.setUint32(base + 4, 0, true);
    dv.setUint32(base + 8, offsets[i], true);
    dv.setUint32(base + 12, s.bytes.length, true);
    out.set(s.bytes, offsets[i]);
  });
  return out;
};

/** fetch / caches の最小モックをインストールし、後片付け用の restore を返す。 */
const installMocks = (opts: {
  responseBytes?: Uint8Array<ArrayBuffer>;
  responseOk?: boolean;
}) => {
  const origFetch = globalThis.fetch;
  const origCaches = (globalThis as { caches?: CacheStorage }).caches;

  let fetchCalls = 0;
  const store = new Map<string, Uint8Array<ArrayBuffer>>();

  const cache = {
    match: (req: string) => {
      const hit = store.get(req);
      return Promise.resolve(hit ? new Response(hit) : undefined);
    },
    put: async (req: string, res: Response) => {
      store.set(req, new Uint8Array(await res.arrayBuffer()));
    },
    delete: (req: string) => Promise.resolve(store.delete(req)),
  };
  // Deno の globalThis.caches は getter-only なので直接代入できない。defineProperty で差し替える。
  Object.defineProperty(globalThis, "caches", {
    value: { open: () => Promise.resolve(cache) },
    configurable: true,
    writable: true,
  });

  globalThis.fetch = ((_input: string) => {
    fetchCalls++;
    const body: Uint8Array<ArrayBuffer> = opts.responseBytes ?? new Uint8Array();
    return Promise.resolve(
      new Response(body, {
        status: opts.responseOk === false ? 404 : 200,
      }),
    );
  }) as typeof fetch;

  return {
    fetchCalls: () => fetchCalls,
    store,
    restore: () => {
      globalThis.fetch = origFetch;
      Object.defineProperty(globalThis, "caches", {
        value: origCaches,
        configurable: true,
        writable: true,
      });
    },
  };
};

Deno.test("verifyJtd: 壊れた magic は throw する（fail loud）", () => {
  const garbage = new Uint8Array(64); // magic=0
  let threw = false;
  try {
    verifyJtd(garbage);
  } catch {
    threw = true;
  }
  assert(threw, "壊れたバイト列を通してしまった");
});

Deno.test("verifyJtd: CRC 不一致は throw する", () => {
  const bad = buildMinimalJtd(true);
  let threw = false;
  try {
    verifyJtd(bad);
  } catch {
    threw = true;
  }
  assert(threw, "CRC 破損を通してしまった");
});

Deno.test("verifyJtd: 正常な JTD1 は通る", () => {
  verifyJtd(buildMinimalJtd()); // throw しなければ OK
});

Deno.test("fetchDictionaryBytes: 既定は自身の VERSION の辞書を HF から取得する", async () => {
  const valid = buildMinimalJtd();
  const mocks = installMocks({ responseBytes: valid });
  try {
    const bytes = await fetchDictionaryBytes();
    assert(bytes.byteLength === valid.byteLength, "返り値サイズ不一致");
    assert(mocks.fetchCalls() === 1, "fetch が1回呼ばれていない");
    assert(mocks.store.has(defaultUrl), `既定 URL(${defaultUrl}) で取得・保存していない`);
  } finally {
    mocks.restore();
  }
});

Deno.test("fetchDictionaryBytes: version を上書きできる", async () => {
  const valid = buildMinimalJtd();
  const mocks = installMocks({ responseBytes: valid });
  try {
    await fetchDictionaryBytes({ version: "9.9.9" });
    assert(
      mocks.store.has(
        "https://huggingface.co/datasets/hdae/yomi-dict/resolve/main/naist-jdic-9.9.9.jtd",
      ),
      "version 上書きが URL に反映されていない",
    );
  } finally {
    mocks.restore();
  }
});

Deno.test("fetchDictionaryBytes: url を上書きできる（{version} は version に解決）", async () => {
  const valid = buildMinimalJtd();
  const mocks = installMocks({ responseBytes: valid });
  try {
    await fetchDictionaryBytes({ url: "https://example.test/d-{version}.jtd", version: "1.2.3" });
    assert(mocks.store.has("https://example.test/d-1.2.3.jtd"), "url 上書きが効いていない");
  } finally {
    mocks.restore();
  }
});

Deno.test("fetchDictionaryBytes: キャッシュヒット時は fetch しない", async () => {
  const valid = buildMinimalJtd();
  const mocks = installMocks({});
  mocks.store.set(defaultUrl, valid);
  try {
    const bytes = await fetchDictionaryBytes();
    assert(bytes.byteLength === valid.byteLength, "返り値サイズ不一致");
    assert(mocks.fetchCalls() === 0, "キャッシュヒットなのに fetch した");
  } finally {
    mocks.restore();
  }
});

Deno.test("fetchDictionaryBytes: 破損キャッシュは evict して network から取り直す（self-heal）", async () => {
  const corrupt = buildMinimalJtd(true); // CRC 破損した stale キャッシュ
  const valid = buildMinimalJtd(false, new Uint8Array([9, 9, 9, 9]));
  const mocks = installMocks({ responseBytes: valid });
  mocks.store.set(defaultUrl, corrupt);
  try {
    const bytes = await fetchDictionaryBytes();
    assert(mocks.fetchCalls() === 1, "破損キャッシュなのに network から取り直していない");
    verifyJtd(bytes); // 返り値は valid（throw しない）
    const nowCached = mocks.store.get(defaultUrl);
    if (nowCached === undefined) throw new Error("取り直した辞書がキャッシュされていない");
    verifyJtd(nowCached); // キャッシュが corrupt から valid に置き換わっている
  } finally {
    mocks.restore();
  }
});

Deno.test("fetchDictionaryBytes: HTTP エラーは throw する（fail loud）", async () => {
  const mocks = installMocks({ responseOk: false });
  let threw = false;
  try {
    await fetchDictionaryBytes({
      url: "https://example.test/missing-{version}.jtd",
      version: "1.0.0",
    });
  } catch {
    threw = true;
  } finally {
    mocks.restore();
  }
  assert(threw, "HTTP 404 を通してしまった");
});

Deno.test("fetchDictionaryBytes: network の破損は throw し、壊れたものをキャッシュしない", async () => {
  const corrupt = buildMinimalJtd(true);
  const mocks = installMocks({ responseBytes: corrupt });
  let threw = false;
  try {
    await fetchDictionaryBytes({ url: "https://example.test/c-{version}.jtd", version: "1.0.0" });
  } catch {
    threw = true;
  } finally {
    mocks.restore();
  }
  assert(threw, "破損した取得物を通してしまった");
  assert(!mocks.store.has("https://example.test/c-1.0.0.jtd"), "壊れたものをキャッシュした");
});

// getDictionary は fetchDictionaryBytes + JtdDictionary.load の薄いラッパ。実 fixture を
// fetch モックで返し、返り値が JtdDictionary（メタ・trie 付き）になることを確認する
// （最小ダミー JTD1 は load できないため、実辞書が無い環境では skip。src/_dict_path.ts）。
const dictExists = dictAvailable();

Deno.test({
  name: "getDictionary(実辞書): fetch をモックし JtdDictionary を返す",
  ignore: !dictExists,
  async fn() {
    const fixture = Deno.readFileSync(dictPath());
    const mocks = installMocks({ responseBytes: fixture });
    try {
      const dict = await getDictionary({ version: "test", cacheName: "yomi-dict-test" });
      assert(dict instanceof JtdDictionary, "JtdDictionary を返していない");
      assert(dict.meta.dictName.length > 0, "meta.dictName が空");
      assert(dict.trie.surfaceCount > 0, "trie が空");
    } finally {
      mocks.restore();
    }
  },
});
