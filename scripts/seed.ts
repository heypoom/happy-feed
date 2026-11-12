// Copies the published feed from feed.poom.dev into the local R2 bucket that `bun run dev` serves.
// It reads only the published manifest and chunks, so unlike `bun run refresh -- --local` it never
// fetches the sources themselves. The posts go through the same writer as a publish, so the local
// bucket holds what this checkout would publish. Run it again for newer data.
import type { Manifest } from "../src/shared/types";
import { fromWire, type WireItem } from "../src/shared/wire";
import { BUCKET, CfR2Store } from "./cf-store";
import { writeFeed } from "./publish";

const ORIGIN = "https://feed.poom.dev";

const manifest = await download<Manifest>("feed/manifest.json");
const chunks = await Promise.all(manifest.chunks.map((chunk) => download<WireItem[]>(chunk.path)));
const items = chunks.flat().map(fromWire);
const { manifest: written } = await writeFeed(items, manifest.errors, { store: new CfR2Store(BUCKET, true), now: new Date() });
console.log(`seeded ${items.length} items in ${written.chunks.length} chunks from the feed generated ${manifest.generatedAt}`);

async function download<T>(path: string): Promise<T> {
  const response = await fetch(`${ORIGIN}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}
