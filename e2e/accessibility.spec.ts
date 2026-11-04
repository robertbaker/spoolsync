import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const filaments = [1, 2, 3].map((n) => ({
  id: `s${n}`,
  type: "PLA",
  brand: "Prusa",
  colorName: `Color ${n}`,
  colorHex: `#00${n}0${n}0`,
  weightTotal: 1000,
  weightRemaining: 100 * n,
}));
const keep = [1, 2, 3].map((n) => ({
  id: `k${n}`,
  brand: "Prusa",
  family: "PLA",
  color: `Color ${n}`,
  newQuantity: 1,
}));

async function loadTwoServices(page: Page) {
  await page.goto("/load");
  await page.locator("#smart-file").setInputFiles([
    {
      name: "spoolio.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ version: 1, filaments })),
    },
    { name: "keep.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(keep)) },
  ]);
  await expect(page.locator("#load-bar-summary")).toContainText("2 services loaded");
}

/**
 * Colors are measured as painted, so a dialog still fading in reads as low contrast. Wait for
 * finite animations and transitions to finish (endless ones, such as spinners, are left running).
 */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

async function violations(page: Page) {
  await settle(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"])
    .analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    targets: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
  }));
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility (${colorScheme})`, () => {
    test.use({ colorScheme });

    test("home page has no detectable violations", async ({ page }) => {
      await page.goto("/");
      expect(await violations(page)).toEqual([]);
    });

    test("load page has no detectable violations with inventories loaded", async ({ page }) => {
      await loadTwoServices(page);
      expect(await violations(page)).toEqual([]);
    });

    test("reference data panel has no detectable violations with matches to review", async ({
      page,
    }) => {
      const columns = [
        "id",
        "vendor",
        "name",
        "material",
        "colorName",
        "colorHexes",
        "diameter",
        "density",
        "nozzleTempMin",
        "nozzleTempMax",
        "bedTempMin",
        "bedTempMax",
        "initialWeight",
        "emptySpoolWeight",
        "price",
        "barcode",
        "url",
      ];
      const row = (n: number) => [
        `r${n}`,
        "Prusa",
        "PLA",
        "PLA",
        `Color ${n}`,
        [`00${n}0${n}0`],
        1.75,
        1.24,
        190,
        220,
        0,
        60,
        1000,
        200,
        null,
        null,
        null,
      ];
      await page.route("**/reference/openfilamentdatabase.json", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            version: 1,
            providerId: "openfilamentdatabase",
            generatedAt: Date.now() - 60_000,
            sourceToken: "t",
            source: "https://api.openfilamentdatabase.org/json/all.json",
            attribution: "Open Filament Database (openfilamentdatabase.org)",
            license: "MIT",
            skipped: 0,
            columns,
            rows: [1, 2, 3].map(row),
          }),
        }),
      );
      await loadTwoServices(page);
      await page.locator("#reference-details > summary").click();
      await page.locator("#reference-provider").selectOption("openfilamentdatabase");
      await page.locator('[data-key="fetch-openfilamentdatabase"]').click();
      await expect(page.locator("#reference-source-message")).toContainText("built into SpoolSync");
      await expect(page.locator("#reference-details")).toContainText("Color 1");
      expect(await violations(page)).toEqual([]);
    });

    test("load page chart has no detectable violations in either view", async ({ page }) => {
      await page.goto("/load");
      await page.getByRole("button", { name: "Try it with sample data" }).click();
      const chart = page.locator("#loaded-chart");
      await expect(chart).toBeVisible();
      await chart.getByText("View as table").click();
      expect(await violations(page)).toEqual([]);
      await chart.getByRole("button", { name: "By material" }).click();
      await expect(chart).toContainText("by material");
      expect(await violations(page)).toEqual([]);
    });

    test("changelog dialog has no detectable violations", async ({ page }) => {
      await page.route("https://raw.githubusercontent.com/**", (route) =>
        route.fulfill({
          status: 200,
          headers: { "access-control-allow-origin": "*" },
          body: "## [0.2.0](https://github.com/robertbaker/spoolsync/compare/a...b) (2026-10-28)\n\n### Bug Fixes\n\n* **sync:** retain logs ([3aa6df2](https://github.com/robertbaker/spoolsync/commit/3aa6df2bb))\n",
        }),
      );
      await page.goto("/");
      await page.getByRole("button", { name: /show what is new/ }).click();
      await expect(page.getByRole("dialog", { name: "What's new" })).toContainText("retain logs");
      expect(await violations(page)).toEqual([]);
    });

    test("saved-settings dialog has no detectable violations", async ({ page }) => {
      await loadTwoServices(page);
      await page.getByRole("button", { name: "Saved settings" }).click();
      await expect(page.getByRole("dialog", { name: "Saved in this browser" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("sync page has no detectable violations with matches to review", async ({ page }) => {
      await loadTwoServices(page);
      await page.goto("/sync");
      await expect(page.locator("#suggestions article").first()).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
