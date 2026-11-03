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

async function violations(page: Page) {
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

    test("sync page has no detectable violations with matches to review", async ({ page }) => {
      await loadTwoServices(page);
      await page.goto("/sync");
      await expect(page.locator("#suggestions article").first()).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
