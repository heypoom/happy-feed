import { expect, spyOn, test } from "bun:test";
import type { FeedItem } from "../src/shared/types";
import { brandWithDeArrow, chooseBranding, thumbnailUrl, type DeArrowCache } from "./dearrow";

const sub = <T extends object>(extra: T) => ({ original: false, votes: 0, locked: false, ...extra });

test("uses the top community title and thumbnail when they are trusted", () => {
  expect(
    chooseBranding({
      titles: [sub({ title: "Explaining Perlin Noise", votes: 2 }), sub({ title: "What is Perlin Noise?", original: true })],
      thumbnails: [sub({ timestamp: 42.5, locked: true })],
    }),
  ).toEqual({ title: "Explaining Perlin Noise", time: 42.5 });
});

test("drops the > auto-format markers", () => {
  expect(chooseBranding({ titles: [sub({ title: "Kirkaldy's >Testing >Works | >Tom >Scott", locked: true })] })).toEqual({
    title: "Kirkaldy's Testing Works | Tom Scott",
  });
});

test("ignores a downvoted top submission and an original-first answer", () => {
  expect(chooseBranding({ titles: [sub({ title: "Unconfirmed", votes: -1 })] })).toEqual({});
  expect(chooseBranding({ titles: [sub({ title: "Original", original: true })], thumbnails: [sub({ timestamp: null, original: true })] })).toEqual({});
});

test("thumbnail URLs fall back to YouTube's own image", () => {
  expect(thumbnailUrl("abc", 12)).toBe(
    "https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=abc&time=12&redirectUrl=https%3A%2F%2Fi.ytimg.com%2Fvi%2Fabc%2Fhq720.jpg",
  );
});

test("a build only asks DeArrow about recent videos, and still applies what it already knows", async () => {
  const now = new Date("2026-11-12T00:00:00Z");
  const asked: string[] = [];
  const spy = spyOn(globalThis, "fetch").mockImplementation((async (input: string) => {
    asked.push(new URL(input).searchParams.get("videoID")!);
    return new Response(JSON.stringify({ titles: [], thumbnails: [] }));
  }) as typeof fetch);
  const video = (videoId: string, publishedAt: string): FeedItem => ({
    id: `youtube:yt:video:${videoId}`, title: `Video ${videoId}`, url: `https://www.youtube.com/watch?v=${videoId}`,
    videoId, publishedAt, kind: "youtube", author: "Patt Vira", tags: [],
  });
  const cache: DeArrowCache = { known: { title: "A calmer title", checkedAt: "2025-01-01T00:00:00Z" } };
  const items = await brandWithDeArrow([video("fresh", "2026-11-10T00:00:00Z"), video("old", "2019-03-01T00:00:00Z"), video("known", "2020-01-01T00:00:00Z")], now, cache);
  spy.mockRestore();
  expect(asked).toEqual(["fresh"]);
  expect(items.find((item) => item.videoId === "known")?.title).toBe("A calmer title");
});
