import type { ProviderOptions } from ".";
import { parseFeedXml, type RawItem } from "../feed-xml";
import { fetchText, HttpError } from "../http";
import { paged } from "./paged";

// WordPress feeds hold only the newest 10 or so posts, but serve older ones at `?paged=N`.
// Some hide the generator tag, so the wfw and slash namespaces its feed template declares count too.
const isWordPress = (xml: string) =>
  /<generator>[^<]*wordpress\.(org|com)/i.test(xml) || (/xmlns:wfw=/.test(xml) && /xmlns:slash=/.test(xml));

// Other providers fall back to `rss(url)` with no options, which reads one page.
export async function rss(url: string, options?: ProviderOptions): Promise<RawItem[]> {
  const xml = await fetchText(url);
  const first = parseFeedXml(xml, url);
  if (options?.depth !== "full" || !isWordPress(xml) || first.length === 0) return first;

  const older = await paged<number>("full", async (page = 2) => {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("paged", String(page));
    let items: RawItem[];
    try {
      items = parseFeedXml(await fetchText(pageUrl.href), url);
    } catch (error) {
      // WordPress answers 404 past the last page.
      if (error instanceof HttpError && error.status === 404) return { items: [], next: undefined };
      throw error;
    }
    // A server that ignores `paged` sends page one again.
    if (items[0]?.id === first[0]!.id) return { items: [], next: undefined };
    return { items, next: page + 1 };
  }).catch(() => []);
  return [...first, ...older];
}
