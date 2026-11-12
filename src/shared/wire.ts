import { topicsOf } from "./excludes";
import type { FeedItem } from "./types";

// A post as published in chunks and decks. A video sends no summary (its card never shows one), and
// no URL or thumbnail that its video id already gives. The summary still decides `topics` first, so
// No AI hides the same videos as before.
export type WireItem = Omit<FeedItem, "url"> & { url?: string };

const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
const thumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

export function toWire(item: FeedItem): WireItem {
  const { topics: _, ...rest } = item;
  const topics = topicsOf(item);
  const wire: WireItem = topics.length > 0 ? { ...rest, topics } : rest;
  if (item.videoId === undefined) return wire;
  const { url, image, summary: _summary, ...video } = wire;
  return {
    ...video,
    ...(url !== watchUrl(item.videoId) ? { url } : {}),
    ...(image !== undefined && image !== thumbnailUrl(item.videoId) ? { image } : {}),
  };
}

// Also reads chunks published before the trimmed format: their posts carry every field already.
export function fromWire(item: WireItem): FeedItem {
  if (!item.videoId) return item as FeedItem;
  return { ...item, url: item.url ?? watchUrl(item.videoId), image: item.image ?? thumbnailUrl(item.videoId) };
}
