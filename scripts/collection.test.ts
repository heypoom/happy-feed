import { expect, test } from "bun:test";
import { parseCollection } from "./collection";
import { mergeSources } from "./sources";

const valid = {
  metadata: { name: "Faves", mute: ["politics"] },
  entries: [{ name: "Patt Vira", youtube: "https://www.youtube.com/@pattvira", tags: ["Creative Coding"] }],
};

test("parses a valid collection into typed entries", () => {
  expect(parseCollection(valid, "faves.json")).toEqual({
    name: "Faves",
    description: undefined,
    mute: ["politics"],
    entries: [
      {
        name: "Patt Vira",
        description: undefined,
        tags: ["Creative Coding"],
        sources: { youtube: "https://www.youtube.com/@pattvira" },
      },
    ],
  });
});

test("rejects an entry with an unknown key", () => {
  const bad = { ...valid, entries: [{ name: "X", youtube: "https://youtube.com/@x", tiktok: "https://tiktok.com/@x" }] };
  expect(() => parseCollection(bad, "faves.json")).toThrow(/entries\[0\].*unknown key.*tiktok/);
});

test("rejects an entry with a bad URL", () => {
  const bad = { ...valid, entries: [{ name: "X", rss: "not a url" }] };
  expect(() => parseCollection(bad, "faves.json")).toThrow(/entries\[0\] \(X\)\.rss is not a valid/);
});

test("rejects an entry with no source", () => {
  const bad = { ...valid, entries: [{ name: "X", tags: [] }] };
  expect(() => parseCollection(bad, "faves.json")).toThrow(/needs at least one/);
});

test("accepts the real collections", async () => {
  for (const file of new Bun.Glob("collection/*.json").scanSync(".")) {
    expect(parseCollection(await Bun.file(file).json(), file).entries.length).toBeGreaterThan(0);
  }
});

test("accepts an archive page URL on an entry", () => {
  const parsed = parseCollection(
    { metadata: { name: "x" }, entries: [{ name: "G", rss: "https://example.com/feed.xml", archive: "https://example.com/" }] },
    "test.json",
  );
  expect(parsed.entries[0]!.archive).toBe("https://example.com/");
});

test("accepts a list of URLs for one kind", () => {
  const parsed = parseCollection(
    { metadata: { name: "x" }, entries: [{ name: "C", rss: ["https://medium.com/feed/@c", "https://medium.com/feed/c-pub"] }] },
    "test.json",
  );
  expect(parsed.entries[0]!.sources.rss).toEqual(["https://medium.com/feed/@c", "https://medium.com/feed/c-pub"]);
  const sources = mergeSources([parsed]);
  expect(sources.map((s) => [s.author, s.kind, s.url])).toEqual([
    ["C", "rss", "https://medium.com/feed/@c"],
    ["C", "rss", "https://medium.com/feed/c-pub"],
  ]);
});

test("rejects a bad or empty URL list", () => {
  const entry = (rss: unknown) => ({ metadata: { name: "x" }, entries: [{ name: "C", rss }] });
  expect(() => parseCollection(entry(["https://example.com/feed", "nope"]), "t.json")).toThrow(/entries\[0\] \(C\)\.rss\[1\] is not a valid/);
  expect(() => parseCollection(entry([]), "t.json")).toThrow(/rss must list at least one URL/);
});
