// `topics` is set at publish, from the full text, for posts sent without their summary.
type Excludable = { title: string; originalTitle?: string; summary?: string; topics?: readonly ExcludeId[] };

// A term is a phrase (any run of spaces matches its spaces) or, where one phrase can't say it, a pattern.
type Term = string | RegExp;

type Preset = {
  label: string;
  terms: readonly Term[];
  // A title with a keep phrase keeps the whole post.
  keep?: readonly Term[];
  // Phrases that use a term for something else. They are ignored, so a post that only mentions
  // Claude Shannon stays, while one about Claude Shannon and Claude Code is still hidden.
  spare?: readonly Term[];
};

export const EXCLUDE_PRESETS = {
  ai: {
    label: "AI",
    terms: [
      "AI",
      "Artificial Intelligence",
      "Superintelligence",
      "Super Intelligence",
      "AGI",
      "ChatGPT",
      // GPT, GPT-5, GPT-4o, gpt5 and GPTs.
      /GPT(?:-?\d\w*|s)?/,
      "Claude",
      "OpenAI",
      "Open AI",
      "Anthropic",
      "DeepSeek",
      "Deep Seek",
      "Mistral",
      "Gemini",
      "Codex",
    ],
    keep: ["No AI"],
    spare: ["Claude Shannon", "Claude Monet", "Claude Debussy", "Astral Codex"],
  },
} as const satisfies Record<string, Preset>;

export type ExcludeId = keyof typeof EXCLUDE_PRESETS;

export const EXCLUDE_IDS = Object.keys(EXCLUDE_PRESETS) as ExcludeId[];

const source = (term: Term) =>
  typeof term === "string" ? term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+") : term.source;

// Whole-word, case-insensitive: "AI" catches "AI-generated" and "AI's" but not "Thai" or "said".
const wordPattern = (terms: readonly Term[], flags = "i") => new RegExp(`\\b(?:${terms.map(source).join("|")})\\b`, flags);

const PATTERNS = Object.fromEntries(
  EXCLUDE_IDS.map((id) => {
    const { terms, keep = [], spare = [] } = EXCLUDE_PRESETS[id] as Preset;
    return [
      id,
      {
        hide: wordPattern(terms),
        keep: keep.length > 0 ? wordPattern(keep) : undefined,
        spare: spare.length > 0 ? wordPattern(spare, "gi") : undefined,
      },
    ];
  }),
) as Record<ExcludeId, { hide: RegExp; keep?: RegExp; spare?: RegExp }>;

export function isExcluded(item: Excludable, active: ReadonlySet<ExcludeId>): boolean {
  return active.size > 0 && (item.topics ?? topicsOf(item)).some((id) => active.has(id));
}

// Every preset a post is about.
export function topicsOf(item: Excludable): ExcludeId[] {
  // A calmer DeArrow title must not let a post past a topic it is really about.
  const text = `${item.title}\n${item.originalTitle ?? ""}\n${item.summary ?? ""}`;
  return EXCLUDE_IDS.filter((id) => {
    const { hide, keep, spare } = PATTERNS[id];
    // A keep phrase only counts in the title: "No AI. Build cat in C" is the point of the post,
    // while "...to prove a point: No AI." in a summary about AI is still a post about AI.
    return hide.test(spare ? text.replace(spare, " ") : text) && !keep?.test(item.originalTitle ?? item.title);
  });
}
