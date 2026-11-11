import { test as base, expect } from "@playwright/test";
import type { Chunk, FeedItem, Manifest } from "../src/shared/types";

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const item = (fields: Pick<FeedItem, "id" | "kind" | "title" | "author" | "tags"> & Partial<FeedItem>, age: number): FeedItem => ({
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

// The published feed: a manifest naming a recent chunk and an older one, as the Worker serves them.
export const CHUNKS: Record<string, FeedItem[]> = {
  "feed/items-recent-0000aaaa.json": [ITEMS.noise, ITEMS.hype, ITEMS.sorted],
  "feed/items-2026-0000bbbb.json": [ITEMS.paper],
};
const chunk = (path: string, label: string): Chunk => {
  const items = CHUNKS[path]!;
  return { path, label, count: items.length, newest: items[0]!.publishedAt, oldest: items.at(-1)!.publishedAt };
};
export const RECENT_CHUNK = "/feed/items-recent-0000aaaa.json";
export const OLDER_CHUNK = "/feed/items-2026-0000bbbb.json";
export const MANIFEST: Manifest = {
  generatedAt: daysAgo(0),
  tags: ["Creative Coding", "HCI", "Computer Science"],
  kinds: ["youtube", "rss", "bluesky"],
  errors: [{ entry: "Gone Blog", kind: "rss", message: "HTTP 404" }],
  chunks: [chunk("feed/items-recent-0000aaaa.json", "recent"), chunk("feed/items-2026-0000bbbb.json", "2026")],
};

// Every test runs against MANIFEST and CHUNKS and never reaches the network: the real feed is built by
// scraping other people's sites, and thumbnails, fonts and post APIs live on third-party hosts.
export const test = base.extend<{ stubNetwork: void }>({
  stubNetwork: [
    async ({ context }, use) => {
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.hostname !== "localhost") return route.abort("blockedbyclient");
        if (url.pathname === "/feed/manifest.json") return route.fulfill({ json: MANIFEST });
        const items = CHUNKS[url.pathname.slice(1)];
        if (items) return route.fulfill({ json: items });
        return route.continue();
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };
