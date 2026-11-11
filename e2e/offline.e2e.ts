import { expect, test } from "./fixtures";

test("a feed that fails to load shows the napping moment and retries", async ({ page }) => {
  let failures = 1;
  await page.route("/feed.json", (route) => (failures-- > 0 ? route.fulfill({ status: 503 }) : route.fallback()));

  await page.goto("/");
  await expect(page.getByText("The feed is napping")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(4);
});
