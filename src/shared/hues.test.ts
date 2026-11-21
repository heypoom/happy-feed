import { expect, test } from "bun:test";
import { assignHues, HUES } from "./hues";

test("up to ten tags each get a different hue", () => {
  const tags = ["Coding", "Computer Science", "Creative Coding", "Culture", "Design", "HCI", "Makers", "Math", "Play", "STEM"];
  expect(new Set(assignHues(tags).values()).size).toBe(HUES.length);
});

test("a tag keeps its hue regardless of input order", () => {
  const tags = ["HCI", "Coding", "Creative Coding"];
  expect(assignHues(tags)).toEqual(assignHues([...tags].reverse()));
});
