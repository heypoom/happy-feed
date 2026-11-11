import type { FeedItem, SourceKind } from "../src/shared/types";
import type { RawItem } from "./feed-xml";

type Listing = { kind: SourceKind; author: string; tags: string[]; mute: string[] };

// What a source's posts look like in the feed: muted posts dropped, the rest carrying the
// listing's kind, author and tags, with ids namespaced by kind.
export function stamp(raw: RawItem[], { kind, author, tags, mute }: Listing): FeedItem[] {
  return raw.filter((item) => !isMuted(item, mute)).map((item) => ({ ...item, id: `${kind}:${item.id}`, kind, author, tags }));
}

// Stored posts follow the listing as it is now, so a renamed entry or a new mute word applies to them too.
export function restamp(items: FeedItem[], { author, tags, mute }: Listing): FeedItem[] {
  return items.filter((item) => !isMuted(item, mute)).map((item) => ({ ...item, author, tags }));
}

// The same post can arrive twice (RSS and an archive page, http and https, with or without www or .html).
// Keep one per author and URL, preferring the copy with more to show.
export function dedupe(items: FeedItem[]): FeedItem[] {
  const kept = new Map<string, FeedItem>();
  for (const item of items) {
    const key = `${item.author}|${item.kind}|${sameUrl(item.url)}`;
    const existing = kept.get(key);
    if (!existing) kept.set(key, item);
    else kept.set(key, { ...item, ...existing, summary: existing.summary ?? item.summary, image: existing.image ?? item.image });
  }
  return [...kept.values()];
}

export function sameUrl(url: string): string {
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

export function byNewest(a: { publishedAt: string }, b: { publishedAt: string }): number {
  return b.publishedAt.localeCompare(a.publishedAt);
}
