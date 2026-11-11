import { Glob } from "bun";
import { mkdir } from "node:fs/promises";
import type { Feed, FeedItem } from "../src/shared/types";
import { parseCollection } from "./collection";
import { createProviders } from "./providers";
import { publish } from "./publish";
import { mergeSources, refresh } from "./sources";
import { MemoryStore } from "./store";

const collections = await Promise.all(
  Array.from(new Glob("collection/*.json").scanSync("."))
    .sort()
    .map(async (file) => parseCollection(await Bun.file(file).json(), file)),
);

const store = new MemoryStore();
const caches = { "state/youtube-ids.json": "youtube-ids", "state/archive-pages.json": "archive-pages", "state/dearrow.json": "dearrow" };
for (const [key, name] of Object.entries(caches)) {
  const cached = await Bun.file(`.cache/${name}.json`)
    .json()
    .catch(() => undefined);
  if (cached) await store.put(key, cached);
}

const sources = mergeSources(collections);
const now = new Date();
await refresh(sources, { store, providers: createProviders(process.env), now });
const { manifest } = await publish(sources, { store, now });
const { chunks, ...rest } = manifest;
const feed: Feed = { ...rest, items: (await Promise.all(chunks.map((chunk) => store.get<FeedItem[]>(chunk.path)))).flatMap((items) => items ?? []) };
await Bun.write("public/feed.json", JSON.stringify(feed));
await mkdir(".cache", { recursive: true });
for (const [key, name] of Object.entries(caches)) await Bun.write(`.cache/${name}.json`, JSON.stringify(await store.get(key)));

const counts = Map.groupBy(feed.items, (item) => `${item.author} (${item.kind})`);
for (const [source, items] of counts) console.log(`${String(items.length).padStart(4)}  ${source}`);
for (const error of feed.errors) console.warn(`  skip  ${error.entry} (${error.kind}): ${error.message}`);
console.log(`wrote public/feed.json with ${feed.items.length} items, ${feed.errors.length} errors`);
