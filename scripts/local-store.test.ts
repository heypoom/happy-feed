import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalR2Store } from "./local-store";

let dir: string;
let store: LocalR2Store;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "local-r2-"));
  store = await LocalR2Store.open("bucket", { state: [dir] });
}, 60_000);
afterAll(async () => {
  await store.close();
  await rm(dir, { recursive: true, force: true });
});

test("puts, gets, lists and deletes objects in one local runtime", async () => {
  await store.put("sources/a.json", { a: 1 });
  await store.put("sources/b.json", { b: 2 });
  await store.put("feed/c.json", { c: 3 });
  expect(await store.get("sources/a.json")).toEqual({ a: 1 });
  expect((await store.list("sources/")).map((object) => object.key).sort()).toEqual(["sources/a.json", "sources/b.json"]);
  await store.delete("sources/a.json");
  expect(await store.get("sources/a.json")).toBeUndefined();
  await store.delete("sources/a.json");
});

test("a request that never answers is tried again, then fails with the key", async () => {
  const silent = await LocalR2Store.open("bucket", { helper: "scripts/fixtures/silent-r2.mjs", timeoutMs: 300 });
  const started = Date.now();
  await expect(silent.get("sources/a.json")).rejects.toThrow("local R2 get sources/a.json timed out after 0.3s");
  expect(Date.now() - started).toBeLessThan(2000);
  await silent.close();
});
