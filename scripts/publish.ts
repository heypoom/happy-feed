import { SOURCE_KINDS, type Chunk, type FeedError, type FeedItem, type Manifest } from "../src/shared/types";
import { byNewest, dedupe } from "./aggregate";
import { brandWithDeArrow, type DeArrowCache } from "./dearrow";
import { recordPath, type Source, type SourceRecord } from "./sources";
import type { Store } from "./store";

export const MANIFEST_PATH = "feed/manifest.json";
const CHUNK_PREFIX = "feed/items-";
const DEARROW_PATH = "state/dearrow.json";
// A reader that fetched the previous manifest may still be loading its chunks.
const KEEP_UNREFERENCED_MS = 2 * 24 * 60 * 60 * 1000;

// Builds the feed from the stored records of today's sources, in collection order so the same copy
// of a duplicated post wins every time. Chunks are written before the manifest that names them, and
// old chunks are deleted only after it.
export async function publish(sources: Source[], { store, now }: { store: Store; now: Date }): Promise<{ manifest: Manifest; changed: string[] }> {
  const records = (await Promise.all(sources.map((source) => store.get<SourceRecord>(recordPath(source.key))))).filter((r) => r !== undefined);
  const dearrow = (await store.get<DeArrowCache>(DEARROW_PATH)) ?? {};
  const items = await brandWithDeArrow(dedupe(records.flatMap((record) => record.items)).sort(byNewest), now, dearrow);
  await store.put(DEARROW_PATH, dearrow);

  const chunks: Chunk[] = await Promise.all(
    splitChunks(items, now).map(async ({ label, items }) => {
      const path = `${CHUNK_PREFIX}${label}-${await hash8(JSON.stringify(items))}.json`;
      await store.put(path, items);
      return { path, label, count: items.length, newest: items[0]!.publishedAt, oldest: items.at(-1)!.publishedAt };
    }),
  );
  const present = new Set(items.map((item) => item.kind));
  const manifest: Manifest = {
    generatedAt: now.toISOString(),
    tags: [...new Set(items.flatMap((item) => item.tags))].sort(),
    kinds: SOURCE_KINDS.filter((kind) => present.has(kind)),
    errors: records.flatMap((record): FeedError[] => (record.status.ok ? [] : [{ entry: record.author, kind: record.kind, message: record.status.message }])),
    chunks,
  };
  const previous = new Set((await store.get<Manifest>(MANIFEST_PATH))?.chunks.map((chunk) => chunk.path));
  await store.put(MANIFEST_PATH, manifest);

  const referenced = new Set(chunks.map((chunk) => chunk.path));
  for (const { key, uploaded } of await store.list(CHUNK_PREFIX)) {
    if (!referenced.has(key) && now.getTime() - uploaded.getTime() > KEEP_UNREFERENCED_MS) await store.delete(key);
  }
  return { manifest, changed: chunks.map((chunk) => chunk.path).filter((path) => !previous.has(path)) };
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
