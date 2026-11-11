import { Glob } from "bun";
import { mkdir } from "node:fs/promises";
import { buildFeed } from "./aggregate";
import { parseCollection } from "./collection";
import { brandWithDeArrow } from "./dearrow";
import { createProviders } from "./providers";

const collections = await Promise.all(
  Array.from(new Glob("collection/*.json").scanSync("."))
    .sort()
    .map(async (file) => parseCollection(await Bun.file(file).json(), file)),
);

const read = (name: string) =>
  Bun.file(`.cache/${name}.json`)
    .json()
    .catch(() => ({}));
const state = { youtubeIds: await read("youtube-ids"), archivePages: await read("archive-pages") };
const dearrow = await read("dearrow");

const feed = await buildFeed(collections, createProviders(process.env), new Date(), state);
feed.items = await brandWithDeArrow(feed.items, new Date(), dearrow);
await Bun.write("public/feed.json", JSON.stringify(feed));
await mkdir(".cache", { recursive: true });
await Bun.write(".cache/youtube-ids.json", JSON.stringify(state.youtubeIds, null, 2));
await Bun.write(".cache/archive-pages.json", JSON.stringify(state.archivePages, null, 2));
await Bun.write(".cache/dearrow.json", JSON.stringify(dearrow));

const counts = Map.groupBy(feed.items, (item) => `${item.author} (${item.kind})`);
for (const [source, items] of counts) console.log(`${String(items.length).padStart(4)}  ${source}`);
for (const error of feed.errors) console.warn(`  skip  ${error.entry} (${error.kind}): ${error.message}`);
console.log(`wrote public/feed.json with ${feed.items.length} items, ${feed.errors.length} errors`);
