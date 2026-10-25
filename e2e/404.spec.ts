import { test, expect } from "@playwright/test";

test.describe("404 Page", () => {
  test("shows 404 for non-existent page", async ({ page }) => {
    await page.goto("/this-page-does-not-exist", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText(/404|Not Found|Page Not Found/i);
  });

  test("has a link back to home", async ({ page }) => {
    await page.goto("/this-page-does-not-exist", { waitUntil: "domcontentloaded" });
    const homeLink = page
      .locator("main")
      .getByRole("link", { name: /Return Home|Homepage|Home/i })
      .first();
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", "/");
  });
});
