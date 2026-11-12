import { expect, test } from "bun:test";
import { isExcluded } from "./excludes";
import type { FeedItem } from "./types";
import { fromWire, toWire } from "./wire";

const ai = new Set(["ai"] as const);
const video: FeedItem = {
  id: "youtube:yt:video:abc",
  kind: "youtube",
  title: "Drawing with noise",
  url: "https://www.youtube.com/watch?v=abc",
  summary: "Sponsored by an AI agent platform",
  image: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
  videoId: "abc",
  publishedAt: "2026-11-10T00:00:00.000Z",
  author: "Ada Lim",
  tags: ["Creative Coding"],
};
const post: FeedItem = {
  id: "rss:essay",
  kind: "rss",
  title: "Paper prototypes still win",
  url: "https://example.com/essay",
  summary: "On sketching by hand.",
  image: "https://example.com/essay.png",
  publishedAt: "2026-10-01T00:00:00.000Z",
  author: "Dana Wu",
  tags: ["HCI"],
};

test("a video goes out without its summary, URL or thumbnail, and comes back with the URL and thumbnail", () => {
  const wire = toWire(video);
  expect(Object.keys(wire).sort()).toEqual(["author", "id", "kind", "publishedAt", "tags", "title", "topics", "videoId"]);
  const { summary: _, ...rest } = video;
  expect(fromWire(JSON.parse(JSON.stringify(wire)))).toEqual({ ...rest, topics: ["ai"] });
});

test("a video keeps a URL or thumbnail its id would not give", () => {
  const mirrored = { ...video, image: "https://i3.ytimg.com/vi/abc/hqdefault.jpg", url: "https://www.youtube.com/watch?v=abc&t=10" };
  expect(fromWire(toWire(mirrored))).toMatchObject({ image: mirrored.image, url: mirrored.url });
});

test("other posts keep every field, and carry topics only when they have one", () => {
  expect(fromWire(toWire(post))).toEqual(post);
  expect(toWire({ ...post, title: "Living with AI hype" }).topics).toEqual(["ai"]);
});

test("No AI decides the same with the summary gone as with it there", () => {
  const cases: FeedItem[] = [
    video,
    { ...video, summary: "Plain noise fields." },
    { ...video, title: "No AI. Build cat in C", summary: "But better for AI" },
    { ...video, title: "How diffusion makes images", originalTitle: "AI changed EVERYTHING", summary: undefined },
  ];
  for (const item of cases) expect(isExcluded(fromWire(toWire(item)), ai)).toBe(isExcluded(item, ai));
});

test("an untrimmed post from an older chunk reads as it is", () => {
  expect(fromWire(video)).toEqual(video);
});
