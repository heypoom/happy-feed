import { SOURCE_KINDS, type FeedItem } from "./types";

export type Shelf = "favourites" | "archive";
export const SHELVES: readonly Shelf[] = ["favourites", "archive"];

export type Saved = { item: FeedItem; at: string };
// `removed` remembers when a post left a shelf, so a removal on one device wins over an older save
// on another when two libraries merge. Without it, a merge could only ever add.
export type Library = Record<Shelf, Record<string, Saved>> & { removed: Record<Shelf, Record<string, string>> };

export const emptyLibrary = (): Library => ({ favourites: {}, archive: {}, removed: { favourites: {}, archive: {} } });

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
  return SHELVES.every(
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
