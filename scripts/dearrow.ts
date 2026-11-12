import type { FeedItem } from "../src/shared/types";
import { fetchJson, HttpError } from "./http";

// DeArrow (https://dearrow.ajay.app) crowdsources accurate, non-sensational titles and thumbnails
// for YouTube. Its API and data are CC BY-NC-SA 4.0, which this personal feed credits in the UI.
const API = "https://sponsor.ajay.app/api/branding";
const THUMBNAILS = "https://dearrow-thumb.ajay.app/api/v1/getThumbnail";
const CONCURRENCY = 6;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Submission = { original: boolean; votes: number; locked: boolean };
type BrandingResponse = {
  titles?: (Submission & { title: string })[];
  thumbnails?: (Submission & { timestamp: number | null })[];
};
export type Branding = { title?: string; time?: number };
type CacheEntry = Branding & { checkedAt: string };
export type DeArrowCache = Record<string, CacheEntry>;

// DeArrow returns submissions best first; the first is trustworthy when it is locked or not downvoted.
// A ">" before a word only tells an auto-formatter to leave that word alone, so it is dropped.
export function chooseBranding(response: BrandingResponse): Branding {
  const trusted = <T extends Submission>(list: T[] | undefined) => {
    const first = list?.[0];
    return first && !first.original && (first.locked || first.votes >= 0) ? first : undefined;
  };
  const title = trusted(response.titles)?.title.replace(/(^|\s)>(?=\S)/g, "$1").trim();
  const time = trusted(response.thumbnails)?.timestamp ?? undefined;
  return { ...(title ? { title } : {}), ...(typeof time === "number" ? { time } : {}) };
}

export function thumbnailUrl(videoId: string, time: number): string {
  // If DeArrow cannot render the frame, it redirects to YouTube's own thumbnail.
  const fallback = `https://i.ytimg.com/vi/${videoId}/hq720.jpg`;
  return `${THUMBNAILS}?videoID=${videoId}&time=${time}&redirectUrl=${encodeURIComponent(fallback)}`;
}

// New videos gather votes quickly, so they are re-checked often; old ones rarely change.
function isStale(entry: CacheEntry | undefined, publishedAt: string, now: Date): boolean {
  if (!entry) return true;
  const age = now.getTime() - Date.parse(publishedAt);
  const checked = now.getTime() - Date.parse(entry.checkedAt);
  return checked > (age < 7 * DAY ? 6 * HOUR : age < 60 * DAY ? 3 * DAY : 30 * DAY);
}

async function lookup(videoId: string): Promise<Branding> {
  try {
    return chooseBranding(await fetchJson<BrandingResponse>(`${API}?videoID=${videoId}`));
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return {};
    throw error;
  }
}

// DeArrow is a volunteer service, so a build only asks about recent videos. The back catalogue is looked
// up when a card is actually shown, not in bulk.
const LOOKUP_WINDOW_MS = 60 * DAY;

// Looks up stale recent videos into `cache` (updated in place), then applies what the cache holds.
export async function brandWithDeArrow(items: FeedItem[], now: Date, cache: DeArrowCache): Promise<FeedItem[]> {
  const since = now.getTime() - LOOKUP_WINDOW_MS;
  const queue = items.filter(
    (item) => item.videoId && Date.parse(item.publishedAt) >= since && isStale(cache[item.videoId], item.publishedAt, now),
  );
  let failed = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          cache[item.videoId!] = { ...(await lookup(item.videoId!)), checkedAt: now.toISOString() };
        } catch {
          failed++;
        }
      }
    }),
  );

  let titles = 0;
  let thumbnails = 0;
  const branded = items.map((item) => {
    const branding = item.videoId ? cache[item.videoId] : undefined;
    if (!branding) return item;
    const next = { ...item };
    if (branding.title && branding.title !== item.title) {
      next.originalTitle = item.title;
      next.title = branding.title;
      titles++;
    }
    if (branding.time !== undefined) {
      next.thumbnail = thumbnailUrl(item.videoId!, branding.time);
      thumbnails++;
    }
    return next;
  });
  console.log(`DeArrow: ${titles} titles, ${thumbnails} thumbnails${failed ? `, ${failed} lookups failed (kept as is)` : ""}`);
  return branded;
}
