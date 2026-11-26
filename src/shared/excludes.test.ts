import { expect, test } from "bun:test";
import { isExcluded, type ExcludeId } from "./excludes";

const ai = new Set<ExcludeId>(["ai"]);

test("the AI preset hides posts that mention AI in the title or summary", () => {
  expect(isExcluded({ title: "Build 'cat' in C, the AI way" }, ai)).toBe(true);
  expect(isExcluded({ title: "Dispatch 020", summary: "Early AI-generated sketches" }, ai)).toBe(true);
  expect(isExcluded({ title: "On artificial intelligence and craft" }, ai)).toBe(true);
  expect(isExcluded({ title: "Notes on Super  Intelligence" }, ai)).toBe(true);
  expect(isExcluded({ title: "Superintelligence soon?" }, ai)).toBe(true);
});

test("the AI preset leaves words that merely contain the letters alone", () => {
  expect(isExcluded({ title: "Thai street food", summary: "She said it was fair and plain" }, ai)).toBe(false);
});

test("posts that say No AI stay visible even when they mention AI elsewhere", () => {
  expect(isExcluded({ title: "No AI. Build 'cat' command in C - but better for AI" }, ai)).toBe(false);
  expect(isExcluded({ title: "Making art with no ai at all" }, ai)).toBe(false);
});

test("a No AI phrase in the summary does not rescue a post about AI", () => {
  const post = { title: "pure Human beats AI slop", summary: "I took an extreme path to prove a point: No AI." };
  expect(isExcluded(post, ai)).toBe(true);
});

test("nothing is hidden when no preset is active", () => {
  expect(isExcluded({ title: "AI everywhere" }, new Set())).toBe(false);
});

test("a calmer replacement title does not hide that the original was about AI", () => {
  expect(isExcluded({ title: "How diffusion models make images", originalTitle: "AI Just Changed EVERYTHING" }, ai)).toBe(true);
});

test("the AI preset hides posts about AI models and labs by name", () => {
  for (const title of [
    "I asked Claude to turn a PDF into MIDI",
    "Harnessing ChatGPT hallucinations",
    "An interview with OpenAI",
    "What Open AI said next",
    "Recent work by Anthropic",
    "DeepSeek surprised everyone",
    "Representation Engineering Mistral-7B",
    "Before AGI",
    "Gemini 2.0 Flash",
    "Let's ask GPT-5 Instant",
    "GPT-4o and gpt5 and custom GPTs",
    "GPT Tokenizer",
    "Codex 5.3 with a vague prompt",
  ]) {
    expect(isExcluded({ title }, ai)).toBe(true);
  }
});

test("people and places that share a model's name stay visible", () => {
  expect(isExcluded({ title: "Claude Shannon and the bit" }, ai)).toBe(false);
  expect(isExcluded({ title: "Painting like Claude Monet" }, ai)).toBe(false);
  expect(isExcluded({ title: "claude debussy, clair de lune" }, ai)).toBe(false);
  expect(isExcluded({ title: "Meet the Meetups Czar", summary: "Astral Codex Ten and its predecessor" }, ai)).toBe(false);
});

test("sparing Claude Shannon does not spare a post that is also about Claude the model", () => {
  expect(isExcluded({ title: "Claude Shannon would have loved Claude Code" }, ai)).toBe(true);
});

test("words that only contain a model's name stay visible", () => {
  expect(isExcluded({ title: "Claudette's agile gemstones", summary: "Codexes and mistrals" }, ai)).toBe(false);
});
