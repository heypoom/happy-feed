import { SOURCE_KINDS, type FeedItem } from "./types";

export type Shelf = "favourites" | "archive";
export const SHELVES: readonly Shelf[] = ["favourites", "archive"];

export type Saved = { item: FeedItem; at: string };
// `removed` remembers when a post left a shelf, so a removal on one device wins over an older save
// on another when two libraries merge. Without it, a merge could only ever add.
// `dealt` is the day (YYYY-MM-DD) each post was last dealt into a hand or a stack, so other days and
// other devices deal something else.
export type Library = Record<Shelf, Record<string, Saved>> & { removed: Record<Shelf, Record<string, string>>; dealt: Record<string, string> };

export const emptyLibrary = (): Library => ({ favourites: {}, archive: {}, removed: { favourites: {}, archive: {} }, dealt: {} });

// Long enough that a post doesn't come back soon; short enough that the list stays small.
export const DEALT_KEEP_DAYS = 90;

// Marks posts as dealt today and forgets any dealt more than DEALT_KEEP_DAYS ago. Returns the same
// library when nothing changes, so a re-render doesn't trigger a sync.
export function recordDealt(library: Library, ids: readonly string[], day: string): Library {
  const fresh = ids.filter((id) => library.dealt[id] !== day);
  if (fresh.length === 0) return library;
  const dealt = pruneDealt({ ...library.dealt, ...Object.fromEntries(fresh.map((id) => [id, day])) }, day);
  return { ...library, dealt };
}

function pruneDealt(dealt: Record<string, string>, today: string): Record<string, string> {
  const oldest = new Date(Date.parse(`${today}T00:00:00Z`) - DEALT_KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(dealt).filter(([, day]) => day >= oldest));
}

export function isShelved(library: Library, shelf: Shelf, id: string): boolean {
  return id in library[shelf];
}

export function toggleShelf(library: Library, shelf: Shelf, item: FeedItem, now: Date): Library {
  const { [item.id]: existing, ...rest } = library[shelf];
  const { [item.id]: _, ...stillRemoved } = library.removed[shelf];
  const at = now.toISOString();
  return {
    ...library,
    [shelf]: existing ? rest : { ...library[shelf], [item.id]: { item, at } },
    removed: { ...library.removed, [shelf]: existing ? { ...stillRemoved, [item.id]: at } : stillRemoved },
  };
}

// Per post and shelf, the latest change wins: a save or a removal, whichever device made it last.
// On a tie the save wins, so merging never loses a post by accident.
export function mergeLibraries(a: Library, b: Library): Library {
  const merged = emptyLibrary();
  // The later day wins: it is the one that decides when a post may be dealt again.
  for (const side of [a, b]) {
    for (const [id, day] of Object.entries(side.dealt)) {
      const seen = merged.dealt[id];
      if (seen === undefined || seen < day) merged.dealt[id] = day;
    }
  }
  for (const shelf of SHELVES) {
    const ids = new Set([a, b].flatMap((side) => [...Object.keys(side[shelf]), ...Object.keys(side.removed[shelf])]));
    for (const id of ids) {
      const saves = [a[shelf][id], b[shelf][id]].filter((saved) => saved !== undefined);
      const save = saves.sort((x, y) => y.at.localeCompare(x.at))[0];
      const removedAt = [a.removed[shelf][id], b.removed[shelf][id]].filter((at) => at !== undefined).sort().at(-1);
      if (save && (!removedAt || save.at >= removedAt)) merged[shelf][id] = save;
      else if (removedAt) merged.removed[shelf][id] = removedAt;
    }
  }
  return merged;
}

export function sameLibrary(a: Library, b: Library): boolean {
  return sameKeys(a.dealt, b.dealt, (x, y) => x === y) && SHELVES.every(
    (shelf) =>
      sameKeys(a[shelf], b[shelf], (x, y) => x.at === y.at) && sameKeys(a.removed[shelf], b.removed[shelf], (x, y) => x === y),
  );
}

function sameKeys<T>(a: Record<string, T>, b: Record<string, T>, same: (x: T, y: T) => boolean): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && same(a[key]!, b[key]!));
}

// Newest save first. A post still in the feed shows its fresh copy; one that aged out shows the snapshot.
export function shelfItems(library: Library, shelf: Shelf, current: ReadonlyMap<string, FeedItem>): FeedItem[] {
  return Object.values(library[shelf])
    .sort((a, b) => b.at.localeCompare(a.at))
    .map(({ item }) => current.get(item.id) ?? item);
}

export function parseLibrary(raw: unknown): Library {
  const library = emptyLibrary();
  if (!isRecord(raw)) return library;
  if (isRecord(raw.dealt)) {
    for (const [id, day] of Object.entries(raw.dealt)) if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) library.dealt[id] = day;
  }
  for (const shelf of SHELVES) {
    const entries = raw[shelf];
    if (!isRecord(entries)) continue;
    for (const [id, saved] of Object.entries(entries)) {
      if (isRecord(saved) && typeof saved.at === "string" && isFeedItem(saved.item) && saved.item.id === id) {
        library[shelf][id] = { item: saved.item, at: saved.at };
      }
    }
    const removed = isRecord(raw.removed) ? raw.removed[shelf] : undefined;
    if (!isRecord(removed)) continue;
    for (const [id, at] of Object.entries(removed)) {
      if (typeof at === "string" && !(id in library[shelf])) library.removed[shelf][id] = at;
    }
  }
  return library;
}

function isFeedItem(value: unknown): value is FeedItem {
  return (
    isRecord(value) &&
    ["id", "title", "url", "publishedAt", "author"].every((key) => typeof value[key] === "string") &&
    SOURCE_KINDS.includes(value.kind as FeedItem["kind"]) &&
    Array.isArray(value.tags)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
