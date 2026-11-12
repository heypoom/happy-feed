// Refreshes sources from this machine and publishes the feed to R2, with the same code the hourly
// Worker runs. Useful for sources that block Cloudflare's network (Substack answers 429 there).
//
//   bun run refresh                         every source, then publish, to the live bucket
//   bun run refresh -- --kind substack      only matching sources (repeatable; a kind or "archive")
//   bun run refresh -- --author "Ink"       only entries whose name contains this (repeatable)
//   bun run refresh -- --full               read every page, as the weekly run does
//   bun run refresh -- --local              the local bucket that `bun run dev` serves
import { Glob } from "bun";
import { parseArgs } from "node:util";
import { BUCKET, CfR2Store } from "./cf-store";
import { LocalR2Store } from "./local-store";
import { parseCollection } from "./collection";
import { createProviders } from "./providers";
import { publish } from "./publish";
import { mergeSources, refresh, type Source } from "./sources";

const { values: flags } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    kind: { type: "string", multiple: true },
    author: { type: "string", multiple: true },
    full: { type: "boolean", default: false },
    local: { type: "boolean", default: false },
  },
});

const collections = await Promise.all(
  Array.from(new Glob("collection/*.json").scanSync("."))
    .sort()
    .map(async (file) => parseCollection(await Bun.file(file).json(), file)),
);
const sources = mergeSources(collections);
const chosen = sources.filter(
  (source) =>
    (!flags.kind || flags.kind.some((kind) => kind === source.kind || kind === source.provider)) &&
    (!flags.author || flags.author.some((name) => source.author.toLowerCase().includes(name.toLowerCase()))),
);
if (chosen.length === 0) throw new Error("no source matches those filters");

const store = flags.local ? await LocalR2Store.open(BUCKET) : new CfR2Store(BUCKET);
const now = new Date();
console.log(`refreshing ${chosen.length} of ${sources.length} sources into the ${flags.local ? "local" : "live"} ${BUCKET} bucket`);

const seconds = (since: number) => `${Math.round((Date.now() - since) / 1000)}s`;
const fetching = new Map<Source, number>();
let phase = "refresh";
const heartbeat = setInterval(() => {
  const waits = [
    ...[...fetching].map(([source, since]) => `${source.author} (${source.provider}) ${seconds(since)}`),
    ...store.inFlight().map(({ call, since }) => `${call} ${seconds(since)}`),
  ];
  console.log(`  … ${phase} still running, waiting on: ${waits.join("; ") || "nothing in flight"}`);
}, 30_000);

await refresh(chosen, {
  store,
  providers: createProviders(process.env),
  now,
  depth: flags.full ? "full" : undefined,
  progress: {
    started: (source) => fetching.set(source, Date.now()),
    finished(source, record) {
      const note = record.status.ok ? "" : `  (failed: ${record.status.message})`;
      console.log(`${String(record.items.length).padStart(5)}  ${record.author} (${record.provider}) in ${seconds(fetching.get(source)!)}${note}`);
      fetching.delete(source);
    },
  },
});
phase = "publish";
console.log(`publishing every source's posts`);
const { manifest, changed } = await publish(sources, { store, now });
clearInterval(heartbeat);
if (store instanceof LocalR2Store) await store.close();
const items = manifest.chunks.reduce((sum, chunk) => sum + chunk.count, 0);
for (const error of manifest.errors) console.warn(`  skip  ${error.entry} (${error.kind}): ${error.message}`);
console.log(`published ${items} items in ${manifest.chunks.length} chunks (${changed.length} new), ${manifest.errors.length} errors`);
