import { VERSION } from "./mod.ts";

Deno.test("mod exports a semver-like VERSION", () => {
  // prerelease（0.1.1-0 等）や build metadata も許容する（deno task bump prepatch 等に追従）。
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(VERSION)) {
    throw new Error(`unexpected VERSION: ${VERSION}`);
  }
});
