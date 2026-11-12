import { expect, test } from "bun:test";
import { emptyLibrary, isShelved, mergeLibraries, parseLibrary, recordDealt, sameLibrary, shelfItems, toggleShelf } from "./library";
import type { FeedItem } from "./types";

const item = (id: string, title = id): FeedItem => ({
  id,
  kind: "rss",
  title,
  url: `https://example.com/${id}`,
  publishedAt: "2026-11-01T00:00:00.000Z",
  author: "Someone",
  tags: [],
});

test("toggling a shelf adds the post, and toggling again removes it", () => {
  const added = toggleShelf(emptyLibrary(), "archive", item("a"), new Date("2026-11-11T00:00:00Z"));
  expect(isShelved(added, "archive", "a")).toBe(true);
  expect(isShelved(added, "favourites", "a")).toBe(false);
  expect(isShelved(toggleShelf(added, "archive", item("a"), new Date()), "archive", "a")).toBe(false);
});

test("a shelf lists newest saves first and prefers the feed's fresh copy", () => {
  let library = toggleShelf(emptyLibrary(), "favourites", item("old"), new Date("2026-11-01T00:00:00Z"));
  library = toggleShelf(library, "favourites", item("new", "snapshot"), new Date("2026-11-10T00:00:00Z"));
  const fresh = new Map([["new", item("new", "fresh title")]]);
  expect(shelfItems(library, "favourites", fresh).map((i) => i.title)).toEqual(["fresh title", "old"]);
});

test("a post that aged out of the feed still shows from its snapshot", () => {
  const library = toggleShelf(emptyLibrary(), "favourites", item("gone", "Kept forever"), new Date());
  expect(shelfItems(library, "favourites", new Map()).map((i) => i.title)).toEqual(["Kept forever"]);
});

test("parsing stored data keeps valid entries and drops broken ones", () => {
  const saved = JSON.parse(JSON.stringify(toggleShelf(emptyLibrary(), "archive", item("a"), new Date())));
  saved.archive.broken = { at: "x", item: { id: "broken" } };
  expect(Object.keys(parseLibrary(saved).archive)).toEqual(["a"]);
  expect(parseLibrary("not json at all")).toEqual(emptyLibrary());
});

test("removing a post remembers when, and saving it again forgets the removal", () => {
  const saved = toggleShelf(emptyLibrary(), "favourites", item("a"), new Date("2026-11-01T00:00:00Z"));
  const removed = toggleShelf(saved, "favourites", item("a"), new Date("2026-11-02T00:00:00Z"));
  expect(removed.removed.favourites).toEqual({ a: "2026-11-02T00:00:00.000Z" });
  const again = toggleShelf(removed, "favourites", item("a"), new Date("2026-11-03T00:00:00Z"));
  expect(again.removed.favourites).toEqual({});
  expect(isShelved(again, "favourites", "a")).toBe(true);
});

test("merging keeps the latest change per post, whichever device made it", () => {
  const day = (d: number) => new Date(`2026-11-0${d}T00:00:00Z`);
  const phone = toggleShelf(toggleShelf(emptyLibrary(), "favourites", item("a"), day(1)), "archive", item("b"), day(2));
  // The laptop saw both, then removed the favourite later and archived another post.
  let laptop = mergeLibraries(emptyLibrary(), phone);
  laptop = toggleShelf(laptop, "favourites", item("a"), day(3));
  laptop = toggleShelf(laptop, "archive", item("c"), day(4));
  const merged = mergeLibraries(phone, laptop);
  expect(isShelved(merged, "favourites", "a")).toBe(false);
  expect(Object.keys(merged.archive).sort()).toEqual(["b", "c"]);
  expect(mergeLibraries(laptop, phone)).toEqual(merged);
  // Once the phone has synced, saving it again there brings it back everywhere.
  const resaved = toggleShelf(mergeLibraries(phone, merged), "favourites", item("a"), day(5));
  expect(isShelved(mergeLibraries(merged, resaved), "favourites", "a")).toBe(true);
});

test("a merge that changes nothing reads as the same library", () => {
  const library = toggleShelf(emptyLibrary(), "archive", item("a"), new Date("2026-11-01T00:00:00Z"));
  expect(sameLibrary(mergeLibraries(library, library), library)).toBe(true);
  expect(sameLibrary(library, emptyLibrary())).toBe(false);
});

test("a library stored before removals were tracked still parses, and removals round-trip", () => {
  const old = { favourites: { a: { item: item("a"), at: "2026-11-01T00:00:00.000Z" } }, archive: {} };
  expect(parseLibrary(old).removed).toEqual({ favourites: {}, archive: {} });
  const removed = toggleShelf(parseLibrary(old), "favourites", item("a"), new Date("2026-11-02T00:00:00Z"));
  expect(parseLibrary(JSON.parse(JSON.stringify(removed)))).toEqual(removed);
});

test("dealt days merge to the later day, round-trip, and old ones are forgotten", () => {
  const a = recordDealt(emptyLibrary(), ["one", "two"], "2026-11-10");
  const b = recordDealt(emptyLibrary(), ["two", "three"], "2026-11-11");
  const merged = mergeLibraries(a, b);
  expect(merged.dealt).toEqual({ one: "2026-11-10", two: "2026-11-11", three: "2026-11-11" });
  expect(parseLibrary(JSON.parse(JSON.stringify(merged)))).toEqual(merged);
  expect(sameLibrary(merged, mergeLibraries(merged, a))).toBe(true);
  expect(sameLibrary(merged, a)).toBe(false);
  expect(recordDealt(merged, ["one"], "2026-11-10")).toBe(merged);
  expect(recordDealt(merged, ["four"], "2027-03-01").dealt).toEqual({ four: "2027-03-01" });
});

test("a library stored before dealing existed still parses", () => {
  expect(parseLibrary({ favourites: {}, archive: {} }).dealt).toEqual({});
});
