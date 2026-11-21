import { expect, test } from "bun:test";
import { emptyLibrary, levelOf, mergeLibraries, parseLibrary, sameLibrary, setLevel, tunedPeople } from "./library";
import { dealHand, dealStack, isFresh } from "./order";
import { thinLess, WEIGHT } from "./tuning";

const at = (iso: string) => new Date(iso);

test("a person is normal until set, and the latest setting wins a merge, a reset included", () => {
  expect(levelOf(emptyLibrary(), "A")).toBe("normal");
  const paused = setLevel(emptyLibrary(), "A", "pause", at("2026-11-01T00:00:00Z"));
  const resumed = setLevel(paused, "A", "normal", at("2026-11-02T00:00:00Z"));
  expect(levelOf(mergeLibraries(paused, resumed), "A")).toBe("normal");
  expect(levelOf(mergeLibraries(resumed, paused), "A")).toBe("normal");
  expect(tunedPeople(resumed)).toEqual([]);
});

test("on a tie the setting that shows less wins, so a pause is never lost", () => {
  const when = at("2026-11-01T00:00:00Z");
  const more = setLevel(emptyLibrary(), "A", "more", when);
  const paused = setLevel(emptyLibrary(), "A", "pause", when);
  expect(levelOf(mergeLibraries(more, paused), "A")).toBe("pause");
  expect(levelOf(mergeLibraries(paused, more), "A")).toBe("pause");
});

test("tuning survives storage and counts as a change to sync", () => {
  const tuned = setLevel(emptyLibrary(), "A", "less", at("2026-11-01T00:00:00Z"));
  const parsed = parseLibrary(JSON.parse(JSON.stringify({ ...tuned, people: { ...tuned.people, B: { level: "loud", at: "x" } } })));
  expect(parsed.people).toEqual(tuned.people);
  expect(sameLibrary(tuned, emptyLibrary())).toBe(false);
  // A library from before tuning existed parses with nobody tuned.
  expect(parseLibrary({ favourites: {}, archive: {} }).people).toEqual({});
});

test("Less keeps one post a day, the newest, and leaves everyone else alone", () => {
  // Noon local time, so each post's local day is the date it names wherever the tests run.
  const post = (id: string, author: string, day: number, hour: number) => ({ id, author, publishedAt: new Date(2026, 10, day, hour).toISOString() });
  const items = [post("a1", "A", 10, 9), post("a2", "A", 10, 15), post("a3", "A", 10, 11), post("a4", "A", 9, 12), post("b1", "B", 10, 9), post("b2", "B", 10, 10)];
  expect(thinLess(items, (author) => author === "A").map((item) => item.id)).toEqual(["a2", "a4", "b1", "b2"]);
  expect(thinLess(items, () => false)).toEqual(items);
});

const now = new Date(2026, 10, 11, 12);
const old = (author: string, n: number) => ({ id: `${author}-${n}`, author, publishedAt: `2019-03-${String((n % 28) + 1).padStart(2, "0")}T00:00:00.000Z` });
const sources = Array.from({ length: 120 }, (_, i) => `S${i}`);
const pool = sources.flatMap((author) => Array.from({ length: 6 }, (_, n) => old(author, n)));

// Over many days, how often a source gets a seat in the first stack.
function seats(author: string, weight: (author: string) => number): number {
  let seated = 0;
  for (let d = 0; d < 120; d++) {
    const day = new Date(2026, 10, 11 + d, 12);
    if (dealStack(pool, { now: day, dealt: {}, stack: 1, weight }).some((item) => item.author === author)) seated++;
  }
  return seated;
}

test("More deals a person into the first stack far more often, and Less far less", () => {
  const normal = seats("S7", () => 1);
  const more = seats("S7", (author) => (author === "S7" ? WEIGHT.more : 1));
  const less = seats("S7", (author) => (author === "S7" ? WEIGHT.less : 1));
  expect(more).toBeGreaterThan(normal * 2);
  expect(less).toBeLessThan(normal / 2);
});

test("all-normal weights deal exactly what no weights deal", () => {
  const plain = dealStack(pool, { now, dealt: {}, stack: 1 });
  expect(dealStack(pool, { now, dealt: {}, stack: 1, weight: () => 1 })).toEqual(plain);
  const fresh = Array.from({ length: 40 }, (_, n) => ({ id: `new-${n}`, author: `S${n}`, publishedAt: new Date(now.getTime() - 3_600_000).toISOString() }));
  const items = [...pool, ...fresh];
  const hand = (weight?: (author: string) => number) => dealHand(items, { now, dealt: {}, fresh: items.filter((item) => isFresh(item, now)), weight });
  expect(hand(() => 1)).toEqual(hand());
});
