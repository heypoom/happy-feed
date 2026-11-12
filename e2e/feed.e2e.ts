import type { Page } from "@playwright/test";
import { expect, ITEMS, test } from "./fixtures";

const cards = (page: Page) => page.getByRole("main").getByRole("article");
const card = (page: Page, title: string) => cards(page).filter({ hasText: title });
const titles = (page: Page) => page.getByRole("main").getByRole("heading", { level: 2 }).allInnerTexts();
// On phones the tags, sources, No AI and people live in a bottom sheet; on desktop they are the rail.
const openFilters = async (page: Page, isMobile: boolean) => {
  if (isMobile) await page.locator(".filters-button").click();
};
const closeFilters = async (page: Page, isMobile: boolean) => {
  if (isMobile) await page.getByRole("button", { name: "Close filters" }).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(cards(page)).toHaveCount(4);
});

test("shows fresh posts newest first, then the caught-up divider, then older ones", async ({ page }) => {
  expect(await titles(page)).toEqual([ITEMS.noise.title, ITEMS.hype.title, ITEMS.paper.title]);
  await expect(card(page, ITEMS.sorted.title)).toBeVisible();

  const list = page.getByRole("main");
  const order = await list.locator(":scope .list > *").evaluateAll((els) =>
    els.map((el) => (el.matches("article") ? (el as HTMLElement).dataset.id : el.getAttribute("role"))),
  );
  expect(order).toEqual([ITEMS.noise.id, ITEMS.hype.id, ITEMS.sorted.id, "separator", ITEMS.paper.id, null]);
  await expect(page.getByText("You're all caught up!")).toBeVisible();
  await expect(page.getByText("1 source couldn't be reached.")).toBeAttached();
});

test("the format tabs narrow the feed and Back restores it", async ({ page }) => {
  await page.getByRole("button", { name: /^Read, 2 posts/ }).click();
  await expect(page).toHaveURL(/\?show=read$/);
  await expect(cards(page)).toHaveCount(2);
  expect(await titles(page)).toEqual([ITEMS.hype.title, ITEMS.paper.title]);

  await page.goBack();
  await expect(cards(page)).toHaveCount(4);
});

test("a tag chip filters, and Clear or Esc removes every filter", async ({ page, isMobile }) => {
  await openFilters(page, isMobile);
  await page.getByRole("button", { name: "HCI", exact: true }).click();
  await expect(page).toHaveURL(/\?tags=HCI$/);
  await closeFilters(page, isMobile);
  expect(await titles(page)).toEqual([ITEMS.hype.title, ITEMS.paper.title]);

  await page.getByRole("button", { name: "Clear 1 filter" }).click();
  await expect(cards(page)).toHaveCount(4);

  await openFilters(page, isMobile);
  await page.getByRole("button", { name: "Creative Coding", exact: true }).click();
  await closeFilters(page, isMobile);
  await expect(cards(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(cards(page)).toHaveCount(4);
  await expect(page).toHaveURL(/\/$/);
});

test("filters in the URL survive a reload", async ({ page }) => {
  await page.goto("/?show=post");
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, ITEMS.sorted.title)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Posts, 1 post$/ })).toHaveAttribute("aria-pressed", "true");
});

test("finding a person and pressing Enter shows only their posts", async ({ page, isMobile }) => {
  await openFilters(page, isMobile);
  const find = page.getByRole("searchbox", { name: "Find a person" });
  await find.fill("nobody");
  await expect(page.getByText("No one by that name.")).toBeVisible();

  await find.fill("dana");
  const people = page.getByRole("group", { name: /People/ });
  await expect(people.getByRole("button")).toHaveText(["DDana Wu"]);

  await find.press("Enter");
  await expect(page).toHaveURL(/\?people=Dana(\+|%20)Wu$/);
  await closeFilters(page, isMobile);
  expect(await titles(page)).toEqual([ITEMS.paper.title]);
});

test("No AI hides posts about AI and stays on after a reload", async ({ page, isMobile }) => {
  await openFilters(page, isMobile);
  const noAi = page.getByRole("button", { name: "No AI" });
  await noAi.click();
  await expect(noAi).toHaveAttribute("aria-pressed", "true");
  await closeFilters(page, isMobile);
  await expect(card(page, ITEMS.hype.title)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(3);
  await expect(page.getByText("1 post hidden by your filters.")).toBeAttached();

  await page.reload();
  await expect(cards(page)).toHaveCount(3);
  await openFilters(page, isMobile);
  await expect(page.getByRole("button", { name: "No AI" })).toHaveAttribute("aria-pressed", "true");
});

test("a favourite waits on the Favourites shelf across reloads", async ({ page }) => {
  await page.getByRole("button", { name: "Favourites, 0 saved" }).click();
  const empty = page.locator(".moment").filter({ hasText: "Your favourites is empty" });
  await empty.getByRole("button", { name: "Back to the feed" }).click();

  await card(page, ITEMS.paper.title).getByRole("button", { name: "Add to favourites" }).click();
  await expect(card(page, ITEMS.paper.title).getByRole("button", { name: "Remove from favourites" })).toBeVisible();
  await expect(cards(page)).toHaveCount(4);

  await page.reload();
  await page.getByRole("button", { name: "Favourites, 1 saved" }).click();
  await expect(page).toHaveURL(/\?view=favourites$/);
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, ITEMS.paper.title)).toBeVisible();

  await card(page, ITEMS.paper.title).getByRole("button", { name: "Remove from favourites" }).click();
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Favourites, 0 saved" })).toBeVisible();
});

test("marking a post as read moves it from the feed to the Archive", async ({ page }) => {
  await card(page, ITEMS.hype.title).getByRole("button", { name: "Mark as read" }).click();
  await expect(card(page, ITEMS.hype.title)).toHaveCount(0);
  await page.reload();
  await expect(cards(page)).toHaveCount(3);
  await expect(card(page, ITEMS.hype.title)).toHaveCount(0);

  await page.getByRole("button", { name: "Archive, 1 saved" }).click();
  await expect(cards(page)).toHaveCount(1);
  await card(page, ITEMS.hype.title).getByRole("button", { name: "Mark as not read" }).click();
  await expect(cards(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Back to the feed" }).click();
  await expect(cards(page)).toHaveCount(4);
});

test("the theme toggle switches modes and remembers the choice", async ({ page }) => {
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-resolved", "light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(html).toHaveAttribute("data-resolved", "dark");

  await page.reload();
  await expect(html).toHaveAttribute("data-resolved", "dark");
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
});

test("a Bluesky post opens in the viewer, falls back to the feed text, and Esc closes it", async ({ page }) => {
  await card(page, ITEMS.sorted.title).getByRole("link").click();
  const viewer = page.getByRole("dialog", { name: "Post" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText(ITEMS.sorted.summary!)).toBeVisible();
  await expect(viewer.getByText("Couldn't load the full post from Bluesky. Here's what the feed had.")).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Open on Bluesky" })).toHaveAttribute("href", ITEMS.sorted.url);

  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(cards(page)).toHaveCount(4);
});

test("the Clear chip keeps its accent fill, so its label stays legible", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/?tags=HCI");
    const clear = page.locator(".clear-chip").filter({ visible: true });
    await expect(clear).toHaveCount(1);
    const { bg, fg, accent } = await clear.evaluate((el) => {
      const probe = document.body.appendChild(document.createElement("i"));
      probe.style.color = "var(--accent)";
      const accent = getComputedStyle(probe).color;
      probe.remove();
      return { bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color, accent };
    });
    expect(bg).toBe(accent);
    expect(fg).not.toBe(bg);
  }
});
