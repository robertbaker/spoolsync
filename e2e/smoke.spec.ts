import { test, expect } from "@playwright/test";

test.describe("Smoke", () => {
  for (const path of ["/", "/connections", "/load"]) {
    test(`${path} loads`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
    });
  }

  test("connections shows the CORS line for this origin", async ({ page, baseURL }) => {
    await page.goto("/connections");
    await expect(page.locator("#cors-line")).toHaveText(
      `SPOOLMAN_CORS_ORIGIN=${new URL(baseURL!).origin}`,
    );
  });

  test("load asks for a connection before fetching from Spoolman", async ({ page }) => {
    await page.goto("/load");
    await expect(page.locator("#spoolman-load")).toBeDisabled();
    await expect(page.locator("#bambuddy-fetch")).toBeDisabled();
  });
});
