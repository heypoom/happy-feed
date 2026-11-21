// Copies the published feed from feed.poom.dev into the local R2 bucket that `bun run dev` serves.
// It reads only the published manifest and chunks, so unlike `bun run refresh -- --local` it never
// fetches the sources themselves. The posts go through the same writer as a publish, so the local
// bucket holds what this checkout would publish, with each post's tags taken from this checkout's
// collection, so a retag shows up locally before it is deployed. Run it again for newer data.
import { Glob } from "bun";
import type { Manifest } from "../src/shared/types";
import { fromWire, type WireItem } from "../src/shared/wire";
import { BUCKET } from "./cf-store";
import { parseCollection } from "./collection";
import { LocalR2Store } from "./local-store";
import { writeFeed } from "./publish";
import { mergeSources } from "./sources";

const ORIGIN = "https://feed.poom.dev";

const manifest = await download<Manifest>("feed/manifest.json");
const chunks = await Promise.all(manifest.chunks.map((chunk) => download<WireItem[]>(chunk.path)));
const tagsOf = await collectionTags();
const items = chunks.flat().map(fromWire).map((item) => ({ ...item, tags: tagsOf.get(item.author) ?? item.tags }));
const store = await LocalR2Store.open(BUCKET);
const { manifest: written } = await writeFeed(items, manifest.errors, { store, now: new Date() });
await store.close();
console.log(`seeded ${items.length} items in ${written.chunks.length} chunks from the feed generated ${manifest.generatedAt}`);

async function collectionTags(): Promise<Map<string, string[]>> {
  const files = Array.from(new Glob("collection/*.json").scanSync(".")).sort();
  const collections = await Promise.all(files.map(async (file) => parseCollection(await Bun.file(file).json(), file)));
  const tags = new Map<string, string[]>();
  for (const source of mergeSources(collections)) tags.set(source.author, [...new Set([...(tags.get(source.author) ?? []), ...source.tags])]);
  return tags;
}

async function download<T>(path: string): Promise<T> {
  const response = await fetch(`${ORIGIN}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}
