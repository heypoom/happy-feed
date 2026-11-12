// `topics` is set at publish, from the full text, for posts sent without their summary.
type Excludable = { title: string; originalTitle?: string; summary?: string; topics?: readonly ExcludeId[] };

export const EXCLUDE_PRESETS = {
  ai: {
    label: "AI",
    terms: ["AI", "Artificial Intelligence", "Superintelligence", "Super Intelligence"],
    keep: ["No AI"],
  },
} as const satisfies Record<string, { label: string; terms: readonly string[]; keep?: readonly string[] }>;

export type ExcludeId = keyof typeof EXCLUDE_PRESETS;

export const EXCLUDE_IDS = Object.keys(EXCLUDE_PRESETS) as ExcludeId[];

const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

// Whole-word, case-insensitive: "AI" catches "AI-generated" and "AI's" but not "Thai" or "said".
const wordPattern = (terms: readonly string[]) => new RegExp(`\\b(?:${terms.map(escape).join("|")})\\b`, "i");

const PATTERNS = Object.fromEntries(
  EXCLUDE_IDS.map((id) => {
    const { terms, keep = [] } = EXCLUDE_PRESETS[id] as { terms: readonly string[]; keep?: readonly string[] };
    return [id, { hide: wordPattern(terms), keep: keep.length > 0 ? wordPattern(keep) : undefined }];
  }),
) as Record<ExcludeId, { hide: RegExp; keep?: RegExp }>;

export function isExcluded(item: Excludable, active: ReadonlySet<ExcludeId>): boolean {
  return active.size > 0 && (item.topics ?? topicsOf(item)).some((id) => active.has(id));
}

// Every preset a post is about.
export function topicsOf(item: Excludable): ExcludeId[] {
  // A calmer DeArrow title must not let a post past a topic it is really about.
  const text = `${item.title}\n${item.originalTitle ?? ""}\n${item.summary ?? ""}`;
  return EXCLUDE_IDS.filter((id) => {
    const { hide, keep } = PATTERNS[id];
    // A keep phrase only counts in the title: "No AI. Build cat in C" is the point of the post,
    // while "...to prove a point: No AI." in a summary about AI is still a post about AI.
    return hide.test(text) && !keep?.test(item.originalTitle ?? item.title);
  });
}
