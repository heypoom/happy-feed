import { dayKey } from "./order";

// How much of a person the feed shows. Normal is the default and is stored only to record when a
// person was set back to it, so that change wins a merge like any other.
export type Level = "more" | "normal" | "less" | "pause";
export const LEVELS: readonly Level[] = ["more", "normal", "less", "pause"];

// How likely a person is to be dealt into the daily hand and the Anytime stacks, against a normal one.
// A paused person never reaches the deal, so their weight is never read.
export const WEIGHT: Record<Level, number> = { more: 3, normal: 1, less: 0.25, pause: 0 };

type Dated = { id: string; author: string; publishedAt: string };

// New keeps only the newest post of each local day from a person seen less, so one who posts ten
// times a day still shows up, once.
export function thinLess<T extends Dated>(items: readonly T[], isLess: (author: string) => boolean): T[] {
  const newest = new Map<string, T>();
  for (const item of items) {
    if (!isLess(item.author)) continue;
    const key = `${item.author}\n${dayKey(new Date(item.publishedAt))}`;
    const seen = newest.get(key);
    if (!seen || item.publishedAt > seen.publishedAt) newest.set(key, item);
  }
  if (newest.size === 0) return [...items];
  const kept = new Set(newest.values());
  return items.filter((item) => !isLess(item.author) || kept.has(item));
}
