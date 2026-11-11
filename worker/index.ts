import { parseCollection } from "../scripts/collection";
import { createProviders } from "../scripts/providers";
import { MANIFEST_PATH, publish } from "../scripts/publish";
import { mergeSources, refresh } from "../scripts/sources";
import type { Store, StoredObject } from "../scripts/store";

// Cron runs get 15 minutes. Sources not started by then wait for the next run, so the feed still publishes.
const REFRESH_BUDGET_MS = 10 * 60 * 1000;
// Hourly runs read the newest page of each archive. Once a week, the Sunday 03:xx UTC run reads every
// page, to pick up edits and fill gaps.
const isWeeklyFullRun = (time: Date) => time.getUTCDay() === 0 && time.getUTCHours() === 3;

const collections = import.meta.glob<unknown>("../collection/*.json", { eager: true, import: "default" });
const SOURCES = mergeSources(
  Object.keys(collections)
    .sort()
    .map((file) => parseCollection(collections[file], file.replace(/^\.\.\//, ""))),
);

export default {
  async scheduled(controller, env) {
    const now = new Date(controller.scheduledTime);
    const store = r2Store(env.FEED);
    const depth = isWeeklyFullRun(now) ? "full" : undefined;
    const records = await refresh(SOURCES, { store, providers: createProviders({}), now, depth, deadline: Date.now() + REFRESH_BUDGET_MS });
    const { manifest, changed } = await publish(SOURCES, { store, now });
    const failed = records.filter((record) => !record.status.ok);
    const items = manifest.chunks.reduce((sum, chunk) => sum + chunk.count, 0);
    console.log(
      `${depth ?? "head"} run: ${records.length - failed.length}/${SOURCES.length} sources ok, ${failed.length} failed${failed.length ? ` (${failed.map((r) => `${r.author} ${r.kind}`).join(", ")})` : ""}; ` +
        `${items} items in ${manifest.chunks.length} chunks, ${changed.length} written anew`,
    );
  },

  // The client reads the published feed from R2. The manifest is revalidated on every load; chunks
  // are named by their content, so they never change.
  async fetch(request, env) {
    const key = new URL(request.url).pathname.slice(1);
    if (!key.startsWith("feed/")) return new Response("Not found", { status: 404 });
    const object = await env.FEED.get(key, { onlyIf: request.headers });
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers({
      "content-type": "application/json; charset=utf-8",
      "cache-control": key === MANIFEST_PATH ? "no-cache" : "public, max-age=31536000, immutable",
      etag: object.httpEtag,
    });
    return "body" in object ? new Response(object.body, { headers }) : new Response(null, { status: 304, headers });
  },
} satisfies ExportedHandler<Env>;

function r2Store(bucket: R2Bucket): Store {
  return {
    async get<T>(key: string) {
      const object = await bucket.get(key);
      return object ? await object.json<T>() : undefined;
    },
    async put(key, value) {
      await bucket.put(key, JSON.stringify(value), { httpMetadata: { contentType: "application/json" } });
    },
    async list(prefix) {
      const objects: StoredObject[] = [];
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix, cursor });
        objects.push(...page.objects.map(({ key, uploaded }) => ({ key, uploaded })));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return objects;
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
}
