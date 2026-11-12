import type { ExcludeId } from "./excludes";

export type SourceKind = "youtube" | "rss" | "substack" | "website" | "bluesky" | "mastodon" | "twitter" | "facebook";

export const SOURCE_KINDS: readonly SourceKind[] = [
  "youtube",
  "rss",
  "substack",
  "website",
  "bluesky",
  "mastodon",
  "twitter",
  "facebook",
];

export type Format = "watch" | "read" | "post";

export const FORMAT_OF: Record<SourceKind, Format> = {
  youtube: "watch",
  rss: "read",
  substack: "read",
  website: "read",
  bluesky: "post",
  mastodon: "post",
  twitter: "post",
  facebook: "post",
};

export type FeedItem = {
  id: string;
  kind: SourceKind;
  title: string;
  // Set when a calmer community title replaced the original (DeArrow).
  originalTitle?: string;
  // A preferred thumbnail to show instead of the source's own, e.g. a DeArrow frame.
  thumbnail?: string;
  url: string;
  summary?: string;
  image?: string;
  videoId?: string;
  // The exclude presets the post is about, decided at publish from its full text (see wire.ts).
  topics?: ExcludeId[];
  publishedAt: string;
  author: string;
  tags: string[];
};

export type FeedError = { entry: string; kind: SourceKind; message: string };

export type Feed = {
  generatedAt: string;
  items: FeedItem[];
  tags: string[];
  kinds: SourceKind[];
  errors: FeedError[];
};

// The published feed is a small manifest plus items split into chunks: recent first, then one per
// year, newest to oldest. A chunk's path carries a hash of its content, so an unchanged year keeps
// its URL and stays cached.
export type Chunk = { path: string; label: string; count: number; newest: string; oldest: string };

export type Manifest = Omit<Feed, "items"> & { chunks: Chunk[] };
