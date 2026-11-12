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
  const cutoff = new Date(now.getTime() - FRESH_MS).toISOString();
  const dealt = new Set(hand.map((item) => item.id));
  const ordered = diverseOrder(items.filter((item) => !dealt.has(item.id)));
  const freshCount = ordered.findLastIndex((item) => item.publishedAt >= cutoff) + 1;
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

// A few older posts for today's New feed, one per source, quiet sources first: a source that posted
// this week already has a card above.
export function dealHand<T extends Dealable>(items: readonly T[], { now, dealt }: Deal): T[] {
  const day = dayKey(now);
  const cutoff = new Date(now.getTime() - FRESH_MS).toISOString();
  const fresh = items.filter((item) => item.publishedAt >= cutoff);
  const count = Math.min(HAND_MAX, Math.floor(fresh.length / HAND_EVERY));
  if (count === 0) return [];
  const active = new Set(fresh.map((item) => item.author));
  const older = items.filter((item) => item.publishedAt < cutoff && !dealtBefore(dealt, item.id, day));
  return turns(older, `hand:${day}`, (author) => (active.has(author) ? 1 : 0)).slice(0, count);
}

// Today's Anytime stack number `stack` (from 1): posts from any year but this week, with every
// source taking turns, so a channel with 2,000 videos weighs the same as a blog with twelve posts.
// Stack 2 deals from what stack 1 left, and so on.
export function dealStack<T extends Dealable>(items: readonly T[], { now, dealt, stack }: Deal & { stack: number }): T[] {
  const day = dayKey(now);
  const cutoff = new Date(now.getTime() - FRESH_MS).toISOString();
  let remaining = items.filter((item) => item.publishedAt < cutoff && !dealtBefore(dealt, item.id, day));
  let picked: T[] = [];
  for (let n = 1; n <= stack; n++) {
    // Earlier stacks took everything: there is no stack `n`.
    if (remaining.length === 0) return [];
    picked = turns(remaining, `stack:${day}:${n}`).slice(0, STACK_SIZE);
    const taken = new Set(picked.map((item) => item.id));
    remaining = remaining.filter((item) => !taken.has(item.id));
  }
  return picked;
}

const dealtBefore = (dealt: Dealt, id: string, day: string) => {
  const at = dealt[id];
  return at !== undefined && at < day;
};

// Sources take turns: each one's best post by the day's hash, then each one's second best, and so on.
// Ranking by a hash of the post id, not by its position, keeps a card in place when another post leaves
// the pool (archived on another device, or a new post arriving).
function turns<T extends Dealable>(items: readonly T[], seed: string, priority: (author: string) => number = () => 0): T[] {
  const bySource = Map.groupBy(items, (item) => item.author);
  const queues = [...bySource]
    .map(([author, posts]) => ({ author, posts: posts.toSorted((a, b) => hash(seed, a.id) - hash(seed, b.id)) }))
    .sort((a, b) => priority(a.author) - priority(b.author) || hash(seed, a.author) - hash(seed, b.author));
  const out: T[] = [];
  for (let round = 0; out.length < items.length; round++) {
    for (const { posts } of queues) if (posts[round]) out.push(posts[round]!);
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
