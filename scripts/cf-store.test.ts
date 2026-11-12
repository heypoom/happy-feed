import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CfR2Store } from "./cf-store";

let dir: string;
beforeEach(async () => (dir = await mkdtemp(join(tmpdir(), "fake-cf-"))));
afterEach(() => rm(dir, { recursive: true, force: true }));

const store = (hangs: number) => new CfR2Store("bucket", ["env", `FAKE_CF_DIR=${dir}`, `FAKE_CF_HANGS=${hangs}`, "scripts/fixtures/fake-cf.sh"], 500);
const calls = async () => Number(await readFile(join(dir, "calls"), "utf8"));

test("a CLI call that hangs is killed and tried again", async () => {
  expect(await store(1).get("sources/a.json")).toEqual({ ok: true });
  expect(await calls()).toBe(2);
});

test("a CLI call that keeps hanging fails with the key it was reading", async () => {
  const started = Date.now();
  await expect(store(9).get("sources/a.json")).rejects.toThrow("cf r2 objects get sources/a.json timed out after 0.5s");
  expect(Date.now() - started).toBeLessThan(3000);
});
