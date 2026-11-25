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

// The same post can arrive twice (RSS and an archive page, http and https, with or without www or .html,
// or a profile feed and a publication feed tagging the link differently). Keep one per author and URL,
// preferring the copy with more to show. Two copies with the same id are the same post whatever their URLs.
export function dedupe(items: FeedItem[]): FeedItem[] {
  const kept = new Map<string, FeedItem>();
  const keyOfId = new Map<string, string>();
  for (const item of items) {
    const key = keyOfId.get(item.id) ?? `${item.author}|${item.kind}|${postUrl(item.url)}`;
    const existing = kept.get(key);
    if (!existing) kept.set(key, item);
    else kept.set(key, { ...item, ...existing, summary: existing.summary ?? item.summary, image: existing.image ?? item.image });
    keyOfId.set(item.id, key);
  }
  return [...kept.values()];
}

// A post's URL without the tracking a feed adds: utm_* everywhere, and Medium's `source=rss…`, which
// differs between a writer's profile feed and a publication's feed for the same post.
function postUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const [name, value] of [...parsed.searchParams]) {
      if (name.startsWith("utm_") || (name === "source" && value.startsWith("rss"))) parsed.searchParams.delete(name);
    }
    return sameUrl(parsed.toString());
  } catch {
    return url;
  }
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
