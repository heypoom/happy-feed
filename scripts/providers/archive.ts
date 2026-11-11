import type { ProviderOptions } from ".";
import { htmlToText, truncate, type RawItem } from "../feed-xml";
import { fetchText } from "../http";

// Some blogs publish only their newest posts in RSS but link every post from an index page.
// This reads that page for same-site links with a /YYYY/MM/DD/ path, then reads each post page once.
const DATED_PATH = /^\/(\d{4})\/(\d{2})\/(\d{2})\/[^/?#]+\/?$/;
const CONCURRENCY = 6;

export type PageMeta = { title: string; summary?: string; image?: string };

export async function archive(indexUrl: string, { state }: ProviderOptions): Promise<RawItem[]> {
  const index = new URL(indexUrl);
  const host = index.hostname.replace(/^www\./, "");
  const links = new Map<string, URL>();
  for (const [, href] of (await fetchText(indexUrl)).matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const url = new URL(href!, index);
    if (url.hostname.replace(/^www\./, "") === host && DATED_PATH.test(url.pathname)) links.set(url.pathname, url);
  }

  const cache = state.archivePages;
  const queue = [...links.values()];
  const items: RawItem[] = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        const meta = cache[url.href] ?? (await readPost(url).catch(() => undefined));
        if (!meta) continue;
        cache[url.href] = meta;
        const [, year, month, day] = DATED_PATH.exec(url.pathname)!;
        items.push({ id: url.href, url: url.href, ...meta, publishedAt: new Date(Date.UTC(+year!, +month! - 1, +day!, 12)).toISOString() });
      }
    }),
  );
  return items;
}

async function readPost(url: URL): Promise<PageMeta> {
  const html = await fetchText(url.href);
  const meta = (property: string) =>
    new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']|<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, "i")
      .exec(html)
      ?.slice(1)
      .find(Boolean);
  const body = /<article\b[\s\S]*?<\/article>/i.exec(html)?.[0] ?? "";
  const text = htmlToText(body.replace(/<h1\b[\s\S]*?<\/h1>/gi, " ").replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, " "))
    // Many blogs open the article with a dateline ("October 2025") that the card already shows.
    .replace(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\s+/, "");
  const image = /<img[^>]+src=["']([^"']+)["']/i.exec(body)?.[1];
  return {
    title: htmlToText(meta("og:title") ?? /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? url.pathname),
    summary: truncate(htmlToText(meta("og:description") ?? "") || text) || undefined,
    image: image ? new URL(image, url).href : undefined,
  };
}
