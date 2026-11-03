import { expect, test } from "@playwright/test";

test.describe("Inventory navigation", () => {
  test("one Inventory link replaces Load and Sync and stays current on both pages", async ({
    page,
  }) => {
    await page.goto("/load");
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "Load", exact: true })).toHaveCount(0);
    await expect(header.getByRole("link", { name: "Sync", exact: true })).toHaveCount(0);
    const inventory = header.getByRole("link", { name: "Inventory", exact: true }).first();
    await expect(inventory).toHaveAttribute("aria-current", "page");

    await page.goto("/sync");
    await expect(inventory).toHaveAttribute("aria-current", "page");

    await page.goto("/cli");
    await expect(inventory).not.toHaveAttribute("aria-current", "page");
  });

  test("the workflow stepper tracks loaded inventories and links between the steps", async ({
    page,
  }) => {
    await page.goto("/load");
    const stepper = page.getByRole("navigation", { name: "Inventory workflow" });
    await expect(stepper.getByRole("link", { name: /Load/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(stepper).toContainText("Needs two inventories");

    await page.goto("/load?sample=1");
    await expect(stepper).toContainText("inventories loaded");
    await expect(stepper.locator('[data-step="load"]')).toHaveAttribute("data-state", "done");

    await stepper.getByRole("link", { name: /Review/ }).click();
    await expect(page).toHaveURL(/\/sync$/);
    const syncStepper = page.getByRole("navigation", { name: "Inventory workflow" });
    await expect(syncStepper.getByRole("link", { name: /Review/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await syncStepper.getByRole("link", { name: /Apply/ }).click();
    await expect(page).toHaveURL(/\/sync#tour-apply$/);
    await expect(syncStepper.locator('[data-step="apply"]')).toHaveAttribute(
      "data-state",
      "current",
    );
  });

  test("/inventory sends people to Load when nothing is loaded and Review when something is", async ({
    page,
  }) => {
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/load$/);

    await page.goto("/load?sample=1");
    await expect(page.locator("#load-bar-summary")).toContainText("services loaded");
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/sync$/);
  });
});

test.describe("Supported tools matrix", () => {
  test("lists every tool and filters by search and capability", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#supported-tools");
    const rows = section.locator("[data-matrix-row]");
    const shown = section.locator("[data-matrix-row]:not([hidden])");
    const total = await rows.count();
    expect(total).toBeGreaterThanOrEqual(13);
    await expect(section.locator("#matrix-status")).toContainText(`all ${total} tools`);

    await section.getByRole("button", { name: "Can write back" }).click();
    const writable = await shown.count();
    expect(writable).toBeLessThan(total);
    await expect(section.getByRole("button", { name: "Can write back" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(rows.filter({ hasText: "Spoolstock" }).first()).toBeHidden();

    await section.getByRole("button", { name: "All", exact: true }).click();
    await section.getByRole("searchbox", { name: "Search supported tools" }).fill("excel");
    await expect(shown).toHaveCount(1);
    await expect(shown).toContainText("SpoolMaster");

    await section.getByRole("searchbox", { name: "Search supported tools" }).fill("nothing here");
    await expect(section.locator("#matrix-empty")).toBeVisible();
  });

  test("shows each tool as a card on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/#supported-tools");
    const first = page.locator("#supported-tools [data-matrix-row]").first();
    await expect(first).toBeVisible();
    await expect(first.getByText("Write back", { exact: true })).toBeVisible();
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(scrolls).toBe(false);
  });
});
