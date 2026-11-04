import { expect, test } from "@playwright/test";

test.describe("Load page tools", () => {
  test("the drying guide lists moisture-prone spools with typical settings", async ({ page }) => {
    await page.goto("/load?sample=1");
    const panel = page.locator("#drying-panel");
    await expect(panel).toBeVisible();
    const summary = panel.locator("summary");
    await expect(summary).toContainText("Drying guide (");
    await summary.click();
    await expect(panel).toContainText("PETG: 65 °C for 6 h (typical)");
    // PLA rarely needs drying, so it appears only on request.
    await expect(panel.getByText("Prusament PLA")).toHaveCount(0);
    await panel.getByLabel("Also show materials that rarely need drying").check();
    await expect(panel).toContainText("PLA: 45 °C for 4 h (typical)");
  });

  test("pressing Enter on a scanned label code opens that spool", async ({ page }) => {
    await page.goto("/load?sample=1");
    const filter = page.getByRole("searchbox", { name: "Filter loaded spools" });
    await filter.fill("spoolio:sample-spoolio-1");
    await filter.press("Enter");
    const drawer = page.locator("dialog[open]");
    await expect(drawer).toBeVisible();
    await expect(page.locator("#spool-drawer-title")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    // The filter box is left empty for the next scan.
    await expect(filter).toHaveValue("");

    // A code for a spool that is not loaded says so instead of filtering to nothing.
    await filter.fill("spoolio:99999");
    await filter.press("Enter");
    await expect(page.getByText("No loaded spool has the code spoolio:99999")).toBeVisible();

    // Ordinary text is still a filter.
    await filter.fill("PETG");
    await filter.press("Enter");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });

  test("the label dialog explains how to find a spool from its label", async ({ page }) => {
    await page.goto("/load?sample=1");
    await page
      .getByRole("button", { name: /Print labels/ })
      .first()
      .click();
    await expect(page.locator("#labels-dialog")).toContainText("filter box and press Enter");
  });
});
