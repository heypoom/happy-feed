import { expect, test } from "bun:test";
import { matchesSearch, matchRanges, searchTerms } from "./search";

const post = { title: "Making shaders with Café music", summary: "A slow evening of GLSL", author: "Chris" };

test("every word must appear, in any order and any case", () => {
  expect(matchesSearch(post, searchTerms("glsl SHADERS"))).toBe(true);
  expect(matchesSearch(post, searchTerms("shaders python"))).toBe(false);
});

test("words match inside words, and accents don't matter either way", () => {
  expect(matchesSearch(post, searchTerms("shad"))).toBe(true);
  expect(matchesSearch(post, searchTerms("cafe"))).toBe(true);
  expect(matchesSearch({ ...post, title: "Cafe notes" }, searchTerms("café"))).toBe(true);
});

test("the person's name and the original title are searched too", () => {
  expect(matchesSearch(post, searchTerms("chris"))).toBe(true);
  expect(matchesSearch({ ...post, originalTitle: "I BROKE the GPU" }, searchTerms("broke"))).toBe(true);
});

test("Thai matches as typed, vowel marks included", () => {
  const thai = { title: "เสียงภาษาไทยของโมเดล", author: "Poom" };
  expect(matchesSearch(thai, searchTerms("ภาษาไทย"))).toBe(true);
  expect(matchesSearch(thai, searchTerms("สยง"))).toBe(false);
});

test("an empty query matches everything", () => {
  expect(searchTerms("   ")).toEqual([]);
  expect(matchesSearch(post, [])).toBe(true);
});

test("ranges point into the original text, accents and all", () => {
  const text = "Making shaders with Café music";
  expect(matchRanges(text, searchTerms("cafe shad")).map(([a, b]) => text.slice(a, b))).toEqual(["shad", "Café"]);
});

test("overlapping matches merge into one range", () => {
  expect(matchRanges("shaders", searchTerms("shade aders"))).toEqual([[0, 7]]);
});

test("a match after an emoji keeps its offsets", () => {
  const text = "🌱 sprout";
  expect(matchRanges(text, ["sprout"]).map(([a, b]) => text.slice(a, b))).toEqual(["sprout"]);
});
