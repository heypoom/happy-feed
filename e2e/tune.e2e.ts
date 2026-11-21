import type { Page } from "@playwright/test";
import { expect, ITEMS, stubNetwork, test } from "./fixtures";

const cards = (page: Page) => page.getByRole("main").getByRole("article");
const card = (page: Page, title: string) => cards(page).filter({ hasText: title });
const personSheet = (page: Page, name: string) => page.getByRole("dialog", { name });
const levels = (page: Page, name: string) => page.getByRole("group", { name: `How much of ${name} to show` });
const openFilters = async (page: Page, isMobile: boolean) => {
  if (isMobile) await page.locator(".filters-button").click();
};

test("pausing someone from their card takes them out of the feed, and their own page resumes them", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(cards(page)).toHaveCount(4);

  await card(page, ITEMS.hype.title).getByRole("button", { name: "Tune Ben Ortiz" }).click();
  const sheet = personSheet(page, "Ben Ortiz");
  await expect(sheet).toBeVisible();
  await expect(levels(page, "Ben Ortiz").getByRole("radio", { name: "Normal" })).toBeChecked();
  await sheet.getByRole("radio", { name: "Pause" }).click();
  // The change applies underneath while the sheet stays open to change it back.
  await expect(card(page, ITEMS.hype.title)).toHaveCount(0);
  await expect(sheet.getByText(/Out of New and Anytime until you resume/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // It stays after a reload.
  await page.reload();
  await expect(cards(page)).toHaveCount(3);
  await expect(card(page, ITEMS.hype.title)).toHaveCount(0);

  // The People list marks them, and asking for them by name shows their posts with a way back.
  await openFilters(page, isMobile);
  await page.getByRole("button", { name: "Ben Ortiz, on pause" }).click();
  await expect(page).toHaveURL(/\?people=Ben(\+|%20)Ortiz$/);
  if (isMobile) await page.getByRole("button", { name: "Close filters" }).click();
  await expect(card(page, ITEMS.hype.title)).toBeVisible();
  const head = page.locator(".person-head");
  await expect(head.getByRole("radio", { name: "Pause" })).toBeChecked();
  await head.getByRole("radio", { name: "Normal" }).click();
  await expect(head.getByRole("radio", { name: "Normal" })).toBeChecked();

  // Phones undo the filter from the active strip, desktop from the person's chip in the rail.
  if (isMobile) await page.getByRole("button", { name: "Remove Ben Ortiz" }).click();
  else await page.getByRole("button", { name: "Ben Ortiz", pressed: true }).click();
  await expect(cards(page)).toHaveCount(4);
});

test("a tuned person's card button shows their level, and Only show filters to them", async ({ page }) => {
  await page.goto("/");
  await card(page, ITEMS.noise.title).getByRole("button", { name: "Tune Ada Lim" }).click();
  await personSheet(page, "Ada Lim").getByRole("radio", { name: "More" }).click();
  await personSheet(page, "Ada Lim").getByRole("button", { name: "Only show Ada Lim" }).click();
  await expect(page).toHaveURL(/\?people=Ada(\+|%20)Lim$/);
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, ITEMS.noise.title).getByRole("button", { name: "Tune Ada Lim (More)" })).toBeVisible();
  await expect(levels(page, "Ada Lim").getByRole("radio", { name: "More" })).toBeChecked();
});

test("tuning follows the sync words to another device", async ({ page, browser }, testInfo) => {
  const words = `Tuned Sprout ${testInfo.project.name} ${Date.now()} ${Math.random()}`;
  await page.goto("/?view=favourites");
  await page.getByRole("button", { name: "Sync devices" }).click();
  await page.getByLabel("Your sync words").fill(words);
  await page.getByRole("button", { name: "Start syncing" }).click();
  await expect(page.getByRole("dialog", { name: "Sync your lists" })).toBeHidden();
  await page.getByRole("button", { name: /^Favourites, / }).click();

  await card(page, ITEMS.hype.title).getByRole("button", { name: "Tune Ben Ortiz" }).click();
  const pushed = page.waitForResponse((response) => response.url().includes("/sync/") && response.ok());
  await personSheet(page, "Ben Ortiz").getByRole("radio", { name: "Pause" }).click();
  await pushed;

  const other = await browser.newContext(testInfo.project.use);
  await stubNetwork(other);
  const laptop = await other.newPage();
  await laptop.goto("/?view=favourites");
  await laptop.getByRole("button", { name: "Sync devices" }).click();
  await laptop.getByLabel("Your sync words").fill(words);
  await laptop.getByRole("button", { name: "Start syncing" }).click();
  await expect(laptop.getByRole("dialog", { name: "Sync your lists" })).toBeHidden();
  await laptop.goto("/");
  await expect(cards(laptop)).toHaveCount(3);
  await expect(card(laptop, ITEMS.hype.title)).toHaveCount(0);
  await other.close();
});
