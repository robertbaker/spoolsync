import path from "node:path";

import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`CLI and resource page interactions remain intact on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/cli");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "SpoolSync on the command line",
    );
    const pnpm = page.getByRole("tab", { name: "pnpm", exact: true });
    await pnpm.click();
    await expect(pnpm).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#install-panel-pnpm")).toBeVisible();
    await pnpm.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "bun", exact: true })).toBeFocused();
    await expect(page.locator("#install-panel-bun")).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Filter CLI options" });
    await search.fill("--resolve");
    await expect(page.locator("[data-option-row]:visible")).toHaveCount(1);
    await search.fill("no-such-option");
    await expect(page.locator("#no-options-match")).toBeVisible();
    await search.fill("");
    await expect(page.locator("#no-options-match")).not.toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    const qaDirectory = process.env["SPOOLSYNC_QA_DIR"];
    if (qaDirectory)
      await page.screenshot({
        path: path.join(qaDirectory, `cli-${viewport.name}.png`),
        fullPage: false,
      });
    await page.goto("/resources");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("SpoolSync Resources");
    await expect(page.getByRole("navigation", { name: "Filter articles by topic" })).toBeVisible();
    const article = await page
      .locator('a[href^="/resources/"]')
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute("href"))
          .find(
            (href) =>
              href &&
              !href.includes("/tag/") &&
              !href.includes("/author/") &&
              !["/resources/", "/resources/#articles"].includes(href),
          ),
      );
    expect(article).toBeTruthy();
    await page.goto(article!);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const schema = (await page.locator('script[type="application/ld+json"]').allTextContents())
      .map((text) => JSON.parse(text))
      .find((item) => item["@type"] === "BlogPosting");
    expect(schema.headline).toBe(await page.getByRole("heading", { level: 1 }).textContent());
    expect(schema.mainEntityOfPage).toContain(new URL(page.url()).pathname.replace(/\/$/, ""));
    expect(errors).toEqual([]);
  });
}
