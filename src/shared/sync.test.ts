import { expect, test } from "bun:test";
import { isSyncKey, syncKey } from "./sync";

test("the same words give the same key, however they are typed", async () => {
  const key = await syncKey("Sunny  sprout\tmorning ");
  expect(isSyncKey(key)).toBe(true);
  expect(await syncKey("sunny sprout morning")).toBe(key);
  expect(await syncKey("sunny sprout evening")).not.toBe(key);
});
