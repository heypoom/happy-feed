import { expect, test } from "bun:test";
import { dayKey, deckFor, dealHand, dealStack, diverseOrder, HAND_MAX, isFresh, orderFeed, poolCutoff, STACK_SIZE, type Dealt } from "./order";

let serial = 0;
const item = (author: string, day: number) => ({ id: `p${serial++}`, author, publishedAt: `2026-11-${String(day).padStart(2, "0")}T00:00:00.000Z` });
const authors = (items: { author: string }[]) => items.map((i) => i.author).join("");

test("keeps newest first but never more than 2 consecutive cards from one author", () => {
  const items = [item("A", 10), item("A", 9), item("A", 8), item("A", 7), item("B", 6), item("C", 5)];
  expect(authors(diverseOrder(items))).toBe("AABAAC");
});

test("is plain newest-first when authors already alternate", () => {
  const items = [item("B", 3), item("A", 9), item("C", 1), item("A", 5)];
  expect(diverseOrder(items).map((i) => i.publishedAt.slice(8, 10))).toEqual(["09", "05", "03", "01"]);
});

test("keeps every item when one author is all that is left", () => {
  const items = [item("A", 10), item("B", 9), item("A", 8), item("A", 7), item("A", 6)];
  expect(authors(diverseOrder(items))).toBe("ABAAA");
});

test("places the caught-up point after the last fresh card, even when older cards break a run", () => {
  const now = new Date("2026-11-11T00:00:00Z");
  const items = [item("A", 10), item("A", 9), item("A", 8), item("B", 2), item("C", 1)];
  const { ordered, freshCount } = orderFeed(items, now);
  expect(authors(ordered)).toBe("AABAC");
  expect(freshCount).toBe(4);
  expect(orderFeed([item("A", 1)], now).freshCount).toBe(0);
});

// Noon local time, so the local day is the 11th wherever the tests run.
const now = new Date(2026, 10, 11, 12);
const old = (author: string, n: number, year = 2019) => ({ id: `${author}-${n}`, author, publishedAt: `${year}-03-${String((n % 28) + 1).padStart(2, "0")}T00:00:00.000Z` });
const week = (author: string, n: number) => ({ id: `${author}-new-${n}`, author, publishedAt: new Date(now.getTime() - (n % 6) * 86_400_000).toISOString() });
const many = (make: (author: string, n: number) => ReturnType<typeof old>, authors: string[], each: number) => authors.flatMap((a) => Array.from({ length: each }, (_, n) => make(a, n)));

// The client deals the hand from the posts in view, this week's among them.
const handOf = <T extends ReturnType<typeof old>>(items: T[], when = now, dealt: Dealt = {}) =>
  dealHand(items, { now: when, dealt, fresh: items.filter((post) => isFresh(post, when)) });

const archive = many(old, ["Museum", "Patt", "Blog", "Quiet", "Essays", "Math", "Games", "Art", "Code", "Film"], 30);
const thisWeek = many(week, ["Museum", "Patt", "Blog"], 10);

test("the hand is one older post for every five new, at most eight, one per source, quiet sources first", () => {
  const hand = handOf([...thisWeek, ...archive]);
  expect(hand).toHaveLength(Math.min(HAND_MAX, Math.floor(thisWeek.length / 5)));
  expect(new Set(hand.map((post) => post.author)).size).toBe(hand.length);
  expect(hand.every((post) => post.publishedAt < "2026-11-04")).toBe(true);
  const quiet = hand.filter((post) => !["Museum", "Patt", "Blog"].includes(post.author));
  expect(quiet.length).toBe(Math.min(hand.length, 7));
});

test("the same day deals the same hand, and the next day deals a new one", () => {
  const items = [...thisWeek, ...archive];
  const ids = (when: Date) => handOf(items, when).map((post) => post.id);
  expect(ids(new Date(2026, 10, 11, 23, 59))).toEqual(ids(now));
  expect(ids(new Date(2026, 10, 12, 0, 1))).not.toEqual(ids(now));
});

test("archiving one hand card leaves the others where they were", () => {
  const items = [...thisWeek, ...archive];
  const hand = handOf(items);
  const without = handOf(items.filter((post) => post.id !== hand[2]!.id));
  expect(without.filter((post) => post.author !== hand[2]!.author).map((post) => post.id)).toEqual(
    hand.filter((post) => post.author !== hand[2]!.author).map((post) => post.id),
  );
});

test("posts dealt on an earlier day sit out; posts dealt today stay dealt", () => {
  const items = [...thisWeek, ...archive];
  const hand = handOf(items);
  const today = Object.fromEntries(hand.map((post) => [post.id, dayKey(now)]));
  expect(handOf(items, now, today)).toEqual(hand);
  const tomorrow = new Date(2026, 10, 12, 12);
  const next = handOf(items, tomorrow, today);
  expect(next.some((post) => post.id in today)).toBe(false);
});

test("a hand weaves in after every five new cards, and the caught-up point counts it", () => {
  const items = [...thisWeek, ...archive];
  const hand = handOf(items);
  const { ordered, freshCount } = orderFeed(items, now, hand);
  expect(freshCount).toBe(thisWeek.length + hand.length);
  expect(ordered[5]).toBe(hand[0]!);
  expect(ordered[11]).toBe(hand[1]!);
  expect(ordered.length).toBe(items.length);
  expect(new Set(ordered.map((post) => post.id)).size).toBe(items.length);
});

test("too few new posts deals no hand", () => {
  expect(handOf([...thisWeek.slice(0, 4), ...archive])).toEqual([]);
});

test("a stack gives every source a turn, however many posts it has, and skips this week", () => {
  const giant = many(old, ["Giant"], 2000);
  const items = [...thisWeek, ...archive, ...giant];
  const stack = dealStack(items, { now, dealt: {}, stack: 1 });
  expect(stack).toHaveLength(STACK_SIZE);
  expect(stack.filter((post) => post.author === "Giant").length).toBeLessThanOrEqual(3);
  expect(stack.every((post) => post.publishedAt < "2026-11-04")).toBe(true);
  // Taking turns means no source follows itself.
  expect(stack.every((post, i) => i === 0 || post.author !== stack[i - 1]!.author)).toBe(true);
});

test("one source alone still fills a stack from its back catalogue", () => {
  const stack = dealStack(archive.filter((post) => post.author === "Patt"), { now, dealt: {}, stack: 1 });
  expect(stack).toHaveLength(STACK_SIZE);
});

test("stack 2 deals what stack 1 left, and the same stack comes back on reload", () => {
  const first = dealStack(archive, { now, dealt: {}, stack: 1 });
  const second = dealStack(archive, { now, dealt: {}, stack: 2 });
  expect(second.some((post) => first.includes(post))).toBe(false);
  expect(dealStack(archive, { now, dealt: {}, stack: 2 })).toEqual(second);
});

test("a stack past the end of the pool is empty, not a repeat of the last one", () => {
  const few = archive.slice(0, 3);
  expect(dealStack(few, { now, dealt: {}, stack: 1 })).toHaveLength(3);
  expect(dealStack(few, { now, dealt: {}, stack: 2 })).toEqual([]);
});

test("every hour of a day deals from the same pool: posts from before the week's first day, in UTC", () => {
  expect(poolCutoff("2026-11-11")).toBe("2026-11-04T00:00:00.000Z");
  const edge = [{ id: "in", author: "A", publishedAt: "2026-11-03T23:59:59.999Z" }, { id: "out", author: "B", publishedAt: "2026-11-04T00:00:00.000Z" }];
  for (const hour of [0, 12, 23]) expect(dealStack(edge, { now: new Date(2026, 10, 11, hour), dealt: {}, stack: 1 }).map((post) => post.id)).toEqual(["in"]);
});

const kinded = [
  ...many(old, ["Museum", "Patt", "Blog", "Quiet", "Essays", "Math", "Games", "Art", "Code", "Film", "Ink"], 40),
  ...many((author, n) => old(author, n, 2015), ["Giant"], 2000),
].map((post) => ({ ...post, kind: "rss" }));
const kindedWeek = thisWeek.map((post) => ({ ...post, kind: "rss" }));

test("a day's deck deals the same hand and stacks as the whole archive, as deep as the deck goes", () => {
  const deck = deckFor(kinded, dayKey(now));
  expect(deck.length).toBeLessThanOrEqual(12 * 8);
  expect(handOf([...kindedWeek, ...deck])).toEqual(handOf([...kindedWeek, ...kinded]));
  // Twelve sources, six deep: three stacks of 24.
  for (const stack of [1, 2, 3]) expect(dealStack(deck, { now, dealt: {}, stack })).toEqual(dealStack(kinded, { now, dealt: {}, stack }));
});

test("a deck keeps each source's best of every kind, so a hand filtered by kind deals as the archive would", () => {
  const videos = many((author, n) => ({ ...old(author, n), id: `${author}-video-${n}` }), ["Museum", "Patt", "Quiet"], 40).map((post) => ({ ...post, kind: "youtube" }));
  const items = [...kindedWeek, ...kinded, ...videos];
  const onlyVideos = <T extends { kind: string }>(posts: T[]) => posts.filter((post) => post.kind === "youtube");
  const fresh = kindedWeek.slice(0, 15);
  const deck = deckFor(items, dayKey(now));
  const hand = (pool: typeof items) => dealHand(onlyVideos(pool), { now, dealt: {}, fresh });
  expect(hand(deck)).toHaveLength(3);
  expect(hand(deck)).toEqual(hand(items));
});

test("a stack slices the day's one order, so digging deeper never repeats a card", () => {
  const seen = new Set<string>();
  for (let stack = 1; ; stack++) {
    const dealt = dealStack(archive, { now, dealt: {}, stack });
    if (dealt.length === 0) break;
    for (const post of dealt) {
      expect(seen.has(post.id)).toBe(false);
      seen.add(post.id);
    }
  }
  expect(seen.size).toBe(archive.length);
});
