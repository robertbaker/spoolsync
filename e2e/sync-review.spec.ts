import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** The sample walkthrough has three possible matches between Spoolio and FilaMeter. */
async function openSample(page: Page) {
  await page.goto("/sync?sample=1");
  await expect(page.locator("#suggestions article")).toHaveCount(3);
}

async function violations(page: Page, scope?: string) {
  const builder = new AxeBuilder({ page });
  if (scope) builder.include(scope);
  const results = await builder
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"])
    .analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    targets: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
  }));
}

const heading = (page: Page) => page.locator("#review-heading");

test.describe("match review queue", () => {
  test("steps through pairs from the keyboard, keeps skipped ones pending and undoes", async ({
    page,
  }) => {
    await openSample(page);
    await page.getByRole("button", { name: "Review one at a time" }).click();
    await expect(heading(page)).toContainText("Match 1 of 3");
    await expect(heading(page)).toBeFocused();
    await expect(page.locator("#suggestions article")).toHaveCount(1);
    await expect(page.locator("#review-live")).toContainText("Match 1 of 3");

    // N keeps the pair pending and moves on.
    await page.keyboard.press("n");
    await expect(heading(page)).toContainText("Match 2 of 3");
    await expect(heading(page)).toContainText("1 skipped");
    await expect(page.locator("#sync-bar-summary")).toContainText("Pending matches (3)");

    await page.keyboard.press("s");
    await expect(heading(page)).toContainText("Match 3 of 3");
    await expect(page.locator("#review-live")).toContainText("Match 3 of 3");
    await expect(page.locator("#match-answers")).toContainText("1 same");

    // Z undoes the answer through the session history and returns to that pair.
    await page.keyboard.press("z");
    await expect(heading(page)).toContainText("Match 2 of 3");
    await expect(page.locator("#match-answers")).toBeHidden();

    await page.keyboard.press("d");
    await expect(heading(page)).toContainText("Match 3 of 3");
    await page.keyboard.press("d");
    // Only the skipped pair is left.
    await expect(heading(page)).toContainText("No matches left to look at");
    await expect(page.locator("#sync-bar-summary")).toContainText("Pending matches (1)");
    await page.getByRole("button", { name: "Review skipped again" }).click();
    await expect(heading(page)).toContainText("Match 1 of 3");

    await page.keyboard.press("s");
    await expect(page.locator("#suggestions-section")).toBeHidden();
    await expect(page.locator("#review-live")).toContainText("All matches reviewed");
    await expect(page.locator("#differences-heading")).toBeFocused();
  });

  test("shortcuts are ignored while typing and while the review is closed", async ({ page }) => {
    await openSample(page);
    // Not reviewing: the keys do nothing.
    await page.keyboard.press("s");
    await expect(page.locator("#suggestions article")).toHaveCount(3);

    await page.getByRole("button", { name: "Review one at a time" }).click();
    await page.getByLabel("Filter spools").focus();
    await page.keyboard.type("sdnz");
    await expect(page.getByLabel("Filter spools")).toHaveValue("sdnz");
    await expect(heading(page)).toContainText("Match 1 of 3");
    await expect(page.locator("#match-answers")).toBeHidden();

    // Escape leaves the review and returns focus to its button.
    await page.getByLabel("Filter spools").blur();
    await page.keyboard.press("Escape");
    await expect(page.locator("#review-panel")).toHaveCount(0);
    await expect(page.locator("#suggestions article")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Review one at a time" })).toBeFocused();
  });

  test("the sticky bar's Review matches link starts the review, and help lists the keys", async ({
    page,
  }) => {
    await openSample(page);
    await page.getByRole("button", { name: "Review one at a time" }).click();
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.getElementById("sync-bar-review")?.click());
    await expect(heading(page)).toContainText("Match 1 of 3");
    await page.getByRole("button", { name: "Exit review" }).click();
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toContainText(
      "skip for now",
    );
  });
});

test.describe("side-by-side comparison", () => {
  test("each suggestion has a table that names the fields that differ", async ({ page }) => {
    await openSample(page);
    const tables = page.locator("#suggestions table.pair-table");
    await expect(tables).toHaveCount(3);
    const table = tables.first();
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader")).toHaveCount(4);
    for (const label of ["Brand", "Material", "Color", "Name", "Remaining (g)", "Net weight (g)"])
      await expect(table.getByRole("rowheader", { name: label })).toBeVisible();
    // Differences are stated in text, not by color alone.
    const differing = tables.locator('tr[data-differs="true"]');
    expect(await differing.count()).toBeGreaterThan(0);
    await expect(differing.first().getByRole("cell").last()).toContainText("Differs");
    await expect(tables.locator('tr[data-differs="false"]').first()).not.toContainText("Differs");
  });

  test("differing rows keep a visible mark in forced colors and print", async ({ page }) => {
    await openSample(page);
    const row = page.locator("#suggestions .pair-table tr[data-differs='true'] th").first();
    for (const media of [{ forcedColors: "active" as const }, { media: "print" as const }]) {
      await page.emulateMedia(media);
      expect(await row.evaluate((el) => getComputedStyle(el).borderInlineStartWidth)).toBe("4px");
    }
    await page.emulateMedia({ forcedColors: "none", media: "screen" });
  });
});

async function prepareApply(page: Page) {
  await openSample(page);
  await page.getByRole("button", { name: "All 3 are the same spool" }).click();
  await page.getByRole("button", { name: /Click again to confirm 3 pairs/ }).click();
  await page.getByRole("button", { name: "Add all missing to Spoolio" }).click();
  await expect(page.locator("#sync-bar-summary")).toContainText("1 change ready");
}

test.describe("plan preview", () => {
  test("lists what will be written, excludes one change undoably and honors it in downloads", async ({
    page,
  }) => {
    await prepareApply(page);
    const preview = page.locator('details[data-preview="spoolio"]');
    await expect(preview).toBeVisible();
    await expect(preview.locator("summary")).toContainText("(1 of 1 included)");
    await preview.locator("summary").click();
    const box = preview.getByRole("checkbox").first();
    await expect(box).toBeChecked();

    const downloadCount = async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download Spoolio JSON" }).click(),
      ]);
      const text = await readFile((await download.path())!, "utf8");
      return (JSON.parse(text) as { filaments: unknown[] }).filaments.length;
    };
    const withSpool = await downloadCount();

    await box.uncheck();
    // The preview stays open, keeps focus, and the plan loses the change.
    await expect(preview).toHaveJSProperty("open", true);
    await expect(preview.getByRole("checkbox").first()).toBeFocused();
    await expect(preview.locator("summary")).toContainText("(0 of 1 included)");
    await expect(preview).toContainText("(excluded)");
    await expect(page.locator("#sync-bar")).toBeHidden();
    await expect(page.locator("#undo-choice")).toContainText("Undo excluding");
    expect(await downloadCount()).toBe(withSpool - 1);

    // Undo and redo cover exclusions, from the keyboard too.
    await page.locator("#undo-choice").click();
    await expect(page.locator("#sync-bar-summary")).toContainText("1 change ready");
    await expect(preview.getByRole("checkbox").first()).toBeChecked();
    await page.locator("#redo-choice").click();
    await expect(page.locator("#sync-bar")).toBeHidden();
    await page.keyboard.press("Control+z");
    await expect(page.locator("#sync-bar-summary")).toContainText("1 change ready");
    expect(await downloadCount()).toBe(withSpool);
  });

  test("Copy as CLI command uses real options, placeholders and no secrets", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await prepareApply(page);
    await page.getByRole("button", { name: "Copy as CLI command" }).click();
    const command = await page.evaluate(() => navigator.clipboard.readText());
    expect(command).toContain("spoolsync");
    expect(command).toContain("--spoolio '<spoolio-export-file>'");
    expect(command).toContain("--filameter '<filameter-export-file>'");
    expect(command).toContain("--create-in spoolio");
    expect(command).toContain("--confirm ");
    expect(command).toContain("--output-dir '<output-dir>'");
    expect(command).not.toMatch(/token|password|http/i);
    await expect(page.locator("#cli-note")).toContainText("reproduces this plan");

    // The CLI cannot skip individual changes, so the command says it differs.
    await page.getByRole("button", { name: "Take FilaMeter's values" }).click();
    await page.locator('details[data-preview="spoolio"] summary').click();
    await page.locator('details[data-preview="spoolio"]').getByRole("checkbox").first().uncheck();
    await page.getByRole("button", { name: "Copy as CLI command" }).click();
    await expect(page.locator("#cli-note")).toContainText("cannot leave out individual changes");
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility of the review tools (${colorScheme})`, () => {
    test.use({ colorScheme });

    test("comparison tables and the review have no detectable violations", async ({ page }) => {
      await openSample(page);
      expect(await violations(page)).toEqual([]);
      await page.getByRole("button", { name: "Review one at a time" }).click();
      await expect(heading(page)).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("the plan preview has no detectable violations", async ({ page }) => {
      await prepareApply(page);
      await page.locator('details[data-preview="spoolio"] summary').click();
      await expect(
        page.locator('details[data-preview="spoolio"]').getByRole("checkbox"),
      ).toBeVisible();
      // Scoped to Apply: the checked "Add to" labels above it are existing controls.
      expect(await violations(page, "#apply")).toEqual([]);
    });
  });
}
