import { expect, test } from "bun:test";
import { buildFeed } from "./aggregate";
import type { Collection } from "./collection";
import type { RawItem } from "./feed-xml";
import type { ProviderRegistry } from "./providers";

const now = new Date("2026-11-11T00:00:00Z");

const raw = (id: string, title: string, daysAgo: number, summary?: string): RawItem => ({
  id,
  title,
  summary,
  url: `https://example.com/${id}`,
  publishedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
});

const noProvider = async (): Promise<RawItem[]> => {
  throw new Error("no bridge configured");
};

const registry = (rss: RawItem[]): ProviderRegistry => ({
  rss: async () => rss,
  youtube: noProvider,
  substack: noProvider,
  bluesky: noProvider,
  mastodon: noProvider,
  website: noProvider,
  twitter: noProvider,
  facebook: noProvider,
  archive: noProvider,
});

const collection: Collection = {
  name: "Faves",
  mute: ["politics", "AI psychosis"],
  entries: [{ name: "Ink", tags: ["HCI"], sources: { rss: "https://example.com/feed", twitter: "https://x.com/ink" } }],
};

test("drops muted items case-insensitively by title or summary", async () => {
  const feed = await buildFeed(
    [collection],
    registry([
      raw("a", "Local-first software", 1),
      raw("b", "Thoughts on POLITICS", 2),
      raw("c", "A calm essay", 3, "On the rise of ai psychosis"),
    ]),
    now,
  );
  expect(feed.items.map((item) => item.title)).toEqual(["Local-first software"]);
});

test("stamps author, kind and tags, keeps every item however old, and collects provider errors", async () => {
  const feed = await buildFeed([collection], registry([raw("old", "Ancient", 4000), raw("new", "Fresh", 0)]), now);
  expect(feed.items).toEqual([
    expect.objectContaining({ title: "Fresh", kind: "rss", author: "Ink", tags: ["HCI"] }),
    expect.objectContaining({ title: "Ancient" }),
  ]);
  expect(feed.tags).toEqual(["HCI"]);
  expect(feed.kinds).toEqual(["rss"]);
  expect(feed.errors).toEqual([{ entry: "Ink", kind: "twitter", message: "no bridge configured" }]);
});

test("keeps every item a source publishes, newest first", async () => {
  const many = Array.from({ length: 40 }, (_, i) => raw(`i${i}`, `Post ${i}`, i));
  const feed = await buildFeed([collection], registry(many), now);
  expect(feed.items).toHaveLength(40);
  expect(feed.items[0]!.title).toBe("Post 0");
});

test("merges the same post from RSS and an archive page, keeping the richer copy", async () => {
  const withArchive: Collection = {
    name: "Faves",
    mute: [],
    entries: [{ name: "Geoffrey", tags: [], sources: { rss: "https://example.com/feed.xml" }, archive: "https://example.com/" }],
  };
  const providers = {
    ...registry([{ id: "rss-1", title: "Code like a surgeon", url: "https://example.com/2025/10/24/code-like-a-surgeon.html", summary: "From RSS", publishedAt: "2025-10-24T10:00:00.000Z" }]),
    archive: async () => [
      { id: "a-1", title: "Code like a surgeon", url: "https://www.example.com/2025/10/24/code-like-a-surgeon", publishedAt: "2025-10-24T12:00:00.000Z" },
      { id: "a-2", title: "An older essay", url: "https://www.example.com/2015/01/01/older", summary: "From the archive", publishedAt: "2015-01-01T12:00:00.000Z" },
    ],
  };
  const feed = await buildFeed([withArchive], providers, now);
  expect(feed.items.map((item) => [item.title, item.kind, item.summary])).toEqual([
    ["Code like a surgeon", "rss", "From RSS"],
    ["An older essay", "rss", "From the archive"],
  ]);
});

test("posts that differ only by query string stay separate", async () => {
  const videos = [
    { id: "v1", title: "One", url: "https://www.youtube.com/watch?v=aaa", publishedAt: "2026-11-01T00:00:00.000Z" },
    { id: "v2", title: "Two", url: "https://www.youtube.com/watch?v=bbb", publishedAt: "2026-11-02T00:00:00.000Z" },
  ];
  const feed = await buildFeed([collection], registry(videos), now);
  expect(feed.items.map((item) => item.title)).toEqual(["Two", "One"]);
});

test("fetches a source listed by two collections once, merging tags and mute words", async () => {
  let calls = 0;
  const providers = {
    ...registry([]),
    rss: async () => {
      calls++;
      return [raw("a", "Local-first software", 1), raw("b", "Election night", 2), raw("c", "Crypto again", 3)];
    },
  };
  const mine: Collection = { name: "Mine", mute: ["election"], entries: [{ name: "Ink", tags: ["HCI"], sources: { rss: "https://example.com/feed" } }] };
  const friend: Collection = { name: "Friend", mute: ["crypto"], entries: [{ name: "Ink", tags: ["Design"], sources: { rss: "https://www.example.com/feed/" } }] };
  const feed = await buildFeed([mine, friend], providers, now);
  expect(calls).toBe(1);
  expect(feed.items).toEqual([expect.objectContaining({ title: "Local-first software", author: "Ink", tags: ["HCI", "Design"] })]);
});
