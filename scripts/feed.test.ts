import { expect, test } from "bun:test";
import type { Feed, FeedItem, Manifest } from "../src/shared/types";
import type { Collection } from "./collection";
import type { RawItem } from "./feed-xml";
import type { Depth, ProviderRegistry } from "./providers";
import { MANIFEST_PATH, publish } from "./publish";
import { mergeSources, recordPath, refresh, type SourceRecord } from "./sources";
import { MemoryStore } from "./store";

const DAY = 86_400_000;
const now = new Date("2026-11-11T00:00:00Z");

const raw = (id: string, title: string, daysAgo: number, summary?: string): RawItem => ({
  id,
  title,
  summary,
  url: `https://example.com/${id}`,
  publishedAt: new Date(now.getTime() - daysAgo * DAY).toISOString(),
});
const at = (id: string, publishedAt: string): RawItem => ({ id, title: id, url: `https://example.com/${id}`, publishedAt });

const noProvider = async (): Promise<RawItem[]> => {
  throw new Error("no bridge configured");
};

const registry = (rss: ProviderRegistry["rss"] | RawItem[]): ProviderRegistry => ({
  rss: Array.isArray(rss) ? async () => rss : rss,
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
const rssOnly: Collection = { name: "Faves", mute: [], entries: [{ name: "Ink", tags: ["HCI"], sources: { rss: "https://example.com/feed" } }] };

// A store whose clock the test moves, as a cron run hours or days later would see it.
function clockedStore(start = now) {
  const clock = { now: start };
  return { clock, store: new MemoryStore(() => clock.now) };
}

// Refreshes and publishes, then reads the feed back the way the client does: the manifest, then every chunk.
async function build(collections: Collection[], providers: ProviderRegistry, when = now, store = new MemoryStore(() => when)): Promise<Feed & { manifest: Manifest }> {
  const sources = mergeSources(collections);
  await refresh(sources, { store, providers, now: when });
  const { manifest } = await publish(sources, { store, now: when });
  const items = (await Promise.all(manifest.chunks.map((chunk) => store.get<FeedItem[]>(chunk.path)))).flatMap((chunk) => chunk ?? []);
  const { chunks: _, ...feed } = manifest;
  return { ...feed, items, manifest };
}

const recordOf = (store: MemoryStore, collections = [rssOnly]) => store.get<SourceRecord>(recordPath(mergeSources(collections)[0]!.key));

test("drops muted items case-insensitively by title or summary", async () => {
  const feed = await build(
    [collection],
    registry([raw("a", "Local-first software", 1), raw("b", "Thoughts on POLITICS", 2), raw("c", "A calm essay", 3, "On the rise of ai psychosis")]),
  );
  expect(feed.items.map((item) => item.title)).toEqual(["Local-first software"]);
});

test("stamps author, kind and tags, keeps every item however old, and collects provider errors", async () => {
  const feed = await build([collection], registry([raw("old", "Ancient", 4000), raw("new", "Fresh", 0)]));
  expect(feed.items).toEqual([
    expect.objectContaining({ id: "rss:new", title: "Fresh", kind: "rss", author: "Ink", tags: ["HCI"] }),
    expect.objectContaining({ id: "rss:old", title: "Ancient" }),
  ]);
  expect(feed.tags).toEqual(["HCI"]);
  expect(feed.kinds).toEqual(["rss"]);
  expect(feed.errors).toEqual([{ entry: "Ink", kind: "twitter", message: "no bridge configured" }]);
});

test("keeps every item a source publishes, newest first", async () => {
  const many = Array.from({ length: 40 }, (_, i) => raw(`i${i}`, `Post ${i}`, i * 30));
  const feed = await build([collection], registry(many));
  expect(feed.items).toHaveLength(40);
  expect(feed.items.map((item) => item.title)).toEqual(many.map((item) => item.title));
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
  const feed = await build([withArchive], providers);
  expect(feed.items.map((item) => [item.id, item.title, item.kind, item.summary])).toEqual([
    ["rss:rss-1", "Code like a surgeon", "rss", "From RSS"],
    ["rss:a-2", "An older essay", "rss", "From the archive"],
  ]);
});

test("posts that differ only by query string stay separate", async () => {
  const videos = [
    { id: "v1", title: "One", url: "https://www.youtube.com/watch?v=aaa", publishedAt: "2026-11-01T00:00:00.000Z" },
    { id: "v2", title: "Two", url: "https://www.youtube.com/watch?v=bbb", publishedAt: "2026-11-02T00:00:00.000Z" },
  ];
  const feed = await build([collection], registry(videos));
  expect(feed.items.map((item) => item.title)).toEqual(["Two", "One"]);
});

test("fetches a source listed by two collections once, merging tags and mute words", async () => {
  let calls = 0;
  const providers = registry(async () => {
    calls++;
    return [raw("a", "Local-first software", 1), raw("b", "Election night", 2), raw("c", "Crypto again", 3)];
  });
  const mine: Collection = { name: "Mine", mute: ["election"], entries: [{ name: "Ink", tags: ["HCI"], sources: { rss: "https://example.com/feed" } }] };
  const friend: Collection = { name: "Friend", mute: ["crypto"], entries: [{ name: "Ink", tags: ["Design"], sources: { rss: "https://www.example.com/feed/" } }] };
  const feed = await build([mine, friend], providers);
  expect(calls).toBe(1);
  expect(feed.items).toEqual([expect.objectContaining({ title: "Local-first software", author: "Ink", tags: ["HCI", "Design"] })]);
});

test("refreshing twice with the same answer leaves the same record", async () => {
  const store = new MemoryStore();
  const providers = registry([raw("a", "One", 1), raw("b", "Two", 2)]);
  await refresh(mergeSources([rssOnly]), { store, providers, now });
  const first = await recordOf(store);
  await refresh(mergeSources([rssOnly]), { store, providers, now });
  expect(await recordOf(store)).toEqual(first!);
  expect(first!.items.map((item) => item.id)).toEqual(["rss:a", "rss:b"]);
});

test("a source that worked before is read at head depth, and new posts join the stored ones", async () => {
  const store = new MemoryStore();
  const depths: Depth[] = [];
  const answers = [[raw("a", "One", 3), raw("b", "Two", 2)], [raw("c", "Three", 0), raw("b", "Two, edited", 2)]];
  const providers = registry(async (_url, { depth }) => {
    depths.push(depth);
    return answers[depths.length - 1]!;
  });
  await refresh(mergeSources([rssOnly]), { store, providers, now });
  await refresh(mergeSources([rssOnly]), { store, providers, now });
  expect(depths).toEqual(["full", "head"]);
  expect((await recordOf(store))!.items.map((item) => item.title)).toEqual(["Three", "Two, edited", "One"]);
});

test("a failed fetch keeps the stored posts and remembers when the source last worked", async () => {
  const store = new MemoryStore();
  let fail = false;
  const depths: Depth[] = [];
  const providers = registry(async (_url, { depth }) => {
    depths.push(depth);
    if (fail) throw new Error("HTTP 429 from https://example.com/feed");
    return [raw("a", "One", 1)];
  });
  const sources = mergeSources([rssOnly]);
  await refresh(sources, { store, providers, now });
  fail = true;
  const later = new Date(now.getTime() + DAY);
  await refresh(sources, { store, providers, now: later });
  await refresh(sources, { store, providers, now: new Date(later.getTime() + DAY) });

  const record = await recordOf(store);
  expect(record!.items.map((item) => item.title)).toEqual(["One"]);
  expect(record!.status).toEqual({ ok: false, at: new Date(later.getTime() + DAY).toISOString(), message: "HTTP 429 from https://example.com/feed", lastOkAt: now.toISOString() });
  expect(depths).toEqual(["full", "head", "head"]);

  const { manifest } = await publish(sources, { store, now: later });
  expect(manifest.errors).toEqual([{ entry: "Ink", kind: "rss", message: "HTTP 429 from https://example.com/feed" }]);
  expect(manifest.chunks.map((chunk) => chunk.count)).toEqual([1]);
});

test("a source that has never worked is read in full again", async () => {
  const store = new MemoryStore();
  const depths: Depth[] = [];
  const providers = registry(async (_url, { depth }) => {
    depths.push(depth);
    throw new Error("HTTP 503");
  });
  await refresh(mergeSources([rssOnly]), { store, providers, now });
  await refresh(mergeSources([rssOnly]), { store, providers, now });
  expect(depths).toEqual(["full", "full"]);
});

test("stored posts follow the entry's current name, tags and mute words", async () => {
  const store = new MemoryStore();
  await refresh(mergeSources([rssOnly]), { store, providers: registry([raw("a", "Calm", 1), raw("b", "Crypto news", 2)]), now });
  const renamed: Collection = { name: "Faves", mute: ["crypto"], entries: [{ name: "Ink Studio", tags: ["Design"], sources: { rss: "https://example.com/feed" } }] };
  const feed = await build([renamed], registry(noProvider), now, store);
  expect(feed.items).toEqual([expect.objectContaining({ id: "rss:a", author: "Ink Studio", tags: ["Design"] })]);
});

test("a source removed from the collections leaves the feed", async () => {
  const store = new MemoryStore();
  const two: Collection = { ...rssOnly, entries: [...rssOnly.entries, { name: "Gone", tags: [], sources: { rss: "https://gone.example.com/feed" } }] };
  await build([two], registry([raw("a", "One", 1)]), now, store);
  const feed = await build([rssOnly], registry([raw("a", "One", 1)]), now, store);
  expect(feed.items.map((item) => item.author)).toEqual(["Ink"]);
});

test("recent holds everything since the 1st of last month (UTC); older posts split by year", async () => {
  const items = [
    at("oct-first", "2026-10-01T00:00:00.000Z"),
    at("sep-last", "2026-09-30T23:59:59.999Z"),
    at("jan", "2026-01-01T00:00:00.000Z"),
    at("dec", "2025-12-31T23:59:59.999Z"),
    at("ancient", "2009-06-01T00:00:00.000Z"),
    at("today", "2026-11-11T00:00:00.000Z"),
  ];
  const { manifest } = await build([rssOnly], registry(items), new Date("2026-11-12T08:00:00Z"));
  expect(manifest.chunks.map(({ label, count, newest, oldest }) => [label, count, newest, oldest])).toEqual([
    ["recent", 2, "2026-11-11T00:00:00.000Z", "2026-10-01T00:00:00.000Z"],
    ["2026", 2, "2026-09-30T23:59:59.999Z", "2026-01-01T00:00:00.000Z"],
    ["2025", 1, "2025-12-31T23:59:59.999Z", "2025-12-31T23:59:59.999Z"],
    ["2009", 1, "2009-06-01T00:00:00.000Z", "2009-06-01T00:00:00.000Z"],
  ]);

  const january = await build([rssOnly], registry([at("dec-first", "2026-12-01T00:00:00.000Z"), at("nov-last", "2026-11-30T23:59:59.999Z")]), new Date("2027-01-03T00:00:00Z"));
  expect(january.manifest.chunks.map((chunk) => [chunk.label, chunk.count])).toEqual([["recent", 1], ["2026", 1]]);
});

test("a chunk keeps its name while its posts stay the same", async () => {
  const store = new MemoryStore();
  const sources = mergeSources([rssOnly]);
  const posts = [raw("new", "New", 1), raw("old", "Old", 400)];
  await refresh(sources, { store, providers: registry(posts), now });
  const first = await publish(sources, { store, now });
  const again = await publish(sources, { store, now: new Date(now.getTime() + 60 * 60 * 1000) });
  expect(again.manifest.chunks.map((chunk) => chunk.path)).toEqual(first.manifest.chunks.map((chunk) => chunk.path));
  expect(again.changed).toEqual([]);

  await refresh(sources, { store, providers: registry([raw("newer", "Newer", 0)]), now });
  const next = await publish(sources, { store, now });
  const [recent, year] = next.manifest.chunks;
  expect(recent!.path).not.toBe(first.manifest.chunks[0]!.path);
  expect(year!.path).toBe(first.manifest.chunks[1]!.path);
  expect(next.changed).toEqual([recent!.path]);
  expect(recent!.path).toMatch(/^feed\/items-recent-[0-9a-f]{8}\.json$/);
});

test("a reader of the manifest always finds every chunk it names", async () => {
  const { clock, store } = clockedStore();
  const violations: string[] = [];
  const check = async (op: string) => {
    const manifest = await store.get<Manifest>(MANIFEST_PATH);
    for (const chunk of manifest?.chunks ?? []) if (!store.objects.has(chunk.path)) violations.push(`${op}: ${chunk.path}`);
  };
  const put = store.put.bind(store);
  const del = store.delete.bind(store);
  store.put = async (key, value) => (await put(key, value), check(`put ${key}`));
  store.delete = async (key) => (await del(key), check(`delete ${key}`));

  const sources = mergeSources([rssOnly]);
  for (let day = 0; day < 6; day++) {
    clock.now = new Date(now.getTime() + day * DAY);
    await refresh(sources, { store, providers: registry([raw(`d${day}`, `Day ${day}`, -day)]), now: clock.now });
    await publish(sources, { store, now: clock.now });
  }
  expect(violations).toEqual([]);
});

test("an unreferenced chunk is deleted once it is more than two days old", async () => {
  const { clock, store } = clockedStore();
  const sources = mergeSources([rssOnly]);
  const chunkKeys = async () => (await store.list("feed/items-")).map((object) => object.key).sort();

  await refresh(sources, { store, providers: registry([raw("a", "A", 1)]), now });
  const first = (await publish(sources, { store, now })).manifest.chunks[0]!.path;

  clock.now = new Date(now.getTime() + DAY);
  await refresh(sources, { store, providers: registry([raw("b", "B", 0)]), now: clock.now });
  const second = (await publish(sources, { store, now: clock.now })).manifest.chunks[0]!.path;
  expect(await chunkKeys()).toEqual([first, second].sort());

  clock.now = new Date(now.getTime() + 2 * DAY + 60_000);
  await publish(sources, { store, now: clock.now });
  expect(await chunkKeys()).toEqual([second]);
});
