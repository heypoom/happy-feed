import type { FeedItem, SourceKind } from "../src/shared/types";
import { byNewest, dedupe, restamp, sameUrl, stamp } from "./aggregate";
import type { Collection } from "./collection";
import type { Depth, ProviderRegistry, ProviderState } from "./providers";
import type { Store } from "./store";

export type SourceKey = string & { readonly __brand: "SourceKey" };

// One feed to fetch, as the collections list it today.
export type Source = {
  key: SourceKey;
  kind: SourceKind;
  url: string;
  provider: keyof ProviderRegistry;
  author: string;
  tags: string[];
  mute: string[];
};

export type SourceStatus = { ok: true; at: string } | { ok: false; at: string; message: string; lastOkAt?: string };

// Everything known about one source: every post ever fetched from it, and how the last fetch went.
export type SourceRecord = Omit<Source, "mute"> & { items: FeedItem[]; status: SourceStatus };

export const recordPath = (key: SourceKey) => `sources/${key}.json`;
const STATE_PATHS = { youtubeIds: "state/youtube-ids.json", archivePages: "state/archive-pages.json" } as const;
const CONCURRENCY = 8;

// Collections may list the same source. Fetch it once, under the first entry's name,
// with every listing's tags and every listing collection's mute words.
export function mergeSources(collections: Collection[]): Source[] {
  const merged = new Map<string, Source>();
  for (const collection of collections) {
    for (const entry of collection.entries) {
      for (const { kind, url, provider } of sourcesOf(entry)) {
        const id = `${provider}|${kind}|${sameUrl(url)}`;
        const existing = merged.get(id);
        if (!existing) merged.set(id, { key: sourceKey(id), kind, url, provider, author: entry.name, tags: [...entry.tags], mute: [...collection.mute] });
        else {
          existing.tags = [...new Set([...existing.tags, ...entry.tags])];
          existing.mute = [...new Set([...existing.mute, ...collection.mute])];
        }
      }
    }
  }
  return [...merged.values()];
}

// An entry's archive page lists more of the same blog, so its posts join that blog's kind.
function sourcesOf(entry: Collection["entries"][number]): { kind: SourceKind; url: string; provider: keyof ProviderRegistry }[] {
  const sources = (Object.entries(entry.sources) as [SourceKind, string][]).map(([kind, url]) => ({ kind, url, provider: kind }));
  if (!entry.archive) return sources;
  const kind = (Object.keys(entry.sources) as SourceKind[]).find((k) => k === "rss" || k === "website" || k === "substack") ?? "website";
  return [...sources, { kind, url: entry.archive, provider: "archive" as const }];
}

// A readable slug plus a hash of the whole identity, so two URLs that slug alike never share a record.
function sourceKey(id: string): SourceKey {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${slug}-${(hash >>> 0).toString(16).padStart(8, "0")}` as SourceKey;
}

type Run = { store: Store; providers: ProviderRegistry; now: Date; depth?: Depth };

// Fetches every source (eight at a time) and stores each one's record as it finishes. With a deadline,
// sources not started by then are left as stored, so a slow network cannot keep the run from publishing.
export async function refresh(sources: Source[], run: Run & { deadline?: number }): Promise<SourceRecord[]> {
  const { store, deadline = Infinity } = run;
  const state: ProviderState = {
    youtubeIds: (await store.get(STATE_PATHS.youtubeIds)) ?? {},
    archivePages: (await store.get(STATE_PATHS.archivePages)) ?? {},
  };
  const queue = [...sources];
  const records: SourceRecord[] = [];
  const workers = Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let source = queue.shift(); source && Date.now() < deadline; source = queue.shift()) {
        records.push(await refreshSource(source, run, state));
      }
    }),
  );
  if (deadline === Infinity) await workers;
  else {
    let stop = () => {};
    const timeUp = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
      stop = () => clearTimeout(timer);
    });
    await Promise.race([workers, timeUp]);
    stop();
  }
  await store.put(STATE_PATHS.youtubeIds, state.youtubeIds);
  await store.put(STATE_PATHS.archivePages, state.archivePages);
  return records;
}

// Reads the newest page when the source has worked before, everything otherwise. New posts join the
// stored ones (the fetched copy wins), so running twice changes nothing and a failed fetch loses nothing.
export async function refreshSource(source: Source, { store, providers, now, depth }: Run, state: ProviderState): Promise<SourceRecord> {
  const stored = await store.get<SourceRecord>(recordPath(source.key));
  const kept = stored ? restamp(stored.items, source) : [];
  const lastOkAt = stored && (stored.status.ok ? stored.status.at : stored.status.lastOkAt);
  const at = now.toISOString();
  let items: FeedItem[];
  let status: SourceStatus;
  try {
    const fetched = stamp(await providers[source.provider](source.url, { depth: depth ?? (lastOkAt ? "head" : "full"), state }), source);
    const byId = new Map(kept.map((item) => [item.id, item]));
    for (const item of fetched) byId.set(item.id, { ...byId.get(item.id), ...item });
    items = dedupe([...byId.values()]).sort((a, b) => byNewest(a, b) || a.id.localeCompare(b.id));
    status = { ok: true, at };
  } catch (error) {
    items = kept;
    status = { ok: false, at, message: error instanceof Error ? error.message : String(error), ...(lastOkAt ? { lastOkAt } : {}) };
  }
  const { mute: _, ...listing } = source;
  const record: SourceRecord = { ...listing, items, status };
  await store.put(recordPath(source.key), record);
  return record;
}
