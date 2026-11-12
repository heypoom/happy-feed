type Orderable = { author: string; publishedAt: string };
type Dealable = Orderable & { id: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const FRESH_MS = 7 * DAY_MS;
// The daily hand: one older post for every five new ones, at most eight a day.
export const HAND_EVERY = 5;
export const HAND_MAX = 8;
export const STACK_SIZE = 24;

export function diverseOrder<T extends Orderable>(items: readonly T[], maxRun = 2): T[] {
  const remaining = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const ordered: T[] = [];
  let run = 0;
  while (remaining.length > 0) {
    const last = ordered.at(-1)?.author;
    const other = run >= maxRun ? remaining.findIndex((item) => item.author !== last) : 0;
    // When only the over-run author is left, keep their items rather than dropping them.
    const [next] = remaining.splice(Math.max(other, 0), 1) as [T];
    run = next.author === last ? run + 1 : 1;
    ordered.push(next);
  }
  return ordered;
}

// Older posts may be pulled up to break a run of fresh ones, so the "caught up" divider goes
// after the last fresh card rather than at a date boundary in the input. The daily hand is woven
// into the fresh part and counts as part of it.
export function orderFeed<T extends Dealable>(items: readonly T[], now: Date, hand: readonly T[] = []): { ordered: T[]; freshCount: number } {
  const dealt = new Set(hand.map((item) => item.id));
  const ordered = diverseOrder(items.filter((item) => !dealt.has(item.id)));
  const freshCount = ordered.findLastIndex((item) => isFresh(item, now)) + 1;
  if (freshCount === 0 || hand.length === 0) return { ordered, freshCount };
  return { ordered: [...weave(ordered.slice(0, freshCount), hand), ...ordered.slice(freshCount)], freshCount: freshCount + hand.length };
}

// One hand card after every HAND_EVERY new ones.
function weave<T>(fresh: readonly T[], hand: readonly T[]): T[] {
  const out: T[] = [];
  let next = 0;
  fresh.forEach((item, i) => {
    out.push(item);
    if ((i + 1) % HAND_EVERY === 0 && next < hand.length) out.push(hand[next++]!);
  });
  return [...out, ...hand.slice(next)];
}

// The device's local calendar day. A new hand and a new stack arrive at local midnight.
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// When each post was last dealt, by day. Posts dealt on an earlier day sit out; today's stay, so a
// reload deals the same cards.
export type Dealt = Readonly<Record<string, string>>;

type Deal = { now: Date; dealt: Dealt };

export const isFresh = (item: Orderable, now: Date) => item.publishedAt >= new Date(now.getTime() - FRESH_MS).toISOString();

// Dealing draws from posts published before `day`'s week began: 00:00 UTC seven days earlier. A day,
// not a clock, sets it, so the build and every device agree on the deck.
export const poolCutoff = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - FRESH_MS).toISOString();

const handSeed = (day: string) => `hand:${day}`;
const stackSeed = (day: string) => `stack:${day}`;

function poolOf<T extends Dealable>(items: readonly T[], { now, dealt }: Deal): T[] {
  const day = dayKey(now);
  const cutoff = poolCutoff(day);
  return items.filter((item) => item.publishedAt < cutoff && !isFresh(item, now) && !dealtBefore(dealt, item.id, day));
}

// A few older posts for today's New feed, one per source, quiet sources first: a source that posted
// this week (`fresh`, the new posts in view) already has a card above.
export function dealHand<T extends Dealable>(items: readonly T[], { fresh, ...deal }: Deal & { fresh: readonly Orderable[] }): T[] {
  const count = Math.min(HAND_MAX, Math.floor(fresh.length / HAND_EVERY));
  if (count === 0) return [];
  const active = new Set(fresh.map((item) => item.author));
  return turns(poolOf(items, deal), handSeed(dayKey(deal.now)), count, (author) => (active.has(author) ? 1 : 0));
}

// Today's Anytime stack number `stack` (from 1): posts from any year but this week, with every
// source taking turns, so a channel with 2,000 videos weighs the same as a blog with twelve posts.
// The day deals one order and stack N is its Nth slice of STACK_SIZE.
export function dealStack<T extends Dealable>(items: readonly T[], { stack, ...deal }: Deal & { stack: number }): T[] {
  const day = dayKey(deal.now);
  const pool = poolOf(items, deal);
  // Kept for as long as the day and the pool stay the same, so a pull or "Keep digging" only slices.
  const key = `${day}|${pool.length}|${hash(day, pool.map((item) => item.id).join("\n"))}`;
  if (stacks?.key !== key) stacks = { key, order: turns(pool, stackSeed(day), pool.length) };
  return (stacks.order as T[]).slice((stack - 1) * STACK_SIZE, stack * STACK_SIZE);
}

let stacks: { key: string; order: readonly Dealable[] } | undefined;

const dealtBefore = (dealt: Dealt, id: string, day: string) => {
  const at = dealt[id];
  return at !== undefined && at < day;
};

// Per source and kind, how deep the deck goes in each ranking.
const DECK_HAND_DEPTH = 2;
const DECK_STACK_DEPTH = 6;

// What the build publishes for `day` so a phone can deal without the archive: for each source and
// kind, its best posts in the pool by the hand's ranking and by the stack's. Taking turns ranks a
// source's posts by these same hashes, so the deck deals what the archive would until a device's own
// favourites, archive, No AI, format tab and earlier deals reach past that depth. Per kind as well as
// source, so a hand filtered by kind or format still finds every source's best.
export function deckFor<T extends Dealable & { kind: string }>(items: readonly T[], day: string): T[] {
  const cutoff = poolCutoff(day);
  const picked = new Set<T>();
  const groups = Map.groupBy(
    items.filter((item) => item.publishedAt < cutoff),
    (item) => `${item.author}\n${item.kind}`,
  );
  for (const posts of groups.values()) {
    for (const post of best(posts, handSeed(day), DECK_HAND_DEPTH)) picked.add(post);
    for (const post of best(posts, stackSeed(day), DECK_STACK_DEPTH)) picked.add(post);
  }
  return items.filter((item) => picked.has(item));
}

const best = <T extends Dealable>(posts: readonly T[], seed: string, count: number) =>
  posts
    .map((item) => ({ item, rank: hash(seed, item.id) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count)
    .map(({ item }) => item);

// Sources take turns: each one's best post by the day's hash, then each one's second best, and so on.
// Ranking by a hash of the post id, not by its position, keeps a card in place when another post leaves
// the pool (archived on another device, or a new post arriving).
// Each post and source is hashed once, and only the first `limit` turns are taken.
function turns<T extends Dealable>(items: readonly T[], seed: string, limit: number, priority: (author: string) => number = () => 0): T[] {
  const bySource = Map.groupBy(
    items.map((item) => ({ item, rank: hash(seed, item.id) })),
    ({ item }) => item.author,
  );
  const queues = [...bySource]
    .map(([author, posts]) => ({ priority: priority(author), rank: hash(seed, author), posts: posts.sort((a, b) => a.rank - b.rank) }))
    .sort((a, b) => a.priority - b.priority || a.rank - b.rank);
  const out: T[] = [];
  const total = Math.min(limit, items.length);
  for (let round = 0; out.length < total; round++) {
    for (const { posts } of queues) {
      if (out.length === total) break;
      if (posts[round]) out.push(posts[round]!.item);
    }
  }
  return out;
}

// FNV-1a: small, fast, and the same on every device.
function hash(seed: string, text: string): number {
  let h = 0x811c9dc5;
  const s = `${seed}|${text}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
