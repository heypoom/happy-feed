import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { deckFor } from "../src/shared/order";
import { FORMAT_OF, type Chunk, type FeedItem, type Format, type Manifest } from "../src/shared/types";

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

export const item = (fields: Pick<FeedItem, "id" | "kind" | "title" | "author" | "tags"> & Partial<FeedItem>, age: number): FeedItem => ({
  url: `https://example.invalid/${fields.id}`,
  publishedAt: daysAgo(age),
  ...fields,
});

export const ITEMS = {
  noise: item(
    { id: "yt:noise", kind: "youtube", title: "Drawing with noise", author: "Ada Lim", tags: ["Creative Coding"], videoId: "noise", image: "https://example.invalid/noise.jpg" },
    1,
  ),
  hype: item({ id: "rss:hype", kind: "rss", title: "Living with AI hype", summary: "A tired essay.", author: "Ben Ortiz", tags: ["HCI"] }, 2),
  sorted: item(
    { id: "at://cleo/post/1", kind: "bluesky", title: "Sorted a list by hand today", summary: "Sorted a list by hand today", author: "Cleo Park", tags: ["Computer Science"], url: "https://bsky.app/profile/cleo/post/1" },
    3,
  ),
  paper: item({ id: "rss:paper", kind: "rss", title: "Paper prototypes still win", author: "Dana Wu", tags: ["HCI"] }, 30),
} satisfies Record<string, FeedItem>;

// The published feed, as the Worker serves it: a manifest naming the chunks, recent first, and a deck
// for each UTC day around now, so every time zone finds today's.
export function publishFeed(chunks: Record<string, FeedItem[]>, fields: Pick<Manifest, "tags" | "kinds" | "errors">): { manifest: Manifest; files: Record<string, FeedItem[]> } {
  const items = Object.values(chunks).flat();
  const days = [-1, 0, 1].map((offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10));
  const decks = Object.fromEntries(days.map((day) => [day, `feed/deck-${day}-0000dddd.json`]));
  const totals: Record<Format, number> = { watch: 0, read: 0, post: 0 };
  for (const item of items) totals[FORMAT_OF[item.kind]]++;
  const chunk = ([path, items]: [string, FeedItem[]]): Chunk => ({
    path,
    label: /items-(\w+)-/.exec(path)![1]!,
    count: items.length,
    newest: items[0]!.publishedAt,
    oldest: items.at(-1)!.publishedAt,
  });
  return {
    manifest: { generatedAt: daysAgo(0), ...fields, chunks: Object.entries(chunks).map(chunk), decks, totals },
    files: { ...chunks, ...Object.fromEntries(days.map((day) => [decks[day]!, deckFor(items, day)])) },
  };
}

export const RECENT_CHUNK = "/feed/items-recent-0000aaaa.json";
export const OLDER_CHUNK = "/feed/items-2026-0000bbbb.json";
const FEED = publishFeed(
  { "feed/items-recent-0000aaaa.json": [ITEMS.noise, ITEMS.hype, ITEMS.sorted], "feed/items-2026-0000bbbb.json": [ITEMS.paper] },
  {
    tags: ["Creative Coding", "HCI", "Computer Science"],
    kinds: ["youtube", "rss", "bluesky"],
    errors: [{ entry: "Gone Blog", kind: "rss", message: "HTTP 404" }],
  },
);
export const MANIFEST = FEED.manifest;

// Serves a feed other than the fixture one to this page.
export async function serveFeed(page: Page, { manifest, files }: ReturnType<typeof publishFeed>): Promise<void> {
  await page.route("**/feed/**", (route) => {
    const path = new URL(route.request().url()).pathname.slice(1);
    if (path === "feed/manifest.json") return route.fulfill({ json: manifest });
    return files[path] ? route.fulfill({ json: files[path] }) : route.fallback();
  });
}

// Every test runs against the fixture feed and never reaches the network: the real feed is built by
// scraping other people's sites, and thumbnails, fonts and post APIs live on third-party hosts.
// Sync requests reach the dev Worker, which keeps them in its local bucket.
export async function stubNetwork(context: BrowserContext): Promise<void> {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.abort("blockedbyclient");
    if (url.pathname === "/feed/manifest.json") return route.fulfill({ json: MANIFEST });
    const items = FEED.files[url.pathname.slice(1)];
    if (items) return route.fulfill({ json: items });
    return route.continue();
  });
}

export const test = base.extend<{ stubNetwork: void }>({
  stubNetwork: [
    async ({ context }, use) => {
      await stubNetwork(context);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
