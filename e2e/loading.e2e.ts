import type { Page } from "@playwright/test";
import { dayKey } from "../src/shared/order";
import { expect, item, ITEMS, OLDER_CHUNK, publishFeed, RECENT_CHUNK, serveFeed, test } from "./fixtures";

const cards = (page: Page) => page.getByRole("main").getByRole("article");

// Holds the older chunk's response until the test lets it through.
async function holdOlderChunk(page: Page): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(OLDER_CHUNK, async (route) => {
    await held;
    await route.fallback();
  });
  return release;
}

// The /feed/ requests in the order the page sent them and saw them finish.
function feedEvents(page: Page): string[] {
  const events: string[] = [];
  const path = (url: string) => new URL(url).pathname;
  page.on("request", (request) => path(request.url()).startsWith("/feed/") && events.push(`start ${path(request.url())}`));
  page.on("requestfinished", (request) => path(request.url()).startsWith("/feed/") && events.push(`done ${path(request.url())}`));
  return events;
}

// Ten sources: forty posts in the last three weeks, then two years of thirty each.
const SOURCES = ["Ada", "Ben", "Cleo", "Dana", "Eli", "Fay", "Gus", "Hana", "Ivo", "Juno"];
const post = (n: number, age: number) =>
  item({ id: `rss:p${n}`, kind: "rss", title: `Post ${n}`, author: SOURCES[n % 10]!, tags: [n % 10 < 3 ? "HCI" : "Play"] }, age);
const range = (from: number, count: number, age: (i: number) => number) => Array.from({ length: count }, (_, i) => post(from + i, age(i)));
const YEAR_CHUNK = "/feed/items-2026-0000cccc.json";
const OLDEST_CHUNK = "/feed/items-2025-0000eeee.json";
const BIG = publishFeed(
  {
    "feed/items-recent-0000ffff.json": range(0, 40, (i) => i / 2),
    [YEAR_CHUNK.slice(1)]: range(100, 30, (i) => 60 + i * 5),
    [OLDEST_CHUNK.slice(1)]: range(200, 30, (i) => 400 + i * 5),
  },
  { tags: ["HCI", "Play"], kinds: ["rss"], errors: [] },
);
const yearRequests = (page: Page) => {
  const seen: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/feed\/items-\d{4}-/.test(path)) seen.push(path);
  });
  return seen;
};

test("the first visit loads the manifest, the recent chunk and today's deck, and no year", async ({ page }) => {
  const events = feedEvents(page);
  await serveFeed(page, BIG);
  await page.goto("/");
  await expect(page.locator("time.dealt")).toHaveCount(2);
  await expect(page.getByText("You're all caught up!")).toBeAttached();
  await expect(page.getByRole("button", { name: /^All, 100 posts/ })).toBeVisible();
  await page.goto("/?feed=anytime");
  await expect(cards(page)).toHaveCount(20);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect(cards(page)).toHaveCount(24);
  await expect(page.getByText("That's today's stack")).toBeAttached();
  await expect(page.getByText("That's today's stack")).toBeVisible();
  const fetched = new Set(events.filter((event) => event.startsWith("start")).map((event) => event.replace(/-[0-9a-f]{8}\.json$/, "")));
  expect([...fetched].sort()).toEqual([`start /feed/deck-${dayKey(new Date())}`, "start /feed/items-recent", "start /feed/manifest.json"]);
});

test("scrolling past what has loaded brings in the next year, and only that one", async ({ page }) => {
  const years = yearRequests(page);
  await serveFeed(page, BIG);
  await page.goto("/");
  await expect(page.getByText("You're all caught up!")).toBeAttached();
  expect(years).toEqual([]);
  // Scroll only until the list asks for more, so a later page of the new year can't ask again.
  for (let i = 0; i < 30 && years.length === 0; i++) {
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100);
  }
  expect(years).toEqual([YEAR_CHUNK]);
  await expect(cards(page).filter({ hasText: "Post 100" })).toBeAttached();
  await page.waitForTimeout(300);
  expect(years).toEqual([YEAR_CHUNK]);
  await expect(page.getByText("That's everything")).toHaveCount(0);
});

test("a tag filter loads every year left, for its counts and people", async ({ page, isMobile }) => {
  const years = yearRequests(page);
  await serveFeed(page, BIG);
  await page.goto("/");
  await expect(page.getByText("You're all caught up!")).toBeAttached();
  if (isMobile) await page.locator(".filters-button").click();
  await page.getByRole("button", { name: "HCI", exact: true }).click();
  await expect(page.getByRole("button", { name: /^All, 30 posts/ }).first()).toBeAttached();
  expect(years.sort()).toEqual([OLDEST_CHUNK, YEAR_CHUNK]);
});

test("a link filtered to people waits for every chunk before it renders", async ({ page }) => {
  const release = await holdOlderChunk(page);
  const recent = page.waitForResponse(RECENT_CHUNK);
  const older = page.waitForRequest(OLDER_CHUNK);

  await page.goto("/?people=Ben+Ortiz,Dana+Wu");
  await Promise.all([recent, older]);
  await page.waitForTimeout(250);
  await expect(cards(page)).toHaveCount(0);
  await expect(page.locator(".skeleton")).toHaveCount(3);

  release();
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^All, 2 posts/ })).toBeVisible();
  await expect(cards(page).filter({ hasText: ITEMS.paper.title })).toBeVisible();
});

test("an older chunk that fails to load leaves the recent feed working, with no error", async ({ page }) => {
  await page.route(OLDER_CHUNK, (route) => route.fulfill({ status: 503 }));

  await page.goto("/");
  await expect(cards(page)).toHaveCount(3);
  await expect(page.getByText("That's everything")).toBeAttached();
  await expect(page.getByText("The feed is napping")).toHaveCount(0);
});
