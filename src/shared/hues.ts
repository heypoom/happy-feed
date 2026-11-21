// Ordered so neighbours contrast: a small tag set walks this list and never lands on three warm hues.
export const HUES = ["sky", "sun", "berry", "mint", "grape", "tangerine", "teal", "lime", "orchid", "coral"] as const;
export type Hue = (typeof HUES)[number];

function hash(text: string): number {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.codePointAt(0)!, 16777619);
  return h >>> 0;
}

export function hueOf(text: string): Hue {
  return HUES[hash(text) % HUES.length]!;
}

export function assignHues(tags: readonly string[]): Map<string, Hue> {
  return new Map([...new Set(tags)].sort().map((tag, i) => [tag, HUES[i % HUES.length]!]));
}
