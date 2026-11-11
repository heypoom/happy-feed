import { expect, test } from "bun:test";
import type { RawItem } from "../feed-xml";
import { paged } from "./paged";

const post = (id: string): RawItem => ({ id, title: id, url: `https://example.com/${id}`, publishedAt: "2026-11-01T00:00:00.000Z" });

test("keeps the pages fetched before a later page fails", async () => {
  const items = await paged<number>(undefined, async (cursor = 0) => {
    if (cursor === 2) throw new Error("HTTP 429");
    return { items: [post(`p${cursor}`)], next: cursor + 1 };
  });
  expect(items.map((item) => item.id)).toEqual(["p0", "p1"]);
});

test("throws when the first page fails, so the caller can fall back to RSS", async () => {
  await expect(
    paged(undefined, async () => {
      throw new Error("HTTP 429");
    }),
  ).rejects.toThrow("HTTP 429");
});
