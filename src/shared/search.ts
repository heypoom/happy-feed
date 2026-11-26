// Feed search: every word typed must appear somewhere in a post, in any case and with or without
// Latin accents, so "cafe" finds "Café". Words match inside words ("shad" finds "shaders"), and Thai,
// which has no spaces between words, matches as typed.

type Searchable = { title: string; originalTitle?: string; summary?: string; author: string };

// Only Latin combining accents fold away: Thai vowels and tone marks are combining marks too, and
// dropping them would make different Thai words match.
const ACCENTS = /[̀-ͯ]/g;

const fold = (text: string) => text.normalize("NFKD").replace(ACCENTS, "").toLowerCase();

export function searchTerms(query: string): string[] {
  return [...new Set(fold(query).split(/\s+/).filter(Boolean))];
}

// Posts are searched on every keystroke, so each one is folded once.
const folded = new WeakMap<Searchable, string>();

export function matchesSearch(item: Searchable, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  let text = folded.get(item);
  if (text === undefined) {
    // A calmer DeArrow title still finds the video by the title its creator gave it.
    text = fold(`${item.title}\n${item.originalTitle ?? ""}\n${item.summary ?? ""}\n${item.author}`);
    folded.set(item, text);
  }
  return terms.every((term) => text.includes(term));
}

// Where the terms appear in `text`, as [start, end) offsets into the original string, merged and in order.
export function matchRanges(text: string, terms: readonly string[]): [number, number][] {
  if (terms.length === 0 || !text) return [];
  // Fold one character at a time, remembering where each folded character came from.
  let folded = "";
  const from: number[] = [];
  for (let i = 0; i < text.length; ) {
    const char = String.fromCodePoint(text.codePointAt(i)!);
    const part = fold(char);
    folded += part;
    for (let k = 0; k < part.length; k++) from.push(i);
    i += char.length;
  }
  from.push(text.length);
  const ranges: [number, number][] = [];
  for (const term of terms) {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) {
      // The end is the start of the character after the match's last one.
      const last = from[at + term.length - 1]!;
      const end = last + String.fromCodePoint(text.codePointAt(last)!).length;
      ranges.push([from[at]!, end]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const prev = merged.at(-1);
    if (prev && range[0] <= prev[1]) prev[1] = Math.max(prev[1], range[1]);
    else merged.push(range);
  }
  return merged;
}
