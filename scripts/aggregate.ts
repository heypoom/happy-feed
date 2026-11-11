import { SOURCE_KINDS, type Feed, type FeedError, type FeedItem, type SourceKind } from "../src/shared/types";
import type { Collection } from "./collection";
import type { ProviderRegistry } from "./providers";

export async function buildFeed(collections: Collection[], providers: ProviderRegistry, now: Date): Promise<Feed> {
  const errors: FeedError[] = [];
  const jobs = mergeSources(collections).map(async ({ kind, url, provider, author, tags, mute }): Promise<FeedItem[]> => {
    try {
      const raw = await providers[provider](url);
      return raw
        .filter((item) => !isMuted(item, mute))
        .map((item) => ({ ...item, id: `${kind}:${item.id}`, kind, author, tags }));
    } catch (error) {
      errors.push({ entry: author, kind, message: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  const items = dedupe((await Promise.all(jobs)).flat()).sort(byNewest);
  const present = new Set(items.map((item) => item.kind));
  return {
    generatedAt: now.toISOString(),
    items,
    tags: [...new Set(items.flatMap((item) => item.tags))].sort(),
    kinds: SOURCE_KINDS.filter((kind) => present.has(kind)),
    errors,
  };
}

type Source = { kind: SourceKind; url: string; provider: keyof ProviderRegistry; author: string; tags: string[]; mute: string[] };

// Collections may list the same source. Fetch it once, under the first entry's name,
// with every listing's tags and every listing collection's mute words.
function mergeSources(collections: Collection[]): Source[] {
  const merged = new Map<string, Source>();
  for (const collection of collections) {
    for (const entry of collection.entries) {
      for (const { kind, url, provider } of sourcesOf(entry)) {
        const key = `${provider}|${kind}|${sameUrl(url)}`;
        const existing = merged.get(key);
        if (!existing) merged.set(key, { kind, url, provider, author: entry.name, tags: [...entry.tags], mute: [...collection.mute] });
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

// The same post can arrive twice (RSS and an archive page, http and https, with or without www or .html).
// Keep one per author and URL, preferring the copy with more to show.
function dedupe(items: FeedItem[]): FeedItem[] {
  const kept = new Map<string, FeedItem>();
  for (const item of items) {
    const key = `${item.author}|${item.kind}|${sameUrl(item.url)}`;
    const existing = kept.get(key);
    if (!existing) kept.set(key, item);
    else kept.set(key, { ...item, ...existing, summary: existing.summary ?? item.summary, image: existing.image ?? item.image });
  }
  return [...kept.values()];
}

function sameUrl(url: string): string {
  try {
    const { hostname, pathname, search } = new URL(url);
    return `${hostname.replace(/^www\./, "")}${pathname.replace(/(\.html?|\/)$/, "")}${search}`;
  } catch {
    return url;
  }
}

function isMuted(item: { title: string; summary?: string }, mute: string[]): boolean {
  const haystack = `${item.title}\n${item.summary ?? ""}`.toLowerCase();
  return mute.some((word) => haystack.includes(word.toLowerCase()));
}

function byNewest(a: { publishedAt: string }, b: { publishedAt: string }): number {
  return b.publishedAt.localeCompare(a.publishedAt);
}
