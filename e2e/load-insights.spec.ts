import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const filament = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: "PLA",
  brand: "Prusa",
  colorName: "Galaxy Black",
  colorHex: "#111111",
  weightTotal: 1000,
  weightRemaining: 800,
  purchaseDate: "2026-01-02",
  ...overrides,
});

const file = (name: string, filaments: unknown[]) => ({
  name,
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify({ version: 1, filaments })),
});

// Two spools that look like one entered twice, one running low, and one with an impossible weight.
const first = file("spoolio.json", [
  filament("d1"),
  filament("d2", { weightRemaining: 802 }),
  filament("blue", { colorName: "Blue", colorHex: "#0000FF", weightRemaining: 300 }),
  filament("bad", {
    type: "PETG",
    colorName: "Red",
    colorHex: "#FF0000",
    weightRemaining: 1500,
    purchaseDate: "2025-05-05",
  }),
]);
// The same service later: "bad" is gone, "blue" lost 100 g, and "fresh" is new.
const second = file("spoolio.json", [
  filament("d1"),
  filament("d2", { weightRemaining: 802 }),
  filament("blue", { colorName: "Blue", colorHex: "#0000FF", weightRemaining: 200 }),
  filament("fresh", { colorName: "Green", colorHex: "#00AA00", purchaseDate: "2026-03-03" }),
]);

async function loadFirst(page: Page) {
  await page.goto("/load");
  await page.locator("#smart-file").setInputFiles([first]);
  await expect(page.locator("#load-bar-summary")).toContainText("1 service loaded");
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

test.describe("load insights", () => {
  test("reports possible duplicates with reasons and filters the table to them", async ({
    page,
  }) => {
    await loadFirst(page);
    const panel = page.locator("#insight-duplicates");
    await expect(panel.getByRole("heading", { name: "Possible duplicates" })).toBeVisible();
    await expect(panel).toContainText("1 group of likely duplicates (2 spools)");
    await expect(panel).toContainText("same purchase date (2026-01-02)");
    await expect(panel).toContainText("Nothing is merged");

    const chip = page.getByRole("button", { name: "Possible duplicates (2)" });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    const rows = page.locator("#loaded-table tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(page.locator("#loaded-summary")).toContainText("Showing 2 of 4 spools");
    await chip.click();
    await expect(rows).toHaveCount(4);
  });

  test("counts missing and impossible values and filters with one click", async ({ page }) => {
    await loadFirst(page);
    const health = page.locator("#insight-health");
    await expect(health.getByRole("heading", { name: "Inventory health" })).toBeVisible();
    const over = health.getByRole("row", { name: /Remaining exceeds full weight/ });
    await expect(over).toContainText("1");
    // The synthetic Spoolio file has no locations at all.
    await expect(health.getByRole("row", { name: /No location/ })).toContainText("4");

    await page.getByRole("button", { name: "Remaining exceeds full weight (1)" }).click();
    const rows = page.locator("#loaded-table tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("bad");
    await health.getByRole("button", { name: "Show spools with: No location" }).click();
    await expect(rows).toHaveCount(4);
    await expect(page.getByRole("button", { name: "No location (4)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("shows what changed on reload and highlights a pinned spool that lost weight", async ({
    page,
  }) => {
    await loadFirst(page);
    const changes = page.locator("#insight-changes");
    await expect(changes).toContainText("First file for this service");

    await page.getByRole("button", { name: /^Watch Prusa PLA Blue/ }).click();
    await expect(page.getByRole("button", { name: /^Watch Prusa PLA Blue/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#insight-watchlist")).toContainText("No watched spool has lost");

    await page.locator("#smart-file").setInputFiles([second]);
    await expect(changes).toContainText("1 added, 1 removed, 1 weight drop");
    await expect(changes.getByRole("table", { name: "Spoolio weight drops" })).toContainText(
      "Blue (ID blue)",
    );
    await expect(changes).toContainText("fresh");
    await expect(changes).toContainText("bad");

    const watchlist = page.locator("#insight-watchlist");
    await expect(watchlist).toContainText("1 watched spool lost weight");
    await expect(watchlist.getByRole("row", { name: /Blue/ })).toContainText("Dropped 100 g");
    const row = page.locator("#loaded-table tbody tr", { hasText: "Blue" });
    await expect(row).toContainText("Dropped 100 g");
    await expect(row).toHaveClass(/bg-warning/);

    await page.getByRole("button", { name: "Watched (1)" }).click();
    await expect(page.locator("#loaded-table tbody tr")).toHaveCount(1);
  });

  test("keeps only compact summaries, lists them under saved settings, and can forget them", async ({
    page,
  }) => {
    await loadFirst(page);
    await page.getByRole("button", { name: /^Watch Prusa PLA Blue/ }).click();
    const stored = await page.evaluate(() => ({
      snapshots: localStorage.getItem("spoolsync:inventory-snapshots"),
      watchlist: localStorage.getItem("spoolsync:watchlist"),
    }));
    expect(JSON.parse(stored.snapshots!).spoolio.spools).toContainEqual(["blue", 300, "Blue"]);
    expect(stored.snapshots).not.toContain("purchaseDate");
    expect(JSON.parse(stored.watchlist!)).toEqual(["spoolio:blue"]);

    await page.getByRole("button", { name: "Saved settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Saved in this browser" });
    await expect(dialog).toContainText("Previous inventory summaries");
    await expect(dialog).toContainText("Watchlist");
    await dialog.getByRole("button", { name: /Forget.*Previous inventory summaries/ }).click();
    expect(
      await page.evaluate(() => localStorage.getItem("spoolsync:inventory-snapshots")),
    ).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("spoolsync:watchlist"))).not.toBeNull();
  });

  test("a damaged snapshot is ignored instead of breaking the page", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "spoolsync:inventory-snapshots",
        '{"spoolio":{"savedAt":"x","spools":5}}',
      );
      localStorage.setItem("spoolsync:watchlist", "{nope");
    });
    await loadFirst(page);
    await expect(page.locator("#insight-changes")).toContainText("First file for this service");
    await expect(page.locator("#loaded-table tbody tr")).toHaveCount(4);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`accessibility (${colorScheme})`, () => {
      test.use({ colorScheme });

      test("insight panels, chips, and highlights have no detectable violations", async ({
        page,
      }) => {
        await loadFirst(page);
        await page.getByRole("button", { name: /^Watch Prusa PLA Blue/ }).click();
        await page.locator("#smart-file").setInputFiles([second]);
        await expect(page.locator("#insight-changes")).toContainText("1 weight drop");
        await expect(page.locator("#insight-watchlist")).toContainText("Dropped 100 g");
        expect(await violations(page)).toEqual([]);
        await page.getByRole("button", { name: "Possible duplicates (2)" }).click();
        expect(await violations(page)).toEqual([]);
      });
    });
  }
});
