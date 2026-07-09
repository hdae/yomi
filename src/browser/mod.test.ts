// browser/mod.ts の単体テスト。fetch と Cache API をモックして、既定 revision 解決・上書き・
// 不変 SHA のキャッシュ / 可変 ref（main）の SHA 解決＋キャッシュ・self-heal・gzip 自動解凍・整合性検証
// （fail loud）を検証する。依存ゼロを守るため、テスト用の最小 JTD1 バイト列は format 定数から手組みする。

import { fetchDictionaryBytes, getDictionary, verifyJtd } from "./mod.ts";
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

// 不変（キャッシュされる）revision を作るヘルパ（40桁 hex の SHA を模す）。
const sha = (c: string) => c.repeat(40);

// 既定（引数なし）で取りに行く URL の形（HF dataset・gzip・不変 revision で固定）。
// 焼き込み SHA そのものには依存させない（辞書差し替えで SHA が変わってもテストは壊れない）。
const defaultUrlPattern =
  /^https:\/\/huggingface\.co\/datasets\/hdae\/yomi-dict\/resolve\/[0-9a-f]{7,64}\/naist-jdic\.jtd\.gz$/;

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

/** バイト列を gzip 圧縮する（CompressionStream。取得物 gzip の自動解凍テスト用）。 */
const gzipBytes = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
  const body = new Response(data).body;
  if (body === null) throw new Error("空ストリーム");
  const out = body.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(out).arrayBuffer());
};

/** fetch / caches の最小モックをインストールし、後片付け用の restore を返す。 */
const installMocks = (opts: {
  responseBytes?: Uint8Array<ArrayBuffer>;
  responseOk?: boolean;
  /** HF revision API（/api/datasets/…/revision/…）が返す SHA。可変 ref の解決テスト用。 */
  revisionSha?: string;
}) => {
  const origFetch = globalThis.fetch;
  const origCaches = (globalThis as { caches?: CacheStorage }).caches;

  const fetchedUrls: string[] = [];
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

  globalThis.fetch = ((input: string) => {
    fetchedUrls.push(input);
    // HF の revision 解決 API（/api/datasets/…/revision/{ref}）は JSON {sha} を返す。
    if (input.includes("/api/datasets/") && input.includes("/revision/")) {
      return Promise.resolve(
        new Response(JSON.stringify({ sha: opts.revisionSha ?? "" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    const body: Uint8Array<ArrayBuffer> = opts.responseBytes ?? new Uint8Array();
    return Promise.resolve(
      new Response(body, {
        status: opts.responseOk === false ? 404 : 200,
      }),
    );
  }) as typeof fetch;

  return {
    fetchCalls: () => fetchedUrls.length,
    fetchedUrls,
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

Deno.test("fetchDictionaryBytes: 既定は焼き込み revision の HF gzip URL を取得しキャッシュする", async () => {
  const valid = buildMinimalJtd();
  const mocks = installMocks({ responseBytes: valid });
  try {
    const bytes = await fetchDictionaryBytes();
    assert(bytes.byteLength === valid.byteLength, "返り値サイズ不一致");
    assert(mocks.fetchCalls() === 1, "fetch が1回呼ばれていない");
    assert(
      defaultUrlPattern.test(mocks.fetchedUrls[0]),
      `既定 URL が想定形と不一致: ${mocks.fetchedUrls[0]}`,
    );
    // 既定 revision は不変 SHA なのでキャッシュされる。
    const keys = [...mocks.store.keys()];
    assert(keys.length === 1 && defaultUrlPattern.test(keys[0]), "既定はキャッシュされるべき");
  } finally {
    mocks.restore();
  }
});

Deno.test("fetchDictionaryBytes: 不変 SHA の revision はそのまま URL に反映される（解決なし）", async () => {
  const valid = buildMinimalJtd();
  const revision = sha("f");
  const mocks = installMocks({ responseBytes: valid });
  try {
    await fetchDictionaryBytes({ revision });
    assert(
      mocks.fetchedUrls[0] ===
        `https://huggingface.co/datasets/hdae/yomi-dict/resolve/${revision}/naist-jdic.jtd.gz`,
      `不変 SHA が URL に反映されていない: ${mocks.fetchedUrls[0]}`,
    );
    // 不変 SHA は revision 解決 API を叩かない。
    assert(
      mocks.fetchedUrls.every((u) => !u.includes("/revision/")),
      "不変 SHA なのに API を叩いた",
    );
  } finally {
    mocks.restore();
  }
});

Deno.test("fetchDictionaryBytes: url を上書きできる（{revision} は revision に解決）", async () => {
  const valid = buildMinimalJtd();
  const mocks = installMocks({ responseBytes: valid });
  try {
    await fetchDictionaryBytes({ url: "https://example.test/d-{revision}.jtd", revision: "1.2.3" });
    assert(mocks.fetchedUrls[0] === "https://example.test/d-1.2.3.jtd", "url 上書きが効いていない");
  } finally {
    mocks.restore();
  }
});

Deno.test("fetchDictionaryBytes: 取得物が gzip なら解凍して検証する（先頭バイト自動判定）", async () => {
  const valid = buildMinimalJtd();
  const gz = await gzipBytes(valid);
  const mocks = installMocks({ responseBytes: gz });
  const revision = sha("a"); // 不変 SHA＝キャッシュされる
  const resolved = `https://example.test/g-${revision}.jtd.gz`;
  try {
    const bytes = await fetchDictionaryBytes({
      url: "https://example.test/g-{revision}.jtd.gz",
      revision,
    });
    verifyJtd(bytes); // 返り値は解凍済みの生 JTD1（gz ではない）
    assert(bytes.byteLength === valid.byteLength, "解凍後サイズ不一致");
    assert(bytes[0] === valid[0] && bytes[1] === valid[1], "解凍内容が元と不一致");
    // キャッシュには取得物（gzip）が保存される（小さい）。
    const cached = mocks.store.get(resolved);
    if (cached === undefined) throw new Error("gz がキャッシュされていない");
    assert(cached[0] === 0x1f && cached[1] === 0x8b, "キャッシュが gzip でない");
  } finally {
    mocks.restore();
  }
});

Deno.test("fetchDictionaryBytes: 不変 SHA はキャッシュヒット時に fetch しない", async () => {
  const valid = buildMinimalJtd();
  const mocks = installMocks({});
  const revision = sha("b");
  mocks.store.set(`https://example.test/hit-${revision}.jtd`, valid);
  try {
    const bytes = await fetchDictionaryBytes({
      url: "https://example.test/hit-{revision}.jtd",
      revision,
    });
    assert(bytes.byteLength === valid.byteLength, "返り値サイズ不一致");
    assert(mocks.fetchCalls() === 0, "キャッシュヒットなのに fetch した");
  } finally {
    mocks.restore();
  }
});

Deno.test("fetchDictionaryBytes: 可変 ref（main）は SHA 解決して SHA でキャッシュする（効率的な最新取得）", async () => {
  const valid = buildMinimalJtd();
  const resolvedSha = sha("e");
  const mocks = installMocks({ responseBytes: valid, revisionSha: resolvedSha });
  const dictUrl =
    `https://huggingface.co/datasets/hdae/yomi-dict/resolve/${resolvedSha}/naist-jdic.jtd.gz`;
  try {
    await fetchDictionaryBytes({ revision: "main" }); // 1回目: API 解決 + dict 取得 + キャッシュ
    await fetchDictionaryBytes({ revision: "main" }); // 2回目: API 解決 + dict はキャッシュヒット
    // API（revision 解決）は毎回叩く（最新確認）。dict 本体は SHA が同じなので1回だけ DL。
    const apiCalls = mocks.fetchedUrls.filter((u) => u.includes("/revision/")).length;
    const dictCalls = mocks.fetchedUrls.filter((u) => u === dictUrl).length;
    assert(apiCalls === 2, `revision API は毎回叩くはず: ${apiCalls}`);
    assert(dictCalls === 1, `dict 本体は SHA 固定でキャッシュされ1回のみ DL のはず: ${dictCalls}`);
    // dict は解決した SHA の URL でのみキャッシュされる（API 応答はキャッシュしない）。
    assert(mocks.store.has(dictUrl), "dict が解決 SHA でキャッシュされていない");
    assert(mocks.store.size === 1, "API 応答をキャッシュしてはいけない");
  } finally {
    mocks.restore();
  }
});

Deno.test("fetchDictionaryBytes: 破損キャッシュは evict して network から取り直す（self-heal）", async () => {
  const corrupt = buildMinimalJtd(true); // CRC 破損した stale キャッシュ
  const valid = buildMinimalJtd(false, new Uint8Array([9, 9, 9, 9]));
  const mocks = installMocks({ responseBytes: valid });
  const revision = sha("c");
  const resolved = `https://example.test/heal-${revision}.jtd`;
  mocks.store.set(resolved, corrupt);
  try {
    const bytes = await fetchDictionaryBytes({
      url: "https://example.test/heal-{revision}.jtd",
      revision,
    });
    assert(mocks.fetchCalls() === 1, "破損キャッシュなのに network から取り直していない");
    verifyJtd(bytes); // 返り値は valid（throw しない）
    const nowCached = mocks.store.get(resolved);
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
      url: "https://example.test/missing-{revision}.jtd",
      revision: "1",
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
  const revision = sha("d"); // 不変 SHA でもキャッシュ前に検証で弾く
  const resolved = `https://example.test/c-${revision}.jtd`;
  let threw = false;
  try {
    await fetchDictionaryBytes({ url: "https://example.test/c-{revision}.jtd", revision });
  } catch {
    threw = true;
  } finally {
    mocks.restore();
  }
  assert(threw, "破損した取得物を通してしまった");
  assert(!mocks.store.has(resolved), "壊れたものをキャッシュした");
});

// getDictionary は fetchDictionaryBytes + JtdDictionary.load の薄いラッパ。実 fixture（生 JTD1）を
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
      const dict = await getDictionary({ revision: sha("0"), cacheName: "yomi-dict-test" });
      assert(dict instanceof JtdDictionary, "JtdDictionary を返していない");
      assert(dict.meta.dictName.length > 0, "meta.dictName が空");
      assert(dict.trie.surfaceCount > 0, "trie が空");
    } finally {
      mocks.restore();
    }
  },
});
