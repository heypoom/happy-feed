import { afterEach, expect, spyOn, test } from "bun:test";
import type { ProviderOptions } from ".";
import { youtube } from "./youtube";

const CHANNEL = "UCabcdefghijklmnopqrstuv";
const url = `https://www.youtube.com/channel/${CHANNEL}`;
const options = (depth: ProviderOptions["depth"]): ProviderOptions => ({ depth, state: { youtubeIds: {}, archivePages: {} } });

const rss = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <entry><id>yt:video:long1</id><yt:videoId>long1</yt:videoId><title>A tutorial</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=long1"/><published>2026-11-10T00:00:00+00:00</published></entry>
  <entry><id>yt:video:short1</id><yt:videoId>short1</yt:videoId><title>A short</title>
    <link rel="alternate" href="https://www.youtube.com/shorts/short1"/><published>2026-11-11T00:00:00+00:00</published></entry>
</feed>`;

const video = (id: string, publishedAt?: string) => ({
  snippet: { title: `Video ${id}`, description: "About it", thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } }, resourceId: { videoId: id } },
  contentDetails: publishedAt ? { videoPublishedAt: publishedAt } : {},
});

type Answer = { status?: number; body: unknown };
function stubFetch(answer: (url: URL) => Answer) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  spyOn(globalThis, "fetch").mockImplementation((async (input: string, init?: RequestInit) => {
    const requested = new URL(input);
    calls.push({ url: requested, headers: (init?.headers ?? {}) as Record<string, string> });
    const { status = 200, body } = answer(requested);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch);
  return calls;
}

afterEach(() => (globalThis.fetch as unknown as { mockRestore?: () => void }).mockRestore?.());

test("hourly runs read the channel feed and drop Shorts", async () => {
  const calls = stubFetch(() => ({ body: rss }));
  const items = await youtube("key")(url, options("head"));
  expect(items.map((item) => item.id)).toEqual(["yt:video:long1"]);
  expect(calls.map((call) => call.url.hostname)).toEqual(["www.youtube.com"]);
});

test("a full run with a key lists every long-form upload, keeping the key out of the URL", async () => {
  const calls = stubFetch((requested) =>
    requested.searchParams.get("pageToken")
      ? { body: { items: [video("old", "2019-03-01T12:00:00Z"), video("gone")] } }
      : { body: { items: [video("new", "2026-11-10T00:00:00Z")], nextPageToken: "p2" } },
  );
  const items = await youtube("secret-key")(url, options("full"));
  expect(items).toEqual([
    expect.objectContaining({ id: "yt:video:new", url: "https://www.youtube.com/watch?v=new", videoId: "new", publishedAt: "2026-11-10T00:00:00.000Z" }),
    expect.objectContaining({ id: "yt:video:old", publishedAt: "2019-03-01T12:00:00.000Z", summary: "About it" }),
  ]);
  expect(calls.map((call) => call.url.searchParams.get("playlistId"))).toEqual([`UULF${CHANNEL.slice(2)}`, `UULF${CHANNEL.slice(2)}`]);
  expect(calls.every((call) => !call.url.href.includes("secret-key") && call.headers["x-goog-api-key"] === "secret-key")).toBe(true);
});

test("without a key, a full run stays on the channel feed", async () => {
  const calls = stubFetch(() => ({ body: rss }));
  expect((await youtube(undefined)(url, options("full"))).map((item) => item.id)).toEqual(["yt:video:long1"]);
  expect(calls).toHaveLength(1);
});

test("a rejected key falls back to the channel feed", async () => {
  stubFetch((requested) => (requested.hostname === "www.googleapis.com" ? { status: 403, body: {} } : { body: rss }));
  expect((await youtube("bad")(url, options("full"))).map((item) => item.id)).toEqual(["yt:video:long1"]);
});

test("an hourly run reads the newest API page when the channel feed is down", async () => {
  const calls = stubFetch((requested) =>
    requested.hostname === "www.googleapis.com" ? { body: { items: [video("new", "2026-11-10T00:00:00Z")], nextPageToken: "p2" } } : { status: 404, body: "" },
  );
  expect((await youtube("key")(url, options("head"))).map((item) => item.id)).toEqual(["yt:video:new"]);
  expect(calls.filter((call) => call.url.hostname === "www.googleapis.com")).toHaveLength(1);
});

test("without a key, an hourly run still fails when the channel feed is down", async () => {
  stubFetch(() => ({ status: 404, body: "" }));
  await expect(youtube(undefined)(url, options("head"))).rejects.toThrow("HTTP 404");
});
