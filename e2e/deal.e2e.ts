import type { Page } from "@playwright/test";
import { expect, ITEMS, test } from "./fixtures";

const cards = (page: Page) => page.getByRole("main").getByRole("article");

test("Anytime deals older posts with their month, ends the stack, and New brings the week back", async ({ page }) => {
  await page.goto("/");
  await expect(cards(page)).toHaveCount(4);
  // Three new posts are too few for a hand.
  await expect(page.locator("time.dealt")).toHaveCount(0);

  await page.getByRole("button", { name: "Anytime" }).click();
  await expect(page).toHaveURL(/\?feed=anytime$/);
  await expect(page.getByRole("button", { name: "Anytime" })).toHaveAttribute("aria-pressed", "true");
  // This week stays in New; the stack is the older post, dated by month.
  await expect(cards(page)).toHaveCount(1);
  const month = new Date(ITEMS.paper.publishedAt).toLocaleString(undefined, { month: "short", year: "numeric" });
  await expect(cards(page).first().locator("time")).toHaveText(month);
  await expect(page.getByText("That's today's stack")).toBeVisible();
  await expect(page.getByText("1 pick from across the years.")).toBeVisible();
  // Nothing left to deal, so there is no way to dig further.
  await expect(page.getByRole("button", { name: "Keep digging" })).toHaveCount(0);

  await page.getByRole("button", { name: "New" }).click();
  await expect(page).not.toHaveURL(/feed=/);
  await expect(cards(page)).toHaveCount(4);
});

test("a dealt card is remembered for today, so a reload deals the same stack", async ({ page }) => {
  await page.goto("/?feed=anytime");
  await expect(cards(page)).toHaveCount(1);
  const dealt = await page.evaluate(() => JSON.parse(localStorage.getItem("library:v1") ?? "{}").dealt);
  expect(Object.keys(dealt)).toEqual([ITEMS.paper.id]);
  await page.reload();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText(ITEMS.paper.title);
});
