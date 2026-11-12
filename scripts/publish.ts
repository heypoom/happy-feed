import { deckFor } from "../src/shared/order";
import { FORMAT_OF, SOURCE_KINDS, type Chunk, type FeedError, type FeedItem, type Format, type Manifest } from "../src/shared/types";
import { toWire } from "../src/shared/wire";
import { byNewest, dedupe } from "./aggregate";
import { brandWithDeArrow, type DeArrowCache } from "./dearrow";
import { isShort } from "./providers/youtube";
import { recordPath, type Source, type SourceRecord } from "./sources";
import type { Store } from "./store";

export const MANIFEST_PATH = "feed/manifest.json";
const CHUNK_PREFIX = "feed/items-";
const DECK_PREFIX = "feed/deck-";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEARROW_PATH = "state/dearrow.json";
// A reader that fetched the previous manifest may still be loading its chunks.
const KEEP_UNREFERENCED_MS = 2 * DAY_MS;

// Builds the feed from the stored records of today's sources, in collection order so the same copy
// of a duplicated post wins every time.
export async function publish(sources: Source[], { store, now }: { store: Store; now: Date }): Promise<{ manifest: Manifest; changed: string[] }> {
  const records = (await Promise.all(sources.map((source) => store.get<SourceRecord>(recordPath(source.key))))).filter((r) => r !== undefined);
  const dearrow = (await store.get<DeArrowCache>(DEARROW_PATH)) ?? {};
  // No short-form video: Shorts fetched before the provider dropped them are still in the records.
  const kept = dedupe(records.flatMap((record) => record.items)).filter((item) => !isShort(item.url));
  const items = await brandWithDeArrow(kept.sort(byNewest), now, dearrow);
  await store.put(DEARROW_PATH, dearrow);
  const errors = records.flatMap((record): FeedError[] => (record.status.ok ? [] : [{ entry: record.author, kind: record.kind, message: record.status.message }]));
  return await writeFeed(items, errors, { store, now });
}

// Writes the published feed from posts already merged and branded, newest first. Chunks and decks
// are written before the manifest that names them, and old ones are deleted only after it.
// `bun run seed` calls it too, with the posts it downloaded.
export async function writeFeed(items: FeedItem[], errors: FeedError[], { store, now }: { store: Store; now: Date }): Promise<{ manifest: Manifest; changed: string[] }> {
  const chunks: Chunk[] = await Promise.all(
    splitChunks(items, now).map(async ({ label, items }) => {
      const path = await putWire(store, `${CHUNK_PREFIX}${label}`, items);
      return { path, label, count: items.length, newest: items[0]!.publishedAt, oldest: items.at(-1)!.publishedAt };
    }),
  );
  // Every local day on Earth is one of the UTC days either side of now.
  const days = [-1, 0, 1].map((offset) => new Date(now.getTime() + offset * DAY_MS).toISOString().slice(0, 10));
  const decks = Object.fromEntries(await Promise.all(days.map(async (day) => [day, await putWire(store, `${DECK_PREFIX}${day}`, deckFor(items, day))] as const)));
  const totals: Record<Format, number> = { watch: 0, read: 0, post: 0 };
  for (const item of items) totals[FORMAT_OF[item.kind]]++;
  const present = new Set(items.map((item) => item.kind));
  const manifest: Manifest = {
    generatedAt: now.toISOString(),
    tags: [...new Set(items.flatMap((item) => item.tags))].sort(),
    kinds: SOURCE_KINDS.filter((kind) => present.has(kind)),
    errors,
    chunks,
    decks,
    totals,
  };
  const previous = new Set(publishedPaths(await store.get<Manifest>(MANIFEST_PATH)));
  await store.put(MANIFEST_PATH, manifest);

  const referenced = new Set(publishedPaths(manifest));
  for (const prefix of [CHUNK_PREFIX, DECK_PREFIX]) {
    for (const { key, uploaded } of await store.list(prefix)) {
      if (!referenced.has(key) && now.getTime() - uploaded.getTime() > KEEP_UNREFERENCED_MS) await store.delete(key);
    }
  }
  return { manifest, changed: publishedPaths(manifest).filter((path) => !previous.has(path)) };
}

const publishedPaths = (manifest: Manifest | undefined) => [...(manifest?.chunks.map((chunk) => chunk.path) ?? []), ...Object.values(manifest?.decks ?? {})];

// A file's name carries a hash of its content, so an unchanged one keeps its URL and stays cached.
async function putWire(store: Store, name: string, items: FeedItem[]): Promise<string> {
  const wire = items.map(toWire);
  const path = `${name}-${await hash8(JSON.stringify(wire))}.json`;
  await store.put(path, wire);
  return path;
}

// `recent` holds everything since the 1st (UTC) of last month; older posts go in one chunk per year.
// Each list stays newest first, and a chunk with no posts is left out.
export function splitChunks(items: FeedItem[], now: Date): { label: string; items: FeedItem[] }[] {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString();
  const groups = Map.groupBy(items, (item) => (item.publishedAt >= cutoff ? "recent" : item.publishedAt.slice(0, 4)));
  return [...groups]
    .map(([label, items]) => ({ label, items }))
    .sort((a, b) => (a.label === "recent" ? -1 : b.label === "recent" ? 1 : b.label.localeCompare(a.label)));
}

async function hash8(body: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)));
  return [...digest.slice(0, 4)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
