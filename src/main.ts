import { EXCLUDE_IDS, EXCLUDE_PRESETS, isExcluded, type ExcludeId } from "./shared/excludes";
import { assignHues, hueOf, type Hue } from "./shared/hues";
import {
  emptyLibrary,
  isShelved,
  levelOf,
  mergeLibraries,
  parseLibrary,
  recordDealt,
  sameLibrary,
  setLevel,
  shelfItems,
  SHELVES,
  toggleShelf,
  tunedPeople,
  type Library,
  type Shelf,
} from "./shared/library";
import { dayKey, dealHand, dealStack, isFresh, orderFeed } from "./shared/order";
import { blueskyApiUrl, fromBluesky, fromMastodon, mastodonApiUrl, type PostView } from "./shared/post-view";
import { normalizePassphrase, SYNC_PATH, syncKey } from "./shared/sync";
import { LEVELS, thinLess, WEIGHT, type Level } from "./shared/tuning";
import { FORMAT_OF, type Chunk, type FeedItem, type Format, type Manifest, type SourceKind } from "./shared/types";
import { fromWire, type WireItem } from "./shared/wire";

type View = "feed" | Shelf;
// New is this week, newest first, with today's hand of older posts woven in. Anytime is today's stack
// from every year; `stack` counts the stacks dealt so far today.
type Mode = "new" | "anytime";
type Filters = { view: View; mode: Mode; stack: number; show: Format | ""; tags: Set<string>; people: Set<string> };
type ChipGroup = "tags" | "people";
type Row =
  | { type: "card"; item: FeedItem }
  | { type: "caught-up"; hand: number }
  | { type: "stack-end"; stack: number; count: number; more: boolean }
  // Anytime without a deck to deal from waits here for the archive.
  | { type: "dealing" };
// How a dealt card shows its date: hand cards say "From Mar 2021", stack cards just "Mar 2021".
type DealtAs = "hand" | "stack";
type SyncSetup = { passphrase: string; key: string };
type SyncStatus = "synced" | "syncing" | "offline";

const PAGE_SIZE = 20;
const FORMATS: Record<Format, { label: string; icon: string }> = {
  watch: { label: "Watch", icon: "i-play" },
  read: { label: "Read", icon: "i-book" },
  post: { label: "Posts", icon: "i-chat" },
};
const FORMAT_NAMES = Object.keys(FORMATS) as Format[];

const root = document.documentElement;
const list = document.querySelector<HTMLElement>(".list")!;
const sentinel = document.querySelector<HTMLElement>(".sentinel")!;
const controls = document.querySelector<HTMLElement>(".controls")!;
const tabs = controls.querySelector<HTMLElement>(".tabs")!;
const sheetTabs = controls.querySelector<HTMLElement>(".sheet-tabs")!;
const filtersButton = controls.querySelector<HTMLButtonElement>(".filters-button")!;
const activeStrip = controls.querySelector<HTMLElement>(".active-strip")!;
const sheet = controls.querySelector<HTMLDialogElement>(".filter-sheet")!;
const sheetClear = sheet.querySelector<HTMLButtonElement>(".sheet-clear")!;
const sheetDone = sheet.querySelector<HTMLButtonElement>(".sheet-done")!;
// Below the rail breakpoint the filters live in a bottom sheet; at and above it they are the rail.
const masthead = document.querySelector<HTMLElement>(".masthead")!;
const railLayout = matchMedia("(min-width: 1024px)");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const chips = controls.querySelector<HTMLElement>(".chips")!;
const people = controls.querySelector<HTMLElement>(".people")!;
const peopleCount = controls.querySelector<HTMLElement>(".people-head .count")!;
const peopleFind = controls.querySelector<HTMLInputElement>(".people-find")!;
const peopleNone = controls.querySelector<HTMLElement>(".people-none")!;
// Sources repeat the Watch/Read/Posts tabs, so they stay folded unless opened or already filtering.
const toggle = document.querySelector<HTMLButtonElement>(".theme-toggle")!;
const viewer = document.querySelector<HTMLDialogElement>(".viewer")!;
const NETWORK: Partial<Record<SourceKind, { name: string; load: (item: FeedItem) => Promise<PostView> }>> = {
  bluesky: { name: "Bluesky", load: (item) => loadPost(blueskyApiUrl(item.id), fromBluesky) },
  mastodon: { name: "Mastodon", load: (item) => loadPost(mastodonApiUrl(item.url), fromMastodon) },
};
const shelfLinks = [...document.querySelectorAll<HTMLButtonElement>(".shelf-link")];
const modes = document.querySelector<HTMLElement>(".modes")!;
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>(".mode")];
const redeal = document.querySelector<HTMLButtonElement>(".redeal")!;
const redealLabel = redeal.querySelector<HTMLElement>(".label")!;
const SHELF_COPY: Record<Shelf, { title: string; empty: string }> = {
  favourites: { title: "Favourites", empty: "Tap the heart on anything you love and it will wait for you here." },
  archive: { title: "Archive", empty: "Mark posts as read or watched and they rest here, out of your feed." },
};
const DONE_LABEL: Record<Format, string> = { watch: "watched", read: "read", post: "read" };
const LEVEL_COPY: Record<Level, { label: string; icon: string; note: string }> = {
  more: { label: "More", icon: "i-up", note: "Dealt more often into your daily hand and your Anytime stacks." },
  normal: { label: "Normal", icon: "i-level", note: "Every new post, and an even turn with everyone else in Anytime." },
  less: { label: "Less", icon: "i-down", note: "One post a day in New, and dealt from the archive only now and then." },
  pause: { label: "Pause", icon: "i-pause", note: "Out of New and Anytime until you resume. Favourites and Archive keep their posts." },
};
const personSheet = document.querySelector<HTMLDialogElement>(".person-sheet")!;
// The tune button that opened the person sheet, and its card, so focus and the desktop popover can
// find it again after the card re-renders.
let personOpener: { el: HTMLElement; id: string } | undefined;
const systemDark = matchMedia("(prefers-color-scheme: dark)");

// The manifest and the posts of every chunk loaded so far.
let feed: Omit<Manifest, "chunks"> & { items: FeedItem[] };
// Today's deck: what the hand and the stacks deal from, kept apart from the archive's posts.
let deck: { day: string; items: FeedItem[] } | undefined;
// The year chunks behind the recent one, newest first. New loads the next as its list runs out; a
// filter, or dealing without a deck, loads them all. A chunk that failed is done too: only its own
// posts are left out.
let archive: { chunk: Chunk; load: "pending" | "loading" | "done" }[] = [];
let hues = new Map<string, Hue>();
let hidden = loadHidden();
let library = loadLibrary();
// Guests keep their lists on this device only. With a passphrase, every change is sent at once and
// the device pulls whenever it comes back into view, and every minute while it stays in view.
let syncSetup = loadSyncSetup();
let syncStatus: SyncStatus = "syncing";
let syncInFlight = false;
let syncAgain = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
const SYNC_EVERY_MS = 60_000;
const syncSheet = document.querySelector<HTMLDialogElement>(".sync-sheet")!;
const pull = document.querySelector<HTMLElement>(".pull")!;
const pullLabel = pull.querySelector<HTMLElement>(".pull-label")!;
const pullStatus = document.querySelector<HTMLElement>(".pull-status")!;
const PULL_TRIGGER = 72;
const PULL_MAX = 120;
let rows: Row[] = [];
let rendered = 0;
let dealtAs = new Map<string, DealtAs>();
// Calmer titles and frames for older dealt videos, fetched from the Worker as their cards show
// (builds only brand the last 60 days). `null` marks a video with nothing better, or a failed lookup.
type Branding = { title?: string; thumbnail?: string };
const brandings = new Map<string, Branding | null>();
const BUILD_BRANDS_MS = 60 * 86_400_000;
// Bumped when a pull replaces the feed, so a chunk still loading for the old one is dropped.
let feedVersion = 0;

const observer = new IntersectionObserver(
  ([entry]) => {
    if (!entry?.isIntersecting) return;
    if (rendered < rows.length) {
      appendPage();
      watchSentinel();
      return;
    }
    const filters = readFilters();
    if (filters.view === "feed" && filters.mode === "new") void loadArchive("next");
  },
  { rootMargin: "800px 0px" },
);

// Re-observing forces a fresh callback, so a tall screen keeps filling until the sentinel leaves view.
function watchSentinel(): void {
  observer.unobserve(sentinel);
  observer.observe(sentinel);
}

const cheer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("cheer");
      cheer.unobserve(entry.target);
    }
  },
  { threshold: 0.6 },
);

syncTheme();
systemDark.addEventListener("change", syncTheme);
toggle.addEventListener("click", () => {
  const next = root.dataset.resolved === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {}
  syncTheme();
});

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    const filters = readFilters();
    writeFilters({ ...filters, view: "feed", mode: button.dataset.mode as Mode });
  });
}
// A mouse can't pull, so in Anytime this deals the next stack as a pull does. It is only an icon; what
// happened shows beside it for a moment, then goes.
let redealNote: ReturnType<typeof setTimeout> | undefined;
redeal.addEventListener("click", async () => {
  if (redeal.classList.contains("busy") || !feed) return;
  clearTimeout(redealNote);
  redeal.classList.remove("noted");
  redeal.classList.add("busy");
  const message = await pullRefresh();
  redeal.classList.remove("busy");
  redealLabel.textContent = message;
  pullStatus.textContent = message;
  redeal.classList.add("noted");
  redealNote = setTimeout(() => redeal.classList.remove("noted"), 1600);
});
renderModes(readFilters());
requestAnimationFrame(() => requestAnimationFrame(() => modes.classList.add("ready")));

for (const link of shelfLinks) {
  link.addEventListener("click", () => {
    const shelf = link.dataset.shelf as Shelf;
    const filters = readFilters();
    writeFilters({ ...filters, view: filters.view === shelf ? "feed" : shelf });
  });
}

// Esc and a tap on the backdrop close the viewer through history, so Back never needs an extra press.
viewer.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeViewer();
});
// Pointer events rather than click: some browsers (notably Safari on iOS) do not reliably synthesize a
// click on a dialog's backdrop. A press must start and end on the backdrop, so a drag out of the sheet
// does not close it.
let pressOnBackdrop = false;
// Set when the viewer closes itself and steps history back, so that step does not re-render the feed.
let skipNextPop = false;
viewer.addEventListener("pointerdown", (event) => {
  pressOnBackdrop = event.target === viewer;
});
viewer.addEventListener("pointerup", (event) => {
  if (pressOnBackdrop && event.target === viewer) closeViewer();
  pressOnBackdrop = false;
});
window.addEventListener("keydown", (event: KeyboardEvent) => {
  // With the sheet open, Esc belongs to the sheet (it closes it) rather than clearing filters.
  if (event.key !== "Escape" || viewer.open || sheet.open || syncSheet.open || personSheet.open || !feed) return;
  const filters = readFilters();
  if (activeFilterCount(filters) > 0) clearFilters(filters);
});

peopleFind.addEventListener("input", applyPeopleFind);
peopleFind.addEventListener("keydown", (event) => {
  // Esc in the box clears the search first; a second Esc falls through to clearing filters.
  if (event.key === "Escape" && peopleFind.value) {
    event.stopPropagation();
    event.preventDefault();
    peopleFind.value = "";
    applyPeopleFind();
  }
  if (event.key === "Enter" && peopleFind.value.trim()) {
    people.querySelector<HTMLButtonElement>('.chip:not([hidden]):not([aria-pressed="true"])')?.click();
  }
});

filtersButton.addEventListener("click", openSheet);
sheet.querySelector(".sheet-close")!.addEventListener("click", () => sheet.close());
sheetDone.addEventListener("click", () => sheet.close());
sheetClear.addEventListener("click", () => clearFilters(readFilters()));
sheet.addEventListener("close", () => {
  filtersButton.setAttribute("aria-expanded", "false");
  // A tap does not always focus the button on iOS, so focus could otherwise be left inside the closed sheet.
  if (sheet.contains(document.activeElement)) filtersButton.focus({ preventScroll: true });
  peopleFind.value = "";
  applyPeopleFind();
});
// Same press-starts-and-ends-on-the-backdrop rule as the viewer.
let sheetPressOnBackdrop = false;
sheet.addEventListener("pointerdown", (event) => {
  sheetPressOnBackdrop = event.target === sheet;
});
sheet.addEventListener("pointerup", (event) => {
  if (sheetPressOnBackdrop && event.target === sheet) sheet.close();
  sheetPressOnBackdrop = false;
});
dragToClose(sheet.querySelector<HTMLElement>(".sheet-head")!);
syncSheet.querySelector("form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  void startSyncing(syncSheet.querySelector<HTMLInputElement>(".sync-words")!.value);
});
syncSheet.querySelector(".sync-stop")!.addEventListener("click", stopSyncing);
syncSheet.querySelector(".sync-close")!.addEventListener("click", () => syncSheet.close());
syncSheet.addEventListener("click", (event) => {
  if (event.target === syncSheet) syncSheet.close();
});
personSheet.addEventListener("click", (event) => {
  if (event.target === personSheet) personSheet.close();
});
personSheet.addEventListener("close", () => {
  liveOpener()?.focus({ preventScroll: true });
  personOpener = undefined;
});
addEventListener("resize", () => personSheet.open && placePersonSheet());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void syncNow();
});
setInterval(() => {
  if (document.visibilityState === "visible") void syncNow();
}, SYNC_EVERY_MS);
void syncNow();
railLayout.addEventListener("change", () => {
  if (railLayout.matches && sheet.open) sheet.close();
  controls.classList.remove("tucked");
});
tuckOnScroll();
pullToRefresh();

void start();

function syncTheme(): void {
  const resolved = root.dataset.theme ?? (systemDark.matches ? "dark" : "light");
  root.dataset.resolved = resolved;
  toggle.setAttribute("aria-label", resolved === "dark" ? "Switch to light mode" : "Switch to dark mode");
  const ground = resolved === "dark" ? "#14122a" : "#f6f4fd";
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = ground;
}

// The manifest names the chunks, recent first, and today's deck. A plain feed URL paints from the
// recent chunk and the deck. A link with a tag or person filter waits for every chunk, since
// its counts and people need every post.
async function start(): Promise<void> {
  try {
    const manifest = await getJson<Manifest>("feed/manifest.json", { cache: "no-cache" });
    await loadFeed(manifest, () => narrowing(readFilters()) > 0);
  } catch {
    list.replaceChildren(
      moment({
        mood: "sleepy",
        title: "The feed is napping",
        body: "It couldn't load just now. A fine moment to look up from the screen.",
        action: ["Try again", () => location.reload()],
      }),
    );
    return;
  }
  window.addEventListener("popstate", () => {
    if (skipNextPop) skipNextPop = false;
    else if (viewer.open) viewer.close();
    else morph(render);
  });
  render();
  observer.observe(sentinel);
}

// Replaces the feed with a manifest's recent chunk, its deck for today, and the year chunks `load`
// picks. A missing deck deals from the archive instead, and a failed year chunk leaves its posts out.
async function loadFeed(manifest: Manifest, load: (chunk: Chunk) => boolean): Promise<void> {
  const { chunks, ...rest } = manifest;
  const [recent, ...older] = chunks;
  const day = dayKey(new Date());
  const deckPath = manifest.decks?.[day];
  const years = older.filter(load);
  const [first, dealt, loaded] = await Promise.all([
    recent ? loadPosts(recent.path) : [],
    deckPath ? loadPosts(deckPath).catch(() => undefined) : undefined,
    Promise.allSettled(years.map((chunk) => loadPosts(chunk.path))),
  ]);
  feedVersion++;
  feed = { ...rest, items: [...first, ...loaded.flatMap((result) => (result.status === "fulfilled" ? result.value : []))] };
  deck = dealt && { day, items: dealt };
  archive = older.map((chunk) => ({ chunk, load: years.includes(chunk) ? "done" : "pending" }));
  hues = assignHues(feed.tags);
}

// "next" loads the newest year chunk still pending, one at a time; "all" loads every pending one.
async function loadArchive(which: "next" | "all"): Promise<void> {
  if (which === "next" && archive.some((entry) => entry.load === "loading")) return;
  const pending = archive.filter((entry) => entry.load === "pending");
  const batch = which === "next" ? pending.slice(0, 1) : pending;
  if (batch.length === 0) return;
  for (const entry of batch) entry.load = "loading";
  const version = feedVersion;
  const loaded = await Promise.allSettled(batch.map((entry) => loadPosts(entry.chunk.path)));
  if (version !== feedVersion) return;
  for (const entry of batch) entry.load = "done";
  addArchive(loaded.flatMap((result) => (result.status === "fulfilled" ? result.value : [])));
}

const archiveLoaded = () => archive.every((entry) => entry.load === "done");

// Tag and person filters count and list across every chunk, and dealing without today's deck
// needs the whole archive.
const needsArchive = (filters: Filters) => narrowing(filters) > 0 || (filters.view === "feed" && !todaysDeck());

const todaysDeck = () => (deck?.day === dayKey(new Date()) ? deck.items : undefined);

// Fetches the manifest again and, when the feed was republished or a new day has a deck, the recent
// chunk, the deck and the year chunks already loaded. Chunks are named by content, so unchanged
// years come from the cache.
async function reloadFeed(): Promise<boolean> {
  const manifest = await getJson<Manifest>("feed/manifest.json", { cache: "no-cache" });
  const newDeck = manifest.decks?.[dayKey(new Date())] !== undefined && !todaysDeck();
  if (manifest.generatedAt === feed.generatedAt && !newDeck) return false;
  const loaded = new Set(archive.filter((entry) => entry.load === "done").map((entry) => entry.chunk.label));
  await loadFeed(manifest, (chunk) => loaded.has(chunk.label));
  return true;
}

// Every pull checks for a newer feed. In Anytime it also deals the next stack, as "Keep digging" does:
// it lands in the URL, so Back returns to the stack before.
async function pullRefresh(): Promise<string> {
  const before = new Set(feed.items.map((item) => item.id));
  let added = 0;
  try {
    if (await reloadFeed()) added = feed.items.filter((item) => !before.has(item.id)).length;
  } catch {
    return "Couldn't check just now";
  }
  const filters = readFilters();
  if (filters.view === "feed" && filters.mode === "anytime") {
    const end = rowsFor(filters, viewItems(filters)).find((row) => row.type === "stack-end");
    if (end?.type === "stack-end" && end.more) {
      writeFilters({ ...filters, stack: filters.stack + 1 });
      return `Stack ${filters.stack + 1}`;
    }
    morph(render);
    return "That's every stack for today";
  }
  if (added > 0 || before.size !== feed.items.length) morph(render);
  return added > 0 ? `${added} new post${added === 1 ? "" : "s"}` : "Up to date";
}

const PULL_COPY: Record<Mode, { pull: string; release: string; busy: string }> = {
  new: { pull: "Pull to check for new posts", release: "Let go to check", busy: "Checking…" },
  anytime: { pull: "Pull for another stack", release: "Let go to deal", busy: "Dealing…" },
};

// Touch only, from the very top of the page. The browser's own pull-to-reload is switched off in CSS,
// since a reload deals the same cards and this can do more.
function pullToRefresh(): void {
  let startY: number | undefined;
  let distance = 0;
  let busy = false;
  const set = (px: number) => {
    root.style.setProperty("--pull", `${px}px`);
    root.style.setProperty("--progress", String(Math.min(1, px / PULL_TRIGGER)));
    if (px > 0) root.classList.add("pulling");
    else if (!root.classList.contains("pull-settling")) root.classList.remove("pulling");
  };
  // Once the page has slid back, drop the transforms.
  addEventListener("transitionend", (event) => {
    if (event.target === pull && root.style.getPropertyValue("--pull") === "0px") root.classList.remove("pulling", "pull-settling");
  });
  const copy = () => {
    const filters = readFilters();
    return PULL_COPY[filters.view === "feed" ? filters.mode : "new"];
  };
  addEventListener(
    "touchstart",
    (event: TouchEvent) => {
      if (busy || !feed || scrollY > 0 || event.touches.length !== 1 || document.querySelector("dialog[open]")) return;
      startY = event.touches[0]!.clientY;
      distance = 0;
      root.classList.remove("pull-settling");
    },
    { passive: true },
  );
  addEventListener(
    "touchmove",
    (event: TouchEvent) => {
      if (startY === undefined) return;
      const dy = event.touches[0]!.clientY - startY;
      distance = dy > 0 && scrollY <= 0 ? Math.min(PULL_MAX, dy * 0.5) : 0;
      set(distance);
      pullLabel.textContent = distance >= PULL_TRIGGER ? copy().release : copy().pull;
    },
    { passive: true },
  );
  const end = async () => {
    if (startY === undefined) return;
    startY = undefined;
    root.classList.add("pull-settling");
    if (distance < PULL_TRIGGER) return set(0);
    busy = true;
    set(PULL_TRIGGER);
    pull.classList.add("busy");
    pullLabel.textContent = copy().busy;
    const message = await pullRefresh();
    pull.classList.remove("busy");
    pullLabel.textContent = message;
    pullStatus.textContent = message;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    set(0);
    busy = false;
  };
  addEventListener("touchend", () => void end());
  addEventListener("touchcancel", () => void end());
}

// Every published post enters the client here, so the rest of it sees whole FeedItems.
async function loadPosts(path: string): Promise<FeedItem[]> {
  return (await getJson<WireItem[]>(path)).map(fromWire);
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`, init);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

// Year chunks join a feed already on screen. Cards the reader can see stay put when the new list
// starts with them, or when the reader has scrolled past the first screen; the rest of the list
// follows them. Otherwise the list renders afresh.
function addArchive(items: FeedItem[]): void {
  feed.items = feed.items.concat(items);
  const filters = readFilters();
  const chipMatches = viewItems(filters);
  const next = rowsFor(filters, chipMatches);
  const shown = shownRowIds();
  const samePrefix = shown.every((id, i) => next[i] && rowId(next[i]) === id);
  if (shown.length === 0 || (!samePrefix && scrollY < innerHeight)) return morph(render);

  renderControls(filters, chipMatches);
  const onScreen = new Set(shown);
  rows = [...rows.filter((row) => onScreen.has(rowId(row))), ...next.filter((row) => !onScreen.has(rowId(row)))];
  rendered = shown.length;
  if (rendered >= rows.length) appendPage();
  // The list may still end on screen, so New asks for the next chunk.
  watchSentinel();
}

function rowId(row: Row): string {
  return row.type === "card" ? row.item.id : row.type;
}

function shownRowIds(): string[] {
  return [...list.children].flatMap((el) => (el instanceof HTMLElement && (el.dataset.id || el.dataset.row) ? [el.dataset.id || el.dataset.row!] : []));
}

function loadHidden(): Set<ExcludeId> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem("hide") ?? "[]");
    return new Set(EXCLUDE_IDS.filter((id) => Array.isArray(saved) && saved.includes(id)));
  } catch {
    return new Set();
  }
}

function toggleHidden(id: ExcludeId): void {
  if (hidden.has(id)) hidden.delete(id);
  else hidden.add(id);
  try {
    localStorage.setItem("hide", JSON.stringify([...hidden]));
  } catch {}
  morph(render);
}

function loadLibrary(): Library {
  try {
    return parseLibrary(JSON.parse(localStorage.getItem("library:v1") ?? "null"));
  } catch {
    return emptyLibrary();
  }
}

function saveLibrary(next: Library): void {
  storeLibrary(next);
  if (!syncSetup) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void syncNow(), 400);
}

function storeLibrary(next: Library): void {
  library = next;
  try {
    localStorage.setItem("library:v1", JSON.stringify(next));
  } catch {}
  renderShelfLinks(readFilters().view);
}

function loadSyncSetup(): SyncSetup | undefined {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem("sync") ?? "null");
    if (raw && typeof raw === "object" && "passphrase" in raw && "key" in raw && typeof raw.passphrase === "string" && typeof raw.key === "string") {
      return { passphrase: raw.passphrase, key: raw.key };
    }
  } catch {}
  return undefined;
}

// One request sends this device's library and brings back everyone's merged. Changes made while it
// was in flight merge on top, and a change that arrives meanwhile sends again once it lands.
async function syncNow(): Promise<void> {
  const setup = syncSetup;
  if (!setup) return;
  if (syncInFlight) {
    syncAgain = true;
    return;
  }
  syncInFlight = true;
  setSyncStatus("syncing");
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${SYNC_PATH}${setup.key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(library),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const remote = parseLibrary(await response.json());
    if (syncSetup?.key !== setup.key) return;
    const merged = mergeLibraries(library, remote);
    if (!sameLibrary(merged, library)) libraryArrived(merged);
    setSyncStatus("synced");
  } catch {
    if (syncSetup?.key === setup.key) setSyncStatus("offline");
  } finally {
    syncInFlight = false;
    if (syncAgain) {
      syncAgain = false;
      void syncNow();
    }
  }
}

// Another device changed the lists. A shelf re-renders; the feed keeps its place and only updates
// the cards on screen, so a pull never yanks the scroll. Posts archived elsewhere fold away.
function libraryArrived(next: Library): void {
  storeLibrary(next);
  if (!feed) return;
  const view = readFilters().view;
  if (view !== "feed" || viewer.open) {
    if (view !== "feed") morph(render);
    else refreshControls();
    return;
  }
  settleCards();
}

// The library changed under the feed (here or on another device). The feed keeps its place: cards on
// screen that no longer belong fold away, the rest re-render, and the cards still to come drop out.
function settleCards(): void {
  const filters = readFilters();
  const stays = stillShown(filters);
  const byId = new Map(loadedItems().map((item) => [item.id, item]));
  for (const card of list.querySelectorAll<HTMLElement>(".card[data-id]")) {
    const item = byId.get(card.dataset.id!);
    if (!item) continue;
    if (!stays(item)) collapseOut(card);
    else card.replaceWith(renderCard(item));
  }
  rows = [...rows.slice(0, rendered), ...rows.slice(rendered).filter((row) => row.type !== "card" || stays(row.item))];
  refreshControls();
}

// A card stays when the feed would still show it. Cards already dealt today stay dealt, so a person
// seen less keeps the cards their turn gave them; only a pause takes those away.
function stillShown(filters: Filters): (item: FeedItem) => boolean {
  const thinned = filters.mode === "new" ? new Set(viewItems(filters).map((item) => item.id)) : undefined;
  return (item) => inFeed(item, filters) && (!thinned || dealtAs.has(item.id) || thinned.has(item.id));
}

async function startSyncing(words: string): Promise<void> {
  const passphrase = normalizePassphrase(words);
  if (passphrase.length < 8) return;
  syncSetup = { passphrase, key: await syncKey(passphrase) };
  try {
    localStorage.setItem("sync", JSON.stringify(syncSetup));
  } catch {}
  renderSyncSheet();
  await syncNow();
  if (syncStatus === "synced") syncSheet.close();
}

// This device keeps a copy of what it has, as a guest again; nothing is deleted anywhere.
function stopSyncing(): void {
  syncSetup = undefined;
  clearTimeout(pushTimer);
  try {
    localStorage.removeItem("sync");
  } catch {}
  syncSheet.close();
  renderSyncLines();
}

function setSyncStatus(status: SyncStatus): void {
  syncStatus = status;
  renderSyncLines();
  if (syncSheet.open) renderSyncSheet();
}

const SYNC_COPY: Record<SyncStatus | "guest", string> = {
  guest: "On this device only.",
  syncing: "Syncing with your other devices…",
  synced: "Synced across your devices.",
  offline: "Couldn't sync just now. It will try again.",
};

function syncLine(): HTMLElement {
  const line = h("p", { className: "sync-line" }, []);
  fillSyncLine(line);
  return line;
}

function fillSyncLine(line: HTMLElement): void {
  const state = syncSetup ? syncStatus : "guest";
  line.dataset.state = state;
  const button = h("button", { type: "button", className: "sync-open", ariaHasPopup: "dialog" }, [syncSetup ? "Sync settings" : "Sync devices"]);
  button.addEventListener("click", openSyncSheet);
  line.replaceChildren(icon("i-cloud"), h("span", {}, [SYNC_COPY[state]]), button);
}

function renderSyncLines(): void {
  for (const line of list.querySelectorAll<HTMLElement>(".sync-line")) fillSyncLine(line);
}

function openSyncSheet(): void {
  renderSyncSheet();
  syncSheet.showModal();
  if (!syncSetup) syncSheet.querySelector<HTMLInputElement>(".sync-words")!.focus();
}

function renderSyncSheet(): void {
  const input = syncSheet.querySelector<HTMLInputElement>(".sync-words")!;
  const on = Boolean(syncSetup);
  syncSheet.dataset.state = on ? syncStatus : "guest";
  syncSheet.querySelector<HTMLElement>(".sync-guest")!.hidden = on;
  syncSheet.querySelector<HTMLElement>(".sync-on")!.hidden = !on;
  syncSheet.querySelector<HTMLElement>(".sync-status")!.textContent = on ? SYNC_COPY[syncStatus] : "";
  syncSheet.querySelector<HTMLElement>(".sync-current")!.textContent = syncSetup?.passphrase ?? "";
  if (on) input.value = "";
}

function hueFor(item: FeedItem): Hue {
  const tag = item.tags[0];
  return (tag && hues.get(tag)) || hueOf(item.author);
}

function readFilters(): Filters {
  const params = new URLSearchParams(location.search);
  const set = (key: string) => new Set((params.get(key) ?? "").split(",").filter(Boolean));
  const show = params.get("show");
  const view = params.get("view");
  const mode: Mode = params.get("feed") === "anytime" ? "anytime" : "new";
  const stack = Math.floor(Number(params.get("stack")));
  return {
    view: SHELVES.includes(view as Shelf) ? (view as Shelf) : "feed",
    mode,
    stack: mode === "anytime" && stack > 1 ? stack : 1,
    show: show && show in FORMATS ? (show as Format) : "", tags: set("tags"), people: set("people") };
}

// A stack number belongs to one feed and one set of filters, so changing either starts again at stack 1.
function writeFilters(next: Filters): void {
  const current = readFilters();
  const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((value) => b.has(value));
  const same =
    current.view === next.view &&
    current.mode === next.mode &&
    current.show === next.show &&
    (["tags", "people"] as const).every((key) => sameSet(current[key], next[key]));
  const filters = same ? next : { ...next, stack: 1 };
  const params = new URLSearchParams();
  if (filters.view !== "feed") params.set("view", filters.view);
  if (filters.mode === "anytime") params.set("feed", "anytime");
  if (filters.mode === "anytime" && filters.stack > 1) params.set("stack", String(filters.stack));
  if (filters.show) params.set("show", filters.show);
  if (filters.tags.size > 0) params.set("tags", [...filters.tags].join(","));
  if (filters.people.size > 0) params.set("people", [...filters.people].join(","));
  const query = params.toString().replaceAll("%2C", ",");
  history.pushState(null, "", query ? `?${query}` : location.pathname);
  morph(() => {
    render();
    scrollTo({ top: 0 });
  });
}

// 25698 reads as "26k" and 2512 as "2.5k", so the format tabs stay narrow; the full count is in the title.
const compactFormat = new Intl.NumberFormat("en", { notation: "compact", maximumSignificantDigits: 2 });
function compactCount(n: number): string {
  return n < 1000 ? String(n) : compactFormat.format(n).toLowerCase();
}

function activeFilterCount(filters: Filters): number {
  return narrowing(filters) + (filters.show ? 1 : 0);
}

// Tag and person filters; the format tab is not one of them.
function narrowing(filters: Filters): number {
  return filters.tags.size + filters.people.size;
}

// Clears what narrows the list; the current list (feed, favourites, archive) and No AI stay as they are.
function clearFilters(filters: Filters): void {
  writeFilters({ view: filters.view, mode: filters.mode, stack: 1, show: "", tags: new Set(), people: new Set() });
}

function matchesChips(item: FeedItem, filters: Filters): boolean {
  const tagOk = filters.tags.size === 0 || item.tags.some((tag) => filters.tags.has(tag));
  const personOk = filters.people.size === 0 || filters.people.has(item.author);
  return tagOk && personOk;
}

const matchesShow = (item: FeedItem, filters: Filters) => !filters.show || FORMAT_OF[item.kind] === filters.show;

// The feed leaves out posts marked read or watched, posts about a topic No AI hides, and people on
// pause. A person asked for by name shows in full, whatever their level.
const inFeed = (item: FeedItem, filters: Filters) =>
  !isShelved(library, "archive", item.id) && !isExcluded(item, hidden) && !(levelOf(library, item.author) === "pause" && !filters.people.has(item.author));

// Whether the feed shows a post under these filters, whether it came from the archive or the deck.
const inView = (item: FeedItem, filters: Filters) => inFeed(item, filters) && matchesChips(item, filters) && matchesShow(item, filters);

// New shows one post a day from someone seen less, unless they were asked for by name.
const seenLess = (filters: Filters) => (author: string) => levelOf(library, author) === "less" && !filters.people.has(author);

// How likely a person is to be dealt today. Asked for by name, everyone weighs the same.
const weightFor = (filters: Filters) => (author: string) => (filters.people.has(author) ? 1 : WEIGHT[levelOf(library, author)]);

// A change to what the page shows morphs rather than flashing. Cards and controls on screen in both
// states glide to their new places, cards that leave fade, new ones fade in, and the rest cross-fades.
// Only what is on screen takes part: a card arriving from far down the list would fly across it.
// Nothing is named while a sheet or the viewer is open, since the morph draws above them.
let morphs = 0;
function morph(update: () => void): void {
  if (!document.startViewTransition || document.hidden || list.childElementCount === 0) return update();
  const run = ++morphs;
  const named = new Set<HTMLElement>();
  const nameOnScreen = () => {
    if (document.querySelector("dialog:modal")) return;
    const desktop = matchMedia("(min-width: 1024px)").matches;
    const seen = new Set<string>();
    const name = (el: HTMLElement, key: string, kind: string) => {
      seen.add(key);
      el.style.setProperty("view-transition-name", `m${hashKey(key)}`);
      el.style.setProperty("view-transition-class", kind);
      named.add(el);
    };
    // A card may run past the bottom of the screen, but not under the phone's sticky bar, which the
    // morph would draw over.
    const top = desktop ? 0 : Math.max(0, controls.getBoundingClientRect().bottom);
    for (const card of list.querySelectorAll<HTMLElement>(":scope > .card[data-id]")) {
      const r = card.getBoundingClientRect();
      if (r.top >= top && r.top < innerHeight && !seen.has(`card:${card.dataset.id}`)) name(card, `card:${card.dataset.id}`, "card");
    }
    // Controls sit whole inside what shows them: the screen, the desktop rail as it scrolls, the strip.
    for (const control of document.querySelectorAll<HTMLElement>(".rail [data-key], .controls [data-key]")) {
      const key = `control:${control.dataset.key}`;
      const r = control.getBoundingClientRect();
      const frame = control.closest(desktop ? ".rail, .active-strip" : ".active-strip")?.getBoundingClientRect();
      const inside = (f: { top: number; bottom: number; left: number; right: number }) => r.top >= f.top && r.bottom <= f.bottom && r.left >= f.left && r.right <= f.right;
      if (r.height > 0 && !seen.has(key) && inside({ top: 0, bottom: innerHeight, left: 0, right: innerWidth }) && (!frame || inside(frame))) name(control, key, "control");
    }
  };
  const unname = () => {
    for (const el of named) {
      el.style.removeProperty("view-transition-name");
      el.style.removeProperty("view-transition-class");
    }
    named.clear();
  };
  // A morph cut short by this one may have left its names behind.
  for (const el of document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]')) named.add(el);
  unname();
  nameOnScreen();
  const transition = document.startViewTransition(() => {
    unname();
    update();
    nameOnScreen();
  });
  // A morph cut short by the next one rejects `ready`; the page has already updated.
  transition.ready.catch(() => {});
  void transition.finished.finally(() => run === morphs && unname());
}

function hashKey(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

function render(): void {
  const filters = readFilters();
  const { view } = filters;
  renderShelfLinks(view);
  renderModes(filters);

  const chipMatches = viewItems(filters);
  renderControls(filters, chipMatches);
  rows = rowsFor(filters, chipMatches);
  rendered = 0;
  const person = view === "feed" && filters.people.size === 1 ? [...filters.people][0]! : undefined;
  list.replaceChildren(...(view !== "feed" ? [shelfHead(view, Object.keys(library[view]).length)] : person ? [personHead(person, chipMatches)] : []));

  if (needsArchive(filters)) void loadArchive("all");
  if (rows.length === 0) {
    const shelfEmpty = view !== "feed" && Object.keys(library[view]).length === 0;
    list.append(
      moment({
        mood: "sleepy",
        title: shelfEmpty ? `Your ${SHELF_COPY[view].title.toLowerCase()} is empty` : "Nothing here yet",
        body: shelfEmpty ? SHELF_COPY[view].empty : "No posts match these filters.",
        action: shelfEmpty
          ? ["Back to the feed", () => writeFilters({ ...filters, view: "feed" })]
          : ["Show everything", () => clearFilters(filters)],
      }),
    );
    return;
  }
  appendPage();
}

// Today's deck deals the hand in every view, and the stack unless a tag or person filter
// narrows the pool past the deck's depth (that filter loads the archive anyway). Otherwise the
// archive deals once every chunk is in; until then New has no hand and Anytime waits.
function rowsFor(filters: Filters, chipMatches: FeedItem[]): Row[] {
  const visible = chipMatches.filter((item) => matchesShow(item, filters));
  dealtAs = new Map();
  if (filters.view !== "feed") return visible.map((item): Row => ({ type: "card", item }));
  const now = new Date();
  const fromDeck = todaysDeck()?.filter((item) => inView(item, filters));
  const pool = (useDeck: boolean) =>
    (useDeck && fromDeck ? fromDeck : archiveLoaded() ? visible : undefined)?.filter((item) => !isShelved(library, "favourites", item.id));
  const deal = { now, dealt: library.dealt, weight: weightFor(filters) };
  if (filters.mode === "anytime") {
    const stackPool = pool(narrowing(filters) === 0);
    if (!stackPool) return [{ type: "dealing" }];
    const stack = dealStack(stackPool, { ...deal, stack: filters.stack });
    if (stack.length === 0) return [];
    for (const item of stack) dealtAs.set(item.id, "stack");
    const more = dealStack(stackPool, { ...deal, stack: filters.stack + 1 }).length > 0;
    return [...stack.map((item): Row => ({ type: "card", item })), { type: "stack-end", stack: filters.stack, count: stack.length, more }];
  }
  const handPool = pool(true);
  const hand = handPool ? dealHand(handPool, { ...deal, fresh: visible.filter((item) => isFresh(item, now)) }) : [];
  for (const item of hand) dealtAs.set(item.id, "hand");
  const { ordered, freshCount } = orderFeed(visible, now, hand);
  const rows = ordered.map((item): Row => ({ type: "card", item }));
  if (freshCount > 0 && freshCount < ordered.length) rows.splice(freshCount, 0, { type: "caught-up", hand: hand.length });
  return rows;
}

// The feed hides archived posts, excluded topics and paused people, and New thins people seen less;
// a shelf shows exactly what you saved.
function viewItems(filters: Filters): FeedItem[] {
  if (filters.view !== "feed") return shelfItems(library, filters.view, new Map(loadedItems().map((item) => [item.id, item]))).filter((item) => matchesChips(item, filters));
  const items = feed.items.filter((item) => inFeed(item, filters) && matchesChips(item, filters));
  return filters.mode === "new" ? thinLess(items, seenLess(filters)) : items;
}

// Every post this device holds: the chunks loaded so far and today's deck.
const loadedItems = () => (deck ? feed.items.concat(deck.items) : feed.items);

function refreshControls(): void {
  const filters = readFilters();
  renderShelfLinks(filters.view);
  renderControls(filters, viewItems(filters));
}

function renderShelfLinks(view: View): void {
  for (const link of shelfLinks) {
    const shelf = link.dataset.shelf as Shelf;
    const count = Object.keys(library[shelf]).length;
    const badge = link.querySelector<HTMLElement>(".badge")!;
    badge.textContent = String(count);
    badge.hidden = count === 0;
    link.setAttribute("aria-pressed", String(view === shelf));
    link.setAttribute("aria-label", `${SHELF_COPY[shelf].title}, ${count} saved`);
    link.title = SHELF_COPY[shelf].title;
  }
}

function shelfHead(shelf: Shelf, count: number): HTMLElement {
  const back = h("button", { type: "button", className: "button quiet" }, ["Back to the feed"]);
  back.addEventListener("click", () => writeFilters({ ...readFilters(), view: "feed" }));
  return h("header", { className: "shelf-head" }, [
    h("h2", {}, [SHELF_COPY[shelf].title, h("span", { className: "count" }, [String(count)])]),
    back,
    syncLine(),
  ]);
}

function appendPage(): void {
  const page = rows.slice(rendered, rendered + PAGE_SIZE);
  list.append(...page.map(renderRow));
  rendered += page.length;
  const filters = readFilters();
  if (rendered >= rows.length && filters.view === "feed" && filters.mode === "new" && archiveLoaded()) list.append(renderEnd());
  // A dealt card counts once it is on the page; other days and other devices then deal something else.
  const dealtNow = page.flatMap((row) => (row.type === "card" && dealtAs.has(row.item.id) ? [row.item.id] : []));
  const next = recordDealt(library, dealtNow, dayKey(new Date()));
  if (next !== library) saveLibrary(next);
}

function renderRow(row: Row): HTMLElement {
  if (row.type === "card") return renderCard(row.item);
  if (row.type === "caught-up") return renderCaughtUp(row.hand);
  if (row.type === "dealing") return renderDealing();
  return renderStackEnd(row);
}

// On a shelf neither feed is selected, so the row steps aside and gives the list its room.
function renderModes(filters: Filters): void {
  modes.classList.toggle("away", filters.view !== "feed");
  modes.inert = filters.view !== "feed";
  for (const button of modeButtons) {
    button.setAttribute("aria-pressed", String(filters.view === "feed" && button.dataset.mode === filters.mode));
  }
  redeal.hidden = filters.view !== "feed" || filters.mode !== "anytime";
}

function renderControls(filters: Filters, chipMatches: FeedItem[]): void {
  controls.hidden = false;
  // Every render rebuilds the controls, so keep keyboard focus on the same control across it.
  const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-key]");
  const focusKey = focused && controls.contains(focused) ? focused.dataset.key : undefined;
  const keyboardFocus = !!focused?.matches(":focus-visible");
  // Until every chunk is in, an unfiltered feed counts from the manifest.
  const totals = filters.view === "feed" && narrowing(filters) === 0 && !archiveLoaded() ? feed.totals : undefined;
  const count = (format: Format | "") => {
    if (!totals) return chipMatches.filter((item) => !format || FORMAT_OF[item.kind] === format).length;
    return format ? totals[format] : totals.watch + totals.read + totals.post;
  };
  const present = new Set(totals ? FORMAT_NAMES.filter((format) => totals[format] > 0) : feed.items.map((item) => FORMAT_OF[item.kind]));
  const formats = FORMAT_NAMES.filter((format) => present.has(format));

  const tabButtons = (where: string) =>
    (["", ...formats] as const).map((format) => {
      const { label, icon: id } = format ? FORMATS[format] : { label: "All", icon: "i-all" };
      const n = count(format);
      const tab = h("button", { type: "button", className: "tab", title: `${label} (${n.toLocaleString()})`, ariaLabel: `${label}, ${n.toLocaleString()} post${n === 1 ? "" : "s"}` }, [
        icon(id),
        h("span", { className: "tab-label" }, [label]),
        h("span", { className: "count" }, [compactCount(n)]),
      ]);
      tab.dataset.key = `${where}:show:${format}`;
      tab.setAttribute("aria-pressed", String(filters.show === format));
      tab.disabled = filters.show !== format && n === 0;
      tab.addEventListener("click", () => writeFilters({ ...filters, show: format }));
      return tab;
    });
  tabs.replaceChildren(...tabButtons("bar"));
  sheetTabs.replaceChildren(...tabButtons("sheet"));

  const narrowed = narrowing(filters);
  const badge = filtersButton.querySelector<HTMLElement>(".badge")!;
  badge.textContent = String(narrowed);
  badge.hidden = narrowed === 0;
  filtersButton.setAttribute("aria-label", narrowed > 0 ? `Filters, ${narrowed} on` : "Filters");
  filtersButton.setAttribute("aria-expanded", String(sheet.open));
  const shown = count(filters.show);
  sheetDone.textContent = shown === 0 ? "Nothing matches" : `Show ${shown.toLocaleString()} post${shown === 1 ? "" : "s"}`;
  sheetClear.disabled = activeFilterCount(filters) === 0;

  const chip = (group: ChipGroup, value: string, lead: Node, label: string, hue?: Hue) => {
    const active = filters[group].has(value);
    const el = h("button", { type: "button", className: "chip", title: label }, [lead, h("span", { className: "chip-label" }, [label])]);
    el.dataset.key = `${group}:${value}`;
    if (hue) el.dataset.hue = hue;
    el.setAttribute("aria-pressed", String(active));
    el.addEventListener("click", (event) => {
      // Cmd/Ctrl-click a person: show only them, dropping the other people.
      if (group === "people" && (event.metaKey || event.ctrlKey)) {
        writeFilters({ ...filters, people: new Set([value]) });
        return;
      }
      const next = new Set(filters[group]);
      if (active) next.delete(value);
      else next.add(value);
      writeFilters({ ...filters, [group]: next });
    });
    return el;
  };

  const active = activeFilterCount(filters);
  const clear = h("button", { type: "button", className: "chip clear-chip", title: "Clear filters (Esc)", ariaLabel: `Clear ${active} filter${active === 1 ? "" : "s"}` }, [
    icon("i-x"),
    "Clear",
    h("span", { className: "count" }, [String(active)]),
  ]);
  clear.dataset.key = "clear";
  clear.addEventListener("click", () => clearFilters(filters));
  renderActiveStrip(filters, active);

  chips.replaceChildren(
    ...(active > 0 ? [clear] : []),
    ...EXCLUDE_IDS.map((id) => {
      const active = hidden.has(id);
      const el = h("button", { type: "button", className: "chip hide-chip", title: `Hide posts about ${EXCLUDE_PRESETS[id].label}` }, [
        icon("i-eye-off"),
        `No ${EXCLUDE_PRESETS[id].label}`,
      ]);
      el.dataset.key = `hide:${id}`;
      el.setAttribute("aria-pressed", String(active));
      el.addEventListener("click", () => toggleHidden(id));
      return el;
    }),
    h("span", { className: "chip-rule", ariaHidden: "true" }),
    ...feed.tags.map((tag) => chip("tags", tag, h("span", { className: "dot" }), tag, hues.get(tag))),
  );

  const authors = new Map<string, Hue>();
  // The deck has every source with an older post, so the list is whole before the archive loads.
  // A tag filter narrows the list to the people posting under it; selected people stay so
  // they can be unselected.
  const scope = { ...filters, people: new Set<string>() };
  for (const item of loadedItems()) {
    if (authors.has(item.author)) continue;
    if (matchesChips(item, scope) || filters.people.has(item.author)) authors.set(item.author, hueFor(item));
  }
  // Selected people lead the list, so what is filtering the feed is never buried in the alphabet, and
  // people seen more come next. Less and paused people stay in the alphabet, marked by their badge.
  const more = (author: string) => Number(levelOf(library, author) === "more");
  const ordered = [...authors].sort(
    ([a], [b]) =>
      Number(filters.people.has(b)) - Number(filters.people.has(a)) ||
      more(b) - more(a) ||
      a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  peopleCount.textContent = String(authors.size);
  people.replaceChildren(
    ...ordered.map(([author, hue]) => {
      const level = levelOf(library, author);
      const mark = h("span", { className: "monogram", ariaHidden: "true" }, [
        initial(author),
        ...(level === "normal" ? [] : [h("span", { className: "level-badge" }, [icon(LEVEL_COPY[level].icon)])]),
      ]);
      const el = chip("people", author, mark, author, hue);
      el.dataset.name = author.toLowerCase();
      if (level !== "normal") {
        el.dataset.level = level;
        el.title = `${author} (${LEVEL_COPY[level].label})`;
        el.ariaLabel = `${author}, ${level === "pause" ? "on pause" : `seen ${level}`}`;
      }
      return el;
    }),
  );
  applyPeopleFind();
  // A tapped chip may move (an unselected person returns to the alphabet); focus follows it without
  // scrolling there, so the next tap lands where the last one did. Keyboard focus still scrolls into view.
  if (focusKey) controls.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: !keyboardFocus });
}

// Phones only: what is narrowing the feed, kept in view under the bar, each one a tap to remove.
function renderActiveStrip(filters: Filters, active: number): void {
  const tokens: HTMLButtonElement[] = [];
  const token = (group: ChipGroup, value: string, label: string, lead: Node, hue?: Hue) => {
    const el = h("button", { type: "button", className: "chip token", title: `Remove ${label}`, ariaLabel: `Remove ${label}` }, [
      lead,
      h("span", { className: "chip-label" }, [label]),
      icon("i-x"),
    ]);
    el.dataset.key = `strip:${group}:${value}`;
    if (hue) el.dataset.hue = hue;
    el.addEventListener("click", () => {
      const next = new Set(filters[group]);
      next.delete(value);
      writeFilters({ ...filters, [group]: next });
    });
    tokens.push(el);
  };
  for (const tag of filters.tags) token("tags", tag, tag, h("span", { className: "dot" }), hues.get(tag));
  for (const person of filters.people) {
    const item = loadedItems().find((candidate) => candidate.author === person);
    token("people", person, person, h("span", { className: "monogram", ariaHidden: "true" }, [initial(person)]), item ? hueFor(item) : hueOf(person));
  }
  activeStrip.hidden = tokens.length === 0;
  if (tokens.length === 0) {
    activeStrip.replaceChildren();
    return;
  }
  const clear = h("button", { type: "button", className: "chip clear-chip", title: "Clear filters (Esc)", ariaLabel: `Clear ${active} filter${active === 1 ? "" : "s"}` }, [
    icon("i-x"),
    "Clear",
  ]);
  clear.dataset.key = "strip:clear";
  clear.addEventListener("click", () => clearFilters(filters));
  activeStrip.replaceChildren(clear, ...tokens);
}

function openSheet(): void {
  if (sheet.open) return;
  sheet.showModal();
  filtersButton.setAttribute("aria-expanded", "true");
  sheet.querySelector<HTMLElement>(".sheet-close")!.focus({ focusVisible: false } as FocusOptions);
}

// Pull the sheet down by its header to dismiss it; a short pull springs back.
function dragToClose(handle: HTMLElement): void {
  let startY: number | undefined;
  let pull = 0;
  handle.addEventListener("pointerdown", (event) => {
    if ((event.target as Element).closest("button")) return;
    startY = event.clientY;
    pull = 0;
    handle.setPointerCapture(event.pointerId);
    sheet.style.transition = "none";
  });
  handle.addEventListener("pointermove", (event) => {
    if (startY === undefined) return;
    pull = Math.max(0, event.clientY - startY);
    sheet.style.transform = `translateY(${pull}px)`;
  });
  const release = () => {
    if (startY === undefined) return;
    startY = undefined;
    sheet.style.transition = "";
    sheet.style.transform = "";
    if (pull > 90) sheet.close();
  };
  handle.addEventListener("pointerup", release);
  handle.addEventListener("pointercancel", release);
  handle.addEventListener("lostpointercapture", release);
}

// On phones the bar tucks away while you scroll down into the feed and comes back on any scroll up.
function tuckOnScroll(): void {
  let lastY = scrollY;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = scrollY;
    const delta = y - lastY;
    if (Math.abs(delta) < 6) return;
    lastY = y;
    // Only once the masthead has scrolled away, so the bar never tucks while the page top is in view.
    const pastTop = y > masthead.offsetHeight + controls.offsetHeight;
    const tuck = !railLayout.matches && !reducedMotion.matches && pastTop && delta > 0 && !controls.contains(document.activeElement);
    controls.classList.toggle("tucked", tuck);
  };
  addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
}

function applyPeopleFind(): void {
  const query = peopleFind.value.trim().toLowerCase();
  let shown = 0;
  for (const el of people.querySelectorAll<HTMLButtonElement>(".chip")) {
    const visible = !query || el.dataset.name!.includes(query) || el.getAttribute("aria-pressed") === "true";
    el.hidden = !visible;
    if (visible) shown++;
  }
  peopleNone.hidden = shown > 0;
}

function byline(item: FeedItem, lead: Node[] = []): HTMLElement {
  const format = FORMAT_OF[item.kind];
  return h("header", { className: "byline" }, [
    ...lead,
    h("span", { className: "author" }, [item.author]),
    // A quiet glyph tells reads from posts in a mixed feed. The thumbnail and play button already say
    // "video", and under a format tab every card is the same kind, so both skip it.
    ...(format === "watch" || readFilters().show
      ? []
      : [h("span", { className: "format", role: "img", ariaLabel: FORMATS[format].label, title: FORMATS[format].label }, [icon(FORMATS[format].icon, true)])]),
    dateline(item),
  ]);
}

const monthYear = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });

// A dealt card is there for what it is, not for being new, so it names its month rather than "6 yr. ago".
function dateline(item: FeedItem): HTMLElement {
  const as = dealtAs.get(item.id);
  const date = new Date(item.publishedAt);
  const text = as === "hand" ? `From ${monthYear.format(date)}` : as === "stack" ? monthYear.format(date) : ago(item.publishedAt);
  return h("time", { dateTime: item.publishedAt, title: date.toLocaleString(), ...(as === "hand" ? { className: "dealt" } : {}) }, [text]);
}

// A card's tag pill shares its footer with the action buttons. In a narrow card a long tag would
// wrap to two lines, so the stylesheet swaps in its short name there.
const SHORT_TAGS: Record<string, string> = { "Computer Science": "CompSci" };

function tagList(item: FeedItem): HTMLElement[] {
  const pill = (tag: string) => {
    const short = SHORT_TAGS[tag];
    if (!short) return h("li", {}, [tag]);
    return h("li", { title: tag }, [h("span", { className: "tag-full" }, [tag]), h("span", { className: "tag-short" }, [short])]);
  };
  return item.tags.length > 0 ? [h("ul", { className: "tags" }, item.tags.map(pill))] : [];
}

function renderCard(raw: FeedItem): HTMLElement {
  const item = branded(raw);
  const format = FORMAT_OF[item.kind];
  const card =
    format === "watch" && (item.videoId || item.image) ? renderWatch(item) : format === "post" ? renderPost(item) : renderRead(item);
  card.dataset.hue = hueFor(item);
  card.dataset.id = item.id;
  if (needsBranding(item)) void fetchBranding(raw);
  return card;
}

function branded(item: FeedItem): FeedItem {
  const branding = item.videoId ? brandings.get(item.videoId) : undefined;
  if (!branding) return item;
  return {
    ...item,
    ...(branding.title && branding.title !== item.title ? { title: branding.title, originalTitle: item.title } : {}),
    ...(branding.thumbnail ? { thumbnail: branding.thumbnail } : {}),
  };
}

const needsBranding = (item: FeedItem) =>
  item.videoId !== undefined &&
  dealtAs.has(item.id) &&
  !brandings.has(item.videoId) &&
  !item.originalTitle &&
  !item.thumbnail &&
  Date.now() - Date.parse(item.publishedAt) > BUILD_BRANDS_MS;

async function fetchBranding(item: FeedItem): Promise<void> {
  const videoId = item.videoId!;
  brandings.set(videoId, null);
  try {
    const branding = await getJson<Branding>(`dearrow/${videoId}`);
    if (!branding.title && !branding.thumbnail) return;
    brandings.set(videoId, branding);
    const card = list.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(item.id)}"]`);
    // A video already playing keeps playing under its original title.
    if (card && !card.querySelector("iframe")) card.replaceWith(renderCard(item));
  } catch {}
}

function actions(item: FeedItem, after?: (shelf: Shelf) => void): HTMLElement {
  const done = DONE_LABEL[FORMAT_OF[item.kind]];
  const button = (shelf: Shelf, iconId: string, on: string, off: string) => {
    const active = isShelved(library, shelf, item.id);
    const el = h("button", { type: "button", className: `act act-${shelf}`, title: active ? on : off, ariaLabel: active ? on : off }, [
      icon(iconId, shelf === "favourites" && active),
    ]);
    el.setAttribute("aria-pressed", String(active));
    el.addEventListener("click", () => {
      shelve(item, shelf);
      after?.(shelf);
    });
    return el;
  };
  const level = levelOf(library, item.author);
  const tuneLabel = level === "normal" ? `Tune ${item.author}` : `Tune ${item.author} (${LEVEL_COPY[level].label})`;
  const tune = h("button", { type: "button", className: "act act-tune", title: tuneLabel, ariaLabel: tuneLabel, ariaHasPopup: "dialog" }, [
    icon(level === "normal" ? "i-person" : LEVEL_COPY[level].icon),
  ]);
  tune.dataset.level = level;
  tune.addEventListener("click", () => openPersonSheet(item, tune));
  return h("div", { className: "actions" }, [
    button("favourites", "i-heart", "Remove from favourites", "Add to favourites"),
    button("archive", "i-check", `Mark as not ${done}`, `Mark as ${done}`),
    tune,
  ]);
}

function shelve(item: FeedItem, shelf: Shelf): void {
  const wasOn = isShelved(library, shelf, item.id);
  saveLibrary(toggleShelf(library, shelf, item, new Date()));
  const view = readFilters().view;
  const card = list.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(item.id)}"]`);
  const leaves = (view === "feed" && shelf === "archive") || (view === shelf && wasOn);
  if (card && leaves) collapseOut(card);
  else card?.replaceWith(renderCard(item));
  refreshControls();
}

// The card fades out, then the cards after it glide into the gap (a FLIP from their old positions).
function collapseOut(card: HTMLElement): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    card.remove();
    return;
  }
  card.style.pointerEvents = "none";
  const exit = card.animate(
    [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(0.94)" },
    ],
    { duration: 220, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
  );
  exit.addEventListener("finish", () => {
    const followers: HTMLElement[] = [];
    for (let el = card.nextElementSibling; el && followers.length < 24; el = el.nextElementSibling) {
      if (el instanceof HTMLElement) followers.push(el);
    }
    const before = followers.map((el) => el.getBoundingClientRect());
    card.remove();
    followers.forEach((el, i) => {
      const after = el.getBoundingClientRect();
      const dx = before[i]!.left - after.left;
      const dy = before[i]!.top - after.top;
      if (dx === 0 && dy === 0) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
        duration: 450,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
    });
  });
}

function renderWatch(item: FeedItem): HTMLElement {
  const playable = item.videoId !== undefined;
  // DeArrow frame first, then YouTube's sharp thumbnail, then whatever the feed carried.
  const sources = [item.thumbnail, playable ? `https://i.ytimg.com/vi/${item.videoId}/hq720.jpg` : undefined, item.image].filter(
    (src): src is string => !!src,
  );
  const img = h("img", { src: sources.shift()!, alt: "", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" });
  img.addEventListener("error", () => {
    const next = sources.shift();
    if (next) img.src = next;
  });
  const picture = [
    img,
    h("span", { className: "play", ariaHidden: "true" }, [icon("i-play", true)]),
  ];
  const thumb = playable
    ? h("button", { type: "button", className: "thumb", ariaLabel: `Play ${item.title}` }, picture)
    : h("a", { className: "thumb", href: item.url, target: "_blank", rel: "noopener", ariaLabel: item.title }, picture);
  if (playable) thumb.addEventListener("click", () => play(thumb, item), { once: true });

  return h("article", { className: "card watch" }, [
    thumb,
    h("div", { className: "body" }, [
      h("h2", { className: "title" }, [
        h("a", { href: item.url, target: "_blank", rel: "noopener", className: "plain", ...(item.originalTitle ? { title: `Original title: ${item.originalTitle}` } : {}) }, [item.title]),
      ]),
      byline(item),
      h("footer", { className: "foot" }, [h("div", {}, tagList(item)), actions(item)]),
    ]),
  ]);
}

function renderRead(item: FeedItem): HTMLElement {
  const mini = item.image
    ? h("img", { className: "mini", src: item.image, alt: "", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" })
    : undefined;
  mini?.addEventListener("error", () => mini.remove(), { once: true });

  return h("article", { className: `card read${mini ? "" : " jewel"}` }, [
    byline(item, [h("span", { className: "monogram", ariaHidden: "true" }, [initial(item.author)])]),
    h("div", { className: "text" }, [
      h("h2", { className: "title" }, [
        h("a", { href: item.url, target: "_blank", rel: "noopener", className: "stretch" }, [item.title || "Untitled"]),
      ]),
      ...(mini ? [mini] : []),
      ...(item.summary ? [h("p", { className: "summary" }, [item.summary])] : []),
    ]),
    h("footer", { className: "foot" }, [
      h("div", {}, tagList(item)),
      actions(item),
    ]),
  ]);
}

function renderPost(item: FeedItem): HTMLElement {
  const text = item.summary || item.title;
  const picture = item.image
    ? h("img", { className: "post-image", src: item.image, alt: "", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" })
    : undefined;
  picture?.addEventListener("error", () => picture.remove(), { once: true });

  const link = h("a", { href: item.url, target: "_blank", rel: "noopener", className: "stretch", ariaLabel: `${item.author}: ${text}` }, [text]);
  if (NETWORK[item.kind]) {
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      openViewer(item);
    });
  }

  return h("article", { className: "card post" }, [
    byline(item, [h("span", { className: "monogram", ariaHidden: "true" }, [initial(item.author)])]),
    h("p", { className: "post-text" }, [link]),
    ...(picture ? [picture] : []),
    h("footer", { className: "foot" }, [
      h("div", {}, tagList(item)),
      actions(item),
    ]),
  ]);
}

async function loadPost(api: string | undefined, normalize: (json: unknown) => PostView): Promise<PostView> {
  if (!api) throw new Error("no API URL for this post");
  const response = await fetch(api, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return normalize(await response.json());
}

// The viewer shows one post in full and nothing else: no replies, no profile, no "more like this".
function openViewer(item: FeedItem): void {
  const network = NETWORK[item.kind]!;
  const body = h("div", { className: "viewer-body" }, [h("p", { className: "viewer-text" }, [item.summary || item.title])]);
  const media = h("div", { className: "viewer-media loading", ariaBusy: "true" });
  const close = h("button", { type: "button", className: "viewer-close", ariaLabel: "Close" }, [icon("i-x")]);
  close.addEventListener("click", closeViewer);
  const head = h("header", { className: "viewer-head" }, [
    h("span", { className: "monogram", ariaHidden: "true" }, [initial(item.author)]),
    h("div", { className: "who" }, [h("strong", {}, [item.author]), h("span", {}, [network.name])]),
    close,
  ]);
  const foot = h("footer", { className: "viewer-foot" });
  const renderFoot = () =>
    foot.replaceChildren(
      actions(item, (shelf) => {
        if (shelf === "archive" && isShelved(library, "archive", item.id)) closeViewer();
        else renderFoot();
      }),
      h("a", { className: "viewer-out", href: item.url, target: "_blank", rel: "noopener" }, [`Open on ${network.name}`, icon("i-arrow")]),
    );
  renderFoot();

  const sheet = h("article", { className: "viewer-sheet" }, [
    head,
    h("time", { className: "viewer-time", dateTime: item.publishedAt }, [new Date(item.publishedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })]),
    body,
    media,
    foot,
  ]);
  sheet.dataset.hue = hueFor(item);
  viewer.replaceChildren(sheet);
  history.pushState({ viewer: true }, "", location.href);
  viewer.showModal();
  close.focus({ focusVisible: false } as FocusOptions);

  network
    .load(item)
    .then((post) => {
      if (!sheet.isConnected) return;
      if (post.author.avatar) {
        const avatar = h("img", { className: "avatar", src: post.author.avatar, alt: "", referrerPolicy: "no-referrer" });
        avatar.addEventListener("error", () => avatar.remove(), { once: true });
        head.querySelector(".monogram")!.replaceWith(avatar);
      }
      head.querySelector(".who span")!.textContent = `${post.author.handle} on ${network.name}`;
      body.replaceChildren(
        h(
          "p",
          { className: "viewer-text" },
          post.body.map((segment) =>
            segment.href ? h("a", { href: segment.href, target: "_blank", rel: "noopener" }, [segment.text]) : document.createTextNode(segment.text),
          ),
        ),
      );
      media.replaceChildren(...postMedia(post, item.url, network.name));
      media.classList.remove("loading");
      media.removeAttribute("aria-busy");
    })
    .catch(() => {
      if (!sheet.isConnected) return;
      media.classList.remove("loading");
      media.removeAttribute("aria-busy");
      media.replaceChildren(h("p", { className: "viewer-note" }, [`Couldn't load the full post from ${network.name}. Here's what the feed had.`]));
    });
}

function postMedia(post: PostView, postUrl: string, network: string): HTMLElement[] {
  const parts: HTMLElement[] = [];
  if (post.images.length > 0) {
    parts.push(
      h(
        "div",
        { className: `viewer-images count-${Math.min(post.images.length, 4)}` },
        post.images.map((image) => {
          const img = h("img", { src: image.src, alt: image.alt, loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" });
          if (post.images.length === 1 && image.ratio) img.style.aspectRatio = String(image.ratio);
          return img;
        }),
      ),
    );
  }
  if (post.video) {
    parts.push(
      h("a", { className: "viewer-video", href: postUrl, target: "_blank", rel: "noopener" }, [
        ...(post.video.poster ? [h("img", { src: post.video.poster, alt: "", referrerPolicy: "no-referrer" })] : []),
        h("span", { className: "play", ariaHidden: "true" }, [icon("i-play", true)]),
        h("span", { className: "viewer-video-note" }, [`Video plays on ${network}`]),
      ]),
    );
  }
  if (post.link) {
    const { url, title, description, image } = post.link;
    parts.push(
      h("a", { className: "viewer-link", href: url, target: "_blank", rel: "noopener" }, [
        ...(image ? [h("img", { src: image, alt: "", loading: "lazy", referrerPolicy: "no-referrer" })] : []),
        h("span", { className: "viewer-link-text" }, [
          h("strong", {}, [title]),
          ...(description ? [h("span", {}, [description])] : []),
          h("small", {}, [new URL(url).hostname.replace(/^www\./, "")]),
        ]),
      ]),
    );
  }
  if (post.quote) {
    parts.push(h("blockquote", { className: "viewer-quote" }, [h("strong", {}, [post.quote.author]), h("p", {}, [post.quote.text])]));
  }
  return parts;
}

function closeViewer(): void {
  if (!viewer.open) return;
  // Close now; the history step only tidies the URL stack, so a slow popstate can't leave it open.
  viewer.close();
  if (history.state?.viewer) {
    skipNextPop = true;
    history.back();
  }
}

function play(thumb: HTMLElement, item: FeedItem): void {
  const frame = h("iframe", {
    src: `https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1&rel=0`,
    title: item.title,
    allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
    allowFullscreen: true,
  });
  thumb.replaceWith(h("div", { className: "thumb" }, [frame]));
}

function renderCaughtUp(hand: number): HTMLElement {
  const el = moment({
    mood: "happy",
    title: "You're all caught up!",
    body:
      hand > 0
        ? `That's this week, plus ${hand} from the archive. A new hand is dealt tomorrow. Older posts wait below, if you want them.`
        : "Everything new from this week is above. Older favourites wait below, if you want them.",
  });
  el.setAttribute("role", "separator");
  el.dataset.row = "caught-up";
  cheer.observe(el);
  return el;
}

// The stack ends here. Another one is a deliberate tap, never more scrolling.
function renderStackEnd({ stack, count, more }: Extract<Row, { type: "stack-end" }>): HTMLElement {
  const filters = readFilters();
  const el = moment({
    mood: "sleepy",
    title: stack === 1 ? "That's today's stack" : `That's stack ${stack}`,
    body: `${count} pick${count === 1 ? "" : "s"} from across the years. A fresh stack is dealt tomorrow.`,
    ...(more ? { action: ["Keep digging", () => writeFilters({ ...filters, stack: stack + 1 })] as [string, () => void], quiet: true } : {}),
  });
  el.setAttribute("role", "separator");
  el.dataset.row = "stack-end";
  return el;
}

function renderDealing(): HTMLElement {
  const el = moment({ mood: "happy", title: "Dealing today's stack", body: "Gathering posts from every year." });
  el.dataset.row = "dealing";
  return el;
}

function renderEnd(): HTMLElement {
  const skipped = feed.errors.length;
  const hiddenCount = feed.items.filter((item) => !isShelved(library, "archive", item.id) && isExcluded(item, hidden)).length;
  const paused = tunedPeople(library).filter(([, tuned]) => tuned.level === "pause").length;
  return moment({
    mood: "sleepy",
    title: "That's everything",
    body: "You've seen it all. Go stretch, sip some water, or make something lovely.",
    fine: [
      `Updated ${ago(feed.generatedAt)}.`,
      "Calmer YouTube titles and thumbnails from DeArrow (CC BY-NC-SA 4.0).",
      ...(hiddenCount > 0 ? [`${hiddenCount} post${hiddenCount === 1 ? "" : "s"} hidden by your filters.`] : []),
      ...(paused > 0 ? [`${paused} ${paused === 1 ? "person" : "people"} on pause.`] : []),
      ...(skipped > 0 ? [`${skipped} source${skipped === 1 ? "" : "s"} couldn't be reached.`] : []),
    ].join(" "),
  });
}

// How much of a person to show: one track of four stops, as native radios so arrow keys move along it.
function levelControl(author: string, where: "sheet" | "head"): HTMLElement {
  const current = levelOf(library, author);
  const options = LEVELS.map((level) => {
    const input = h("input", { type: "radio", name: `level-${where}`, value: level, checked: level === current });
    input.addEventListener("change", () => input.checked && tune(author, level));
    return h("label", { className: "level", dataset: { level } }, [input, icon(LEVEL_COPY[level].icon), h("span", {}, [LEVEL_COPY[level].label])]);
  });
  // The sheet explains each stop in a line under the track; the head is the track alone.
  const control = h("fieldset", { className: "levels", ariaLabel: `How much of ${author} to show`, dataset: { author, where } }, [
    h("div", { className: "level-track" }, options),
    ...(where === "sheet" ? [h("p", { className: "level-note" }, [])] : []),
  ]);
  fillLevelNote(control, current);
  return control;
}

function fillLevelNote(control: HTMLElement, level: Level): void {
  const note = control.querySelector(".level-note");
  if (note) note.textContent = LEVEL_COPY[level].note;
}

// A change applies at once underneath: cards that no longer belong fold away, and the controls and
// every other control for the same person follow.
function tune(author: string, level: Level): void {
  saveLibrary(setLevel(library, author, level, new Date()));
  for (const control of document.querySelectorAll<HTMLElement>(".levels")) {
    if (control.dataset.author !== author) continue;
    for (const input of control.querySelectorAll<HTMLInputElement>("input")) input.checked = input.value === level;
    fillLevelNote(control, level);
  }
  if (!feed) return;
  // A shelf shows what you saved whatever the level, so only its cards' tune buttons change.
  if (readFilters().view === "feed") settleCards();
  else render();
}

function openPersonSheet(item: FeedItem, opener: HTMLElement): void {
  personOpener = { el: opener, id: item.id };
  renderPersonSheet(item);
  if (!personSheet.open) personSheet.showModal();
  placePersonSheet();
  personSheet.querySelector<HTMLInputElement>("input:checked")?.focus({ focusVisible: false } as FocusOptions);
}

function renderPersonSheet(item: FeedItem): void {
  const author = item.author;
  const filters = readFilters();
  const now = new Date();
  const theirs = feed.items.filter((post) => post.author === author);
  const week = theirs.filter((post) => isFresh(post, now)).length;
  const tags = [...new Set(theirs.flatMap((post) => post.tags))];
  const close = h("button", { type: "button", className: "sheet-close", ariaLabel: "Close" }, [icon("i-x")]);
  close.addEventListener("click", () => personSheet.close());
  const onlyThem = filters.view === "feed" && filters.people.size === 1 && filters.people.has(author);
  const only = h("button", { type: "button", className: "button quiet person-only" }, [`Only show ${author}`]);
  only.addEventListener("click", () => {
    personSheet.close();
    writeFilters({ ...filters, view: "feed", people: new Set([author]) });
  });
  personSheet.dataset.hue = hueFor(item);
  personSheet.replaceChildren(
    h("header", { className: "person-sheet-head" }, [
      h("span", { className: "monogram", ariaHidden: "true" }, [initial(author)]),
      h("div", { className: "who" }, [
        h("h2", { id: "person-title" }, [author]),
        h("p", {}, [[week === 0 ? "Nothing new this week" : `${week} new this week`, ...tags].join(" · ")]),
      ]),
      close,
    ]),
    levelControl(author, "sheet"),
    ...(onlyThem ? [] : [only]),
  );
}

// The tune button that opened the sheet, or the same card's button once that card has re-rendered.
function liveOpener(): HTMLElement | undefined {
  if (!personOpener) return undefined;
  if (personOpener.el.isConnected) return personOpener.el;
  const again = document.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(personOpener.id)}"] .act-tune, .viewer .act-tune`);
  if (again) personOpener.el = again;
  return again ?? undefined;
}

// Phones get a bottom sheet. On desktop it is a popover beside the button that opened it: below it,
// or above when the screen runs out, and always inside the screen.
function placePersonSheet(): void {
  const opener = liveOpener();
  if (!railLayout.matches) {
    personSheet.style.removeProperty("left");
    personSheet.style.removeProperty("top");
    return;
  }
  if (!opener) return;
  const at = opener.getBoundingClientRect();
  const width = personSheet.offsetWidth;
  const height = personSheet.offsetHeight;
  const left = Math.min(Math.max(16, at.right - width), innerWidth - width - 16);
  const below = at.bottom + 10;
  const top = below + height <= innerHeight - 16 ? below : Math.max(16, at.top - height - 10);
  personSheet.style.left = `${left}px`;
  personSheet.style.top = `${top}px`;
}

// Filtered down to one person, the feed opens with their name and the same control, which is where a
// paused person is resumed.
function personHead(author: string, items: FeedItem[]): HTMLElement {
  const first = loadedItems().find((item) => item.author === author);
  const count = items.length;
  // The name on the left and the level track on the right, or under it where they don't fit. The
  // filter itself is undone from the active strip or the rail.
  return h("header", { className: "person-head", dataset: { hue: first ? hueFor(first) : hueOf(author) } }, [
    h("div", { className: "person-row" }, [
      h("div", { className: "person-id" }, [
        h("span", { className: "monogram", ariaHidden: "true" }, [initial(author)]),
        h("h2", {}, [author, h("span", { className: "count", title: `${count} post${count === 1 ? "" : "s"}` }, [count.toLocaleString()])]),
      ]),
      levelControl(author, "head"),
    ]),
  ]);
}

function moment(options: {
  mood: "happy" | "sleepy";
  title: string;
  body: string;
  fine?: string;
  action?: [string, () => void];
  quiet?: boolean;
}): HTMLElement {
  const sprout = svg("sprout", "mascot");
  const children: Node[] = [
    sprout,
    h("p", { className: "moment-title" }, [options.title]),
    h("p", {}, [options.body]),
  ];
  if (options.action) {
    const [label, onClick] = options.action;
    const button = h("button", { type: "button", className: options.quiet ? "button quiet" : "button" }, [label]);
    button.addEventListener("click", onClick);
    children.push(button);
  }
  if (options.fine) children.push(h("p", { className: "fine" }, [options.fine]));
  return h("div", { className: `moment ${options.mood}` }, children);
}

function initial(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "?";
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400],
  ["month", 30 * 86_400],
  ["week", 7 * 86_400],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

function ago(iso: string): string {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

function svg(className: string, symbol: string): SVGSVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("class", className);
  el.setAttribute("viewBox", symbol === "mascot" ? "0 0 64 64" : "0 0 24 24");
  el.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${symbol}`);
  el.append(use);
  return el;
}

function icon(id: string, filled = false): SVGSVGElement {
  return svg(filled ? "icon filled" : "icon", id);
}

type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], "dataset">> & {
  dataset?: Record<string, string>;
};

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K>,
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const { dataset, ...rest } = props;
  const el = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(el.dataset, dataset);
  el.append(...children);
  return el;
}
