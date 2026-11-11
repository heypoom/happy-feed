import type { Page } from "@playwright/test";
import { expect, ITEMS, OLDER_CHUNK, RECENT_CHUNK, test } from "./fixtures";

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

test("the feed paints from the manifest and the recent chunk, then adds the older chunk", async ({ page }) => {
  const events = feedEvents(page);
  const release = await holdOlderChunk(page);

  await page.goto("/");
  await expect(cards(page)).toHaveCount(3);
  expect(events.filter((event) => event.startsWith("done"))).toEqual(["done /feed/manifest.json", `done ${RECENT_CHUNK}`]);
  expect(events.indexOf(`start ${OLDER_CHUNK}`)).toBeGreaterThan(events.indexOf(`done ${RECENT_CHUNK}`));
  await expect(page.getByText("That's everything")).toHaveCount(0);

  release();
  await expect(cards(page)).toHaveCount(4);
  await expect(page.getByText("You're all caught up!")).toBeVisible();
  await expect(page.getByText("That's everything")).toBeAttached();
  expect(events.filter((event) => event.startsWith("start"))).toEqual(["start /feed/manifest.json", `start ${RECENT_CHUNK}`, `start ${OLDER_CHUNK}`]);
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
