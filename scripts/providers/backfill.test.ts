import { afterEach, expect, spyOn, test } from "bun:test";
import type { ProviderOptions } from ".";
import { archive } from "./archive";
import { rss } from "./rss";

const options = (depth: "head" | "full"): ProviderOptions => ({ depth, state: { youtubeIds: {}, archivePages: {} } });

function serve(pages: Record<string, string>) {
  const requested: string[] = [];
  spyOn(globalThis, "fetch").mockImplementation((async (input: string) => {
    requested.push(String(input));
    const body = pages[String(input)];
    return new Response(body ?? "not found", { status: body === undefined ? 404 : 200 });
  }) as typeof fetch);
  return requested;
}

afterEach(() => (globalThis.fetch as unknown as { mockRestore?: () => void }).mockRestore?.());

// A WordPress feed without a generator tag, as some hosts serve it.
const wordpressFeed = (ids: number[]) => `<?xml version="1.0"?>
<rss version="2.0" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:slash="http://purl.org/rss/1.0/modules/slash/"><channel>
${ids.map((id) => `<item><title>Post ${id}</title><link>https://blog.example/${id}/</link><guid>https://blog.example/?p=${id}</guid><pubDate>Mon, 0${id} Jan 2024 00:00:00 +0000</pubDate></item>`).join("")}
</channel></rss>`;

test("a full read pages back through a WordPress feed until it answers 404", async () => {
  serve({
    "https://blog.example/feed/": wordpressFeed([5, 4]),
    "https://blog.example/feed/?paged=2": wordpressFeed([3, 2]),
    "https://blog.example/feed/?paged=3": wordpressFeed([1]),
  });
  const items = await rss("https://blog.example/feed/", options("full"));
  expect(items.map((item) => item.title)).toEqual(["Post 5", "Post 4", "Post 3", "Post 2", "Post 1"]);
});

test("a head read, or a feed that isn't WordPress, reads one page", async () => {
  const requested = serve({ "https://blog.example/feed/": wordpressFeed([5, 4]) });
  expect(await rss("https://blog.example/feed/", options("head"))).toHaveLength(2);
  expect(await rss("https://blog.example/feed/")).toHaveLength(2);
  expect(requested).toEqual(["https://blog.example/feed/", "https://blog.example/feed/"]);
});

test("stops when a server ignores paged and sends page one again", async () => {
  serve({
    "https://blog.example/?feed=rss2": wordpressFeed([5, 4]),
    "https://blog.example/?feed=rss2&paged=2": wordpressFeed([5, 4]),
  });
  expect(await rss("https://blog.example/?feed=rss2", options("full"))).toHaveLength(2);
});

test("an archive page reads month-only post paths, dated from the post", async () => {
  const post = (date?: string) =>
    `<html><head><meta property="og:title" content="A post">${date ? `<meta property="article:published_time" content="${date}" />` : ""}</head><body><article>Body</article></body></html>`;
  serve({
    "https://mag.example/archives/": `
      <a href="/2026/04/handcart/">dated</a>
      <a href="/2025/12/no-date/">undated</a>
      <a href="/2024/05/02/">a day index</a>
      <a href="/2023/01/02/daily-post/">a day path</a>`,
    "https://mag.example/2026/04/handcart/": post("2026-04-22T00:00:00+00:00"),
    "https://mag.example/2025/12/no-date/": post(),
    "https://mag.example/2023/01/02/daily-post/": post("2023-06-30T00:00:00+00:00"),
  });
  const items = await archive("https://mag.example/archives/", options("full"));
  expect(Object.fromEntries(items.map((item) => [new URL(item.url).pathname, item.publishedAt]))).toEqual({
    "/2026/04/handcart/": "2026-04-22T00:00:00.000Z",
    "/2025/12/no-date/": "2025-12-01T12:00:00.000Z",
    "/2023/01/02/daily-post/": "2023-01-02T12:00:00.000Z",
  });
});
