import type { Page } from "@playwright/test";
import { expect, ITEMS, stubNetwork, test } from "./fixtures";

const card = (page: Page, title: string) => page.getByRole("main").getByRole("article").filter({ hasText: title });
const syncLine = (page: Page) => page.getByRole("main").locator(".sync-line");
const openShelf = (page: Page, name: "Favourites" | "Archive") => page.getByRole("button", { name: new RegExp(`^${name}, `) }).click();

async function startSyncing(page: Page, words: string): Promise<void> {
  await page.getByRole("button", { name: "Sync devices" }).click();
  await page.getByLabel("Your sync words").fill(words);
  await page.getByRole("button", { name: "Start syncing" }).click();
  await expect(page.getByRole("dialog", { name: "Sync your lists" })).toBeHidden();
  await expect(syncLine(page)).toHaveText(/Synced across your devices\./);
}

test("a guest's lists stay on the device until it syncs", async ({ page }) => {
  await page.goto("/");
  await card(page, ITEMS.noise.title).getByRole("button", { name: "Add to favourites" }).click();
  await openShelf(page, "Favourites");
  await expect(syncLine(page)).toHaveText(/On this device only\./);
  await expect(card(page, ITEMS.noise.title)).toBeVisible();
});

test("two devices with the same words share favourites and archive, removals included", async ({ page, browser }, testInfo) => {
  // Each run gets its own words, so runs never see each other's lists in the dev bucket.
  const words = `Sunny Sprout ${testInfo.project.name} ${Date.now()} ${Math.random()}`;

  await page.goto("/");
  await card(page, ITEMS.noise.title).getByRole("button", { name: "Add to favourites" }).click();
  await openShelf(page, "Favourites");
  await startSyncing(page, words);

  const other = await browser.newContext(testInfo.project.use);
  await stubNetwork(other);
  const laptop = await other.newPage();
  await laptop.goto("/?view=favourites");
  // Words are matched however they are typed.
  await startSyncing(laptop, `  ${words.toLowerCase()} `);
  await expect(card(laptop, ITEMS.noise.title)).toBeVisible();

  // The laptop archives a post and drops the favourite; the phone picks both up when it comes back into view.
  await laptop.getByRole("button", { name: /^Favourites, / }).click();
  await card(laptop, ITEMS.hype.title).getByRole("button", { name: "Mark as read" }).click();
  const pushed = laptop.waitForResponse((response) => response.url().includes("/sync/") && response.ok());
  await card(laptop, ITEMS.noise.title).getByRole("button", { name: "Remove from favourites" }).click();
  await pushed;

  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(card(page, ITEMS.noise.title)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive, 1 saved" })).toBeVisible();

  // Stopping keeps this device's copy, and it no longer follows the others.
  await page.getByRole("button", { name: "Sync settings" }).click();
  await expect(page.getByText(words.toLowerCase())).toBeVisible();
  await page.getByRole("button", { name: "Stop syncing on this device" }).click();
  await expect(syncLine(page)).toHaveText(/On this device only\./);
  await expect(page.getByRole("button", { name: "Archive, 1 saved" })).toBeVisible();
  await other.close();
});
