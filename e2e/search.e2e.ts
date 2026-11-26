import type { Page } from "@playwright/test";
import { expect, ITEMS, test } from "./fixtures";

const cards = (page: Page) => page.getByRole("main").getByRole("article");
const titles = (page: Page) => page.getByRole("main").locator(".card").getByRole("heading", { level: 2 }).allInnerTexts();
const box = (page: Page) => page.getByRole("searchbox", { name: "Search the feed" });
// On phones the box hides behind the bar's search button; on desktop it heads the rail.
const search = async (page: Page, isMobile: boolean, text: string) => {
  if (isMobile) await page.getByRole("button", { name: "Search the feed" }).click();
  await box(page).fill(text);
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(cards(page)).toHaveCount(4);
});

test("a search looks through every year, newest first, and marks what it found", async ({ page, isMobile }) => {
  await search(page, isMobile, "pro");
  await expect(page).toHaveURL(/\?q=pro$/);
  await expect(page.getByRole("heading", { name: /^1 post for .?pro.?$/ })).toBeVisible();
  expect(await titles(page)).toEqual([ITEMS.paper.title]);
  await expect(page.getByRole("main").locator("mark")).toHaveText("pro");
  await expect(page.getByText("That's every match")).toBeVisible();
  // Neither New nor Anytime applies while searching.
  await expect(page.getByRole("button", { name: "New", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("a search sits on top of a tag filter and can widen to everything", async ({ page, isMobile }) => {
  await page.goto("/?tags=Creative%20Coding&q=paper");
  await expect(page.getByText("Nothing for “paper”")).toBeVisible();
  await page.getByRole("button", { name: "Search everything" }).click();
  await expect(page).toHaveURL(/\?q=paper$/);
  await expect(cards(page)).toHaveCount(1);
  expect(await titles(page)).toEqual([ITEMS.paper.title]);
  await expect(box(page)).toHaveValue("paper");
  if (isMobile) await expect(page.getByRole("button", { name: "Search the feed" })).toBeHidden();
});

test("a search finds posts marked read, and No AI still hides its topic", async ({ page, isMobile }) => {
  await page.getByRole("article").filter({ hasText: ITEMS.noise.title }).getByRole("button", { name: "Mark as watched" }).click();
  await expect(cards(page)).toHaveCount(3);
  await search(page, isMobile, "noise");
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole("main").locator(".state")).toHaveText("Watched");

  await page.evaluate(() => localStorage.setItem("hide", '["ai"]'));
  await page.goto("/?q=hype");
  await expect(page.getByText("Nothing for “hype”")).toBeVisible();
  await expect(page.getByText("1 post hidden by No AI.")).toBeVisible();
});

test("Esc clears the search, and Back leaves it in one step", async ({ page, isMobile }) => {
  await search(page, isMobile, "sorted");
  await expect(cards(page)).toHaveCount(1);
  await box(page).press("Escape");
  await expect(page).toHaveURL(/\/$/);
  await expect(cards(page)).toHaveCount(4);

  await box(page).pressSequentially("hand", { delay: 250 });
  await expect(cards(page)).toHaveCount(1);
  await page.goBack();
  await expect(cards(page)).toHaveCount(4);
  await expect(box(page)).toHaveValue("");
});
