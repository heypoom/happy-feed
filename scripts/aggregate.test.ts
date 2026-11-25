import { expect, test } from "bun:test";
import type { FeedItem } from "../src/shared/types";
import { dedupe } from "./aggregate";

const post = (id: string, url: string, extra: Partial<FeedItem> = {}): FeedItem => ({
  id,
  url,
  kind: "rss",
  title: "In the days we don't write code",
  publishedAt: "2026-10-20T00:00:00.000Z",
  author: "Chris",
  tags: ["Coding"],
  ...extra,
});

test("keeps one copy of a post that a profile feed and a publication feed tag differently", () => {
  const path = "https://medium.com/chris-dialogue/no-code-359288884f90";
  const kept = dedupe([
    post("rss:a", `${path}?source=rss-b9ef28ff5b74------2`),
    post("rss:b", `${path}?source=rss----fb2b62ca1374---4`, { summary: "From the publication" }),
  ]);
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatchObject({ id: "rss:a", summary: "From the publication" });
});

test("ignores utm_* tracking when deduping", () => {
  expect(dedupe([post("rss:a", "https://example.com/post"), post("rss:b", "https://example.com/post?utm_source=rss&utm_medium=feed")])).toHaveLength(1);
});

test("keeps posts whose real query differs", () => {
  expect(dedupe([post("youtube:a", "https://www.youtube.com/watch?v=a"), post("youtube:b", "https://www.youtube.com/watch?v=b")])).toHaveLength(2);
  expect(dedupe([post("rss:a", "https://example.com/?source=newsletter"), post("rss:b", "https://example.com/?source=blog")])).toHaveLength(2);
});

test("treats two copies with the same id as one post", () => {
  expect(dedupe([post("rss:p/1", "https://chrisza.medium.com/one-1"), post("rss:p/1", "https://medium.com/chris-dialogue/one-1")])).toHaveLength(1);
});
