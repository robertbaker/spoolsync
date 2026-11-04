import { expect, test } from "@playwright/test";

import { buildXlsx } from "../packages/spoolsync-core/src/adapters/shared/xlsx-fixture";
import { SOURCE_IDS } from "../packages/spoolsync-core/src/core/model";

const SERVICE_PANELS = SOURCE_IDS.map((id) => `details[data-panel="${id}"]`).join(", ");
const VISIBLE_SERVICE_PANELS = SOURCE_IDS.map(
  (id) => `details[data-panel="${id}"]:not([hidden])`,
).join(", ");

const spoolio = {
  name: "export.json",
  mimeType: "application/json",
  buffer: Buffer.from(
    JSON.stringify({
      version: 1,
      filaments: [{ id: "s1", type: "PLA", brand: "Example", colorName: "Green" }],
    }),
  ),
};
const spoolApp = {
  name: "Spool_Backup.json",
  mimeType: "application/json",
  buffer: Buffer.from(
    JSON.stringify({
      version: "1.6",
      backupFormat: "json",
      spools: [
        {
          id: "a1",
          brand: "Example",
          materialType: "PLA",
          colourName: "Pink",
          colourHex: "#F79FAE",
        },
      ],
    }),
  ),
};
const spoolMaster = {
  name: "SpoolMaster.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  buffer: Buffer.from(
    buildXlsx([
      {
        name: "Stock",
        rows: [
          ["Brand", "Material", "Color"],
          ["Example", "PLA", "Blue"],
        ],
      },
    ]),
  ),
};

test("one drop zone routes several files to their services and enables Continue", async ({
  page,
}) => {
  await page.goto("/load");
  const continueLink = page.locator("#continue-sync");
  await expect(continueLink).toHaveAttribute("aria-disabled", "true");

  await page.locator("#smart-file").setInputFiles([spoolio, spoolApp, spoolMaster]);
  const results = page.locator("#smart-message");
  await expect(results).toContainText("export.json → Spoolio (1 spool)");
  await expect(results).toContainText("Spool_Backup.json → Spool (1 spool)");
  await expect(results).toContainText("SpoolMaster.xlsx → SpoolMaster (1 spool)");

  await expect(page.locator("#load-bar-summary")).toContainText("3 services loaded · 3 spools");
  await expect(continueLink).toHaveAttribute("aria-disabled", "false");
  await continueLink.click();
  await expect(page).toHaveURL(/\/sync$/);
  await expect(page.getByRole("heading", { name: "Nothing loaded yet" })).toHaveCount(0);
});

test("unrecognised and ambiguous files are reported instead of guessed", async ({ page }) => {
  await page.goto("/load");
  await page.locator("#smart-file").setInputFiles({
    name: "notes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("a,b\n1,2\n"),
  });
  await expect(page.locator("#smart-message")).toContainText("notes.csv was not recognised");
  await expect(page.locator("#load-bar-summary")).toContainText("Nothing loaded yet");

  // A bare brand/material CSV matches several services' column names.
  await page.locator("#smart-file").setInputFiles({
    name: "stock.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("brand,material,remaining_grams\nExample,PLA,500\n"),
  });
  await expect(page.locator("#smart-message")).toContainText("could be from more than one service");
  await page
    .locator("#smart-message")
    .getByRole("button", { name: /3DFilamentProfiles/ })
    .click();
  await expect(page.locator("#smart-message")).toContainText(
    "stock.csv → 3DFilamentProfiles (1 spool)",
  );
});

test("services can be searched and filtered, and panels open when they report", async ({
  page,
}) => {
  await page.goto("/load");
  // Only service panels count; the Load page also has panels for cleanup, reference data and so on.
  const total = SOURCE_IDS.length;
  expect(total).toBeGreaterThanOrEqual(13);
  await expect(page.locator(SERVICE_PANELS)).toHaveCount(total);
  await expect(page.locator("#source-count")).toHaveText(`${total} of ${total} services`);

  await page.getByLabel("Find a service").fill("excel");
  await expect(page.locator(VISIBLE_SERVICE_PANELS)).toHaveCount(1);
  await expect(page.locator("#spoolmaster-panel")).toBeVisible();
  await page.getByLabel("Find a service").fill("zzzz");
  await expect(page.locator("#source-empty")).toBeVisible();
  await page.getByLabel("Find a service").fill("");

  await page.getByRole("button", { name: "Read-only" }).click();
  await expect(page.locator("#spoolstock-panel")).toBeVisible();
  await expect(page.locator('[data-panel="spoolman"]')).toBeHidden();
  await page.getByRole("button", { name: "All", exact: true }).click();

  const panel = page.locator("#spoolkeep-panel");
  await expect(panel).not.toHaveJSProperty("open", true);
  await page.locator("#spoolkeep-file").setInputFiles({
    name: "keep.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([{ id: "k", brand: "Example", family: "PLA", newQuantity: 1 }]),
    ),
  });
  await expect(panel).toHaveJSProperty("open", true);
  await page.getByRole("button", { name: "Loaded" }).click();
  await expect(page.locator(VISIBLE_SERVICE_PANELS)).toHaveCount(1);

  // Unload sits in the panel body, so using it must not collapse the panel.
  await page.getByRole("button", { name: "Unload SpoolKeep" }).click();
  await expect(panel).toHaveJSProperty("open", true);
  await expect(page.locator("#load-bar-summary")).toContainText("Nothing loaded yet");
});

test("possible matches can be answered together after a second click", async ({ page }) => {
  await page.goto("/load");
  const filaments = [1, 2, 3].map((n) => ({
    id: `s${n}`,
    type: "PLA",
    brand: "Prusa",
    colorName: `Color ${n}`,
    colorHex: `#00${n}0${n}0`,
    weightTotal: 1000,
    weightRemaining: 100 * n,
  }));
  await page.locator("#smart-file").setInputFiles([
    {
      name: "spoolio.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ version: 1, filaments })),
    },
    {
      name: "keep.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify(
          [1, 2, 3].map((n) => ({
            id: `k${n}`,
            brand: "Prusa",
            family: "PLA",
            color: `Color ${n}`,
            newQuantity: 1,
          })),
        ),
      ),
    },
  ]);
  await expect(page.locator("#load-bar-summary")).toContainText("2 services loaded");
  await page.goto("/sync");
  const confirmAll = page.getByRole("button", { name: "All 3 are the same spool" });
  await confirmAll.click();
  await expect(page.getByRole("button", { name: /Click again to confirm 3 pairs/ })).toBeVisible();
  await expect(page.locator("#suggestions article")).toHaveCount(3);
  await page.getByRole("button", { name: /Click again to confirm 3 pairs/ }).click();
  await expect(page.locator("#suggestions-section")).toBeHidden();
  await expect(page.locator("#sync-summary")).toContainText("3");
});

test("one button downloads every updated file", async ({ page }) => {
  await page.goto("/load");
  await page.locator("#smart-file").setInputFiles([
    {
      name: "spoolio.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          filaments: [{ id: "only-spoolio", type: "PETG", brand: "Alpha", colorName: "Teal" }],
        }),
      ),
    },
    {
      name: "filameter.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          regular: [
            {
              _id: "only-filameter",
              filament: "Violet",
              material: "PLA",
              brand: "Beta",
              color: "#7733AA",
              total_weight: 1000,
              used_weight: 100,
            },
          ],
        }),
      ),
    },
  ]);
  await expect(page.locator("#load-bar-summary")).toContainText("2 services loaded");
  await page.goto("/sync");
  await expect(page.locator("#download-all")).toHaveCount(0);
  await page.getByRole("button", { name: "Add all missing to Spoolio" }).click();
  await page.getByRole("button", { name: "Add all missing to FilaMeter" }).click();
  await expect(page.locator("#sync-bar")).toBeVisible();
  await expect(page.locator("#sync-bar-summary")).toHaveText("2 changes ready across 2 services");
  await page.getByRole("link", { name: "Jump to apply" }).click();
  await expect(page.locator("#sync-bar")).toBeHidden();
  await expect(page.locator("#tour-apply")).toBeInViewport();
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await page.getByRole("button", { name: "Download all 2 updated files" }).click();
  await expect.poll(() => downloads.length).toBe(2);
  expect(downloads.some((name) => /spoolio/i.test(name))).toBe(true);
  expect(downloads.some((name) => /filameter/i.test(name))).toBe(true);
});

test("a long differences list is windowed and can be searched", async ({ page }) => {
  await page.goto("/load");
  const total = 60;
  const filaments = Array.from({ length: total }, (_, index) => ({
    id: `s${index}`,
    type: "PLA",
    brand: index === 41 ? "Needle" : "Hay",
    colorName: `Color ${index}`,
  }));
  await page.locator("#spoolio-file").setInputFiles({
    name: "big.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, filaments })),
  });
  await expect(page.locator("#load-bar-summary")).toContainText("1 service loaded");
  await page.locator("#filameter-file").setInputFiles({
    name: "filameter.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        regular: [{ _id: "z1", filament: "Other", material: "PLA", brand: "Other" }],
      }),
    ),
  });
  await expect(page.locator("#load-bar-summary")).toContainText("2 services loaded");
  await page.goto("/sync");
  await expect(page.locator("#groups article")).toHaveCount(25);
  await expect(page.getByText("Showing 25 of 61 spools")).toBeVisible();
  await page.getByRole("button", { name: "Show 25 more" }).click();
  await expect(page.locator("#groups article")).toHaveCount(50);
  await page.getByRole("button", { name: "Show all 61" }).click();
  await expect(page.locator("#groups article")).toHaveCount(61);

  await page.getByLabel("Filter spools").fill("needle");
  await expect(page.locator("#groups article")).toHaveCount(1);
  await page.getByLabel("Filter spools").fill("nothing-matches");
  await expect(page.getByText('No spools matching "nothing-matches".')).toBeVisible();
});

test("slash focuses the search field and panel choices are remembered", async ({ page }) => {
  await page.goto("/load");
  await page.keyboard.press("/");
  await expect(page.getByLabel("Find a service")).toBeFocused();
  // Typing a slash into the field is not swallowed.
  await page.keyboard.type("a/b");
  await expect(page.getByLabel("Find a service")).toHaveValue("a/b");
  await page.getByLabel("Find a service").fill("");

  const spoolio = page.locator("#spoolio-panel");
  await expect(spoolio).not.toHaveJSProperty("open", true);
  await page.locator("#spoolio-panel > summary").click();
  await page.locator('[data-panel="spoolman"] > summary').click();
  // The browser reports a panel toggle asynchronously, so wait until the choice is saved.
  const saved = () => page.evaluate(() => localStorage.getItem("spoolsync:open-panels"));
  await expect.poll(saved).toBe('["spoolio"]');
  await page.reload();
  await expect(spoolio).toHaveJSProperty("open", true);
  await expect(page.locator('[data-panel="spoolman"]')).not.toHaveJSProperty("open", true);

  // A panel that opens itself to show a result is not remembered as a choice.
  await page.locator("#spoolio-panel > summary").click();
  await page.locator("#spoolkeep-file").setInputFiles({
    name: "keep.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([{ id: "k", brand: "B", family: "PLA", newQuantity: 1 }])),
  });
  await expect(page.locator("#spoolkeep-panel")).toHaveJSProperty("open", true);
  await expect.poll(saved).toBe("[]");
  await page.reload();
  await expect(page.locator("#spoolkeep-panel")).not.toHaveJSProperty("open", true);
  await expect(spoolio).not.toHaveJSProperty("open", true);
});

test("slash focuses the spool filter on the Sync page", async ({ page }) => {
  await page.goto("/load");
  await page.locator("#spoolio-file").setInputFiles({
    name: "a.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, filaments: [{ id: "a", brand: "A" }] })),
  });
  await page.locator("#filameter-file").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ regular: [{ _id: "b", filament: "B", material: "PLA" }] }),
    ),
  });
  await expect(page.locator("#load-bar-summary")).toContainText("2 services loaded");
  await page.goto("/sync");
  await page.keyboard.press("/");
  await expect(page.getByLabel("Filter spools")).toBeFocused();
});

test("saved match answers are shown and can be reset", async ({ page }) => {
  await page.goto("/load");
  await page.locator("#spoolio-file").setInputFiles({
    name: "spoolio.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        filaments: [{ id: "s1", type: "PLA", brand: "Prusa", colorName: "Blue" }],
      }),
    ),
  });
  await page.locator("#filameter-file").setInputFiles({
    name: "filameter.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        regular: [{ _id: "f1", filament: "Blue", material: "PLA", brand: "Prusa" }],
      }),
    ),
  });
  await expect(page.locator("#load-bar-summary")).toContainText("2 services loaded");
  await page.goto("/sync");
  await expect(page.locator("#match-answers")).toBeHidden();
  await page.getByRole("button", { name: "Different spools" }).click();
  await expect(page.locator("#suggestions-section")).toBeHidden();
  await expect(page.locator("#match-answers")).toContainText(
    "You have answered 1 possible match (0 same, 1 different)",
  );

  // The answer outlives the page.
  await page.reload();
  await expect(page.locator("#suggestions-section")).toBeHidden();
  await page.getByRole("button", { name: "Reset my match answers" }).click();
  await expect(page.locator("#suggestions-section")).toBeVisible();
  await expect(page.locator("#match-answers")).toBeHidden();
});

test("Unload all clears every loaded service in one step", async ({ page }) => {
  await page.goto("/load");
  await expect(page.locator("#unload-all")).toBeHidden();
  await page.locator("#smart-file").setInputFiles([
    {
      name: "a.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ version: 1, filaments: [{ id: "a", brand: "A" }] })),
    },
    {
      name: "k.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify([{ id: "k", brand: "B", family: "PLA", newQuantity: 1 }])),
    },
  ]);
  await expect(page.locator("#load-bar-summary")).toContainText("2 services loaded");
  await page.locator("#unload-all").click();
  await expect(page.locator("#load-bar")).toBeHidden();
  await expect(page.locator("#unload-all")).toBeHidden();
  await expect(page.locator("#spoolio-status")).toContainText("Not loaded");
  await page.reload();
  await expect(page.locator("#spoolkeep-status")).toContainText("Not loaded");
});

test("all loaded spools download as one spreadsheet-safe CSV", async ({ page }) => {
  await page.goto("/load");
  await expect(page.locator("#download-combined")).toBeHidden();
  await page.locator("#smart-file").setInputFiles([
    {
      name: "spoolio.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          filaments: [{ id: "a", type: "PLA", brand: "Prusa", colorName: "=SUM(1+1)" }],
        }),
      ),
    },
    {
      name: "keep.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify([{ id: "k", brand: "Café", family: "PLA", color: "Blue", newQuantity: 1 }]),
      ),
    },
  ]);
  await expect(page.locator("#load-bar-summary")).toContainText("2 services loaded");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-combined").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^spoolsync-inventory-\d{4}-\d{2}-\d{2}\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = bytes.toString("utf8");
  expect(text).toContain("service,id,vendor,material,name");
  expect(text).toContain("Café");
  expect(text).toContain("'=SUM(1+1)");
  expect(text.trim().split("\r\n")).toHaveLength(3);
});

test("services used last time are listed first on the next visit", async ({ page }) => {
  await page.goto("/load");
  const order = () =>
    page
      .locator("details[data-panel]")
      .evaluateAll((panels) => panels.map((panel) => (panel as HTMLElement).dataset["panel"]));
  expect((await order())[0]).toBe("spoolman");
  await page.locator("#spoolkeep-file").setInputFiles({
    name: "keep.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([{ id: "k", brand: "B", family: "PLA", newQuantity: 1 }])),
  });
  await expect(page.locator("#spoolkeep-status")).toContainText("1 loaded");
  await page.locator("#spoolmaster-file").setInputFiles({
    name: "none.xlsx",
    mimeType: "application/vnd.ms-excel",
    buffer: Buffer.from("not a workbook"),
  });
  await page.reload();
  // Only successful loads count, newest first.
  expect((await order()).slice(0, 2)).toEqual(["spoolkeep", "spoolman"]);
});

test("sample data lets a first-time visitor try matching, and never replaces real data", async ({
  page,
}) => {
  await page.goto("/sync");
  await page.getByRole("button", { name: "Try sample data" }).click();
  await expect(page.locator("#suggestions article")).toHaveCount(3);
  await expect(page.locator("#sync-summary")).toContainText("8");

  await page.goto("/load");
  await expect(page.locator("#load-bar-summary")).toContainText("2 services loaded");
  await expect(page.locator("#sample-prompt")).toBeHidden();
  await page.locator("#unload-all").click();
  await expect(page.locator("#sample-prompt")).toBeVisible();
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  await expect(page.locator("#smart-message")).toContainText("Sample data loaded");
  await expect(page.locator("#load-bar-summary")).toContainText("2 services loaded");

  // With a real inventory loaded the sample is not offered on Sync either.
  await page.locator("#unload-all").click();
  await page.locator("#spoolio-file").setInputFiles({
    name: "real.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, filaments: [{ id: "r", brand: "Real" }] })),
  });
  await expect(page.locator("#sample-prompt")).toBeHidden();
  await page.goto("/sync");
  await expect(page.getByRole("button", { name: "Try sample data" })).toBeHidden();
});

test("each dropped file shows a short preview of what it contained", async ({ page }) => {
  await page.goto("/load");
  const filaments = Array.from({ length: 7 }, (_, index) => ({
    id: `s${index}`,
    type: "PLA",
    brand: "Prusa",
    colorName: `Color ${index}`,
    colorHex: "#2244CC",
    weightTotal: 1000,
    weightRemaining: 500,
  }));
  await page.locator("#smart-file").setInputFiles({
    name: "spoolio.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, filaments })),
  });
  const preview = page.locator("#smart-message details:not([data-import-report])");
  await expect(preview).toContainText("Preview");
  await expect(preview).not.toHaveJSProperty("open", true);
  await preview.locator("summary").click();
  await expect(preview.locator("li")).toHaveCount(5);
  await expect(preview).toContainText("Prusa PLA Color 0");
  await expect(preview).toContainText("500 g left");
  await expect(preview).toContainText("and 2 more");
});

test("a shared sample link opens the walkthrough but never replaces real data", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/sync?sample=1");
  await expect(page).toHaveURL(/\/sync$/);
  await expect(page.locator("#sample-banner")).toContainText("You are looking at sample data");
  await expect(page.locator("#suggestions article")).toHaveCount(3);

  await page.getByRole("button", { name: "Copy demo link" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/sync\?sample=1$/);

  await page.getByRole("button", { name: "Clear sample data" }).click();
  await expect(page).toHaveURL(/\/load$/);
  await expect(page.locator("#load-bar")).toBeHidden();

  // A real inventory is never replaced by a shared link.
  await page.locator("#spoolio-file").setInputFiles({
    name: "real.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, filaments: [{ id: "r", brand: "Real" }] })),
  });
  await expect(page.locator("#spoolio-status")).toContainText("1 loaded");
  await page.goto("/load?sample=1");
  await expect(page).toHaveURL(/\/load$/);
  await expect(page.locator("#spoolio-status")).toContainText("1 loaded");
  await expect(page.locator("#load-bar-summary")).toContainText("1 service loaded");
});

test("each loaded service shows its headline numbers", async ({ page }) => {
  await page.goto("/load");
  await expect(page.locator("#loaded-stats")).toBeHidden();
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  const stats = page.locator("#loaded-stats");
  await expect(stats).toBeVisible();
  const spoolio = stats.locator(":scope > div", { hasText: "Spoolio" });
  await expect(spoolio).toContainText("4 spools");
  await expect(spoolio).toContainText("3 brands · 2 materials");
  await expect(spoolio).toContainText("2,660 g remaining");
  await expect(stats.locator(":scope > div", { hasText: "FilaMeter" })).toContainText(
    "3,320 g remaining",
  );
  await page.locator("#unload-all").click();
  await expect(stats).toBeHidden();
});

test("remaining filament is charted as ranked bars with a table view", async ({ page }) => {
  await page.goto("/load");
  await expect(page.locator("#loaded-chart")).toBeHidden();
  // One service is a stat card, not a chart.
  await page.locator("#spoolio-file").setInputFiles({
    name: "one.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        filaments: [{ id: "a", type: "PLA", brand: "A", weightTotal: 1000, weightRemaining: 500 }],
      }),
    ),
  });
  await expect(page.locator("#loaded-stats")).toBeVisible();
  await expect(page.locator("#loaded-chart")).toBeHidden();

  await page.locator("#unload-all").click();
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  const chart = page.locator("#loaded-chart");
  await expect(chart).toBeVisible();
  await expect(chart).toContainText("Remaining filament by service");
  await expect(chart).toContainText("5,980 g across the loaded services");
  const bars = chart.getByRole("img");
  await expect(bars).toHaveCount(2);
  // Ranked largest first, each with a full accessible description.
  await expect(bars.first()).toHaveAccessibleName(
    "FilaMeter: 3,320 g remaining across 4 spools, 56% of the total",
  );
  await expect(bars.nth(1)).toHaveAccessibleName(
    "Spoolio: 2,660 g remaining across 4 spools, 44% of the total",
  );

  // The tooltip shows on hover and on keyboard focus.
  await bars.first().hover();
  await expect(chart.getByText("FilaMeter: 3,320 g (56%)")).toBeVisible();
  await page.locator("#download-combined").focus();
  await bars.nth(1).focus();
  await expect(chart.getByText("Spoolio: 2,660 g (44%)")).toBeVisible();

  await chart.getByText("View as table").click();
  const rows = chart.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("FilaMeter");
  await expect(rows.first()).toContainText("3,320");
  await expect(rows.first()).toContainText("56%");
});

test("the chart can group by material, counts linked spools once, and remembers its settings", async ({
  page,
}) => {
  await page.goto("/load");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  const chart = page.locator("#loaded-chart");
  await expect(chart).toContainText("Remaining filament by service");

  const byMaterial = chart.getByRole("button", { name: "By material" });
  await byMaterial.click();
  // Redrawing the chart must not drop keyboard focus.
  await expect(chart.getByRole("button", { name: "By material" })).toBeFocused();
  await expect(chart).toContainText("Remaining filament by material");
  await expect(chart).toContainText("5,980 g in total");
  await expect(chart.getByRole("img").first()).toHaveAccessibleName(
    "PLA: 4,340 g remaining across 6 spools, 73% of the total",
  );
  await expect(chart.getByRole("img").nth(1)).toHaveAccessibleName(
    "PETG: 1,640 g remaining across 2 spools, 27% of the total",
  );

  // Both settings survive a reload.
  await chart.getByText("View as table").click();
  // The browser reports the toggle asynchronously, so wait until it has been saved.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("spoolsync:chart-table-open")))
    .toBe("1");
  await page.reload();
  await expect(chart).toContainText("Remaining filament by material");
  await expect(chart.locator("details")).toHaveJSProperty("open", true);

  // Linking the sample pairs on Sync means each linked spool is one spool, not two.
  await page.goto("/sync");
  await page.getByRole("button", { name: "All 3 are the same spool" }).click();
  await page.getByRole("button", { name: /Click again to confirm 3 pairs/ }).click();
  await page.goto("/load");
  await expect(chart).toContainText("3,660 g in total");
  await expect(chart).toContainText("3 linked spools counted once");
  await expect(chart.getByRole("img").first()).toHaveAccessibleName(
    "PLA: 2,840 g remaining across 4 spools, 78% of the total",
  );
});

test("the chart can group by brand and also appears on Sync", async ({ page }) => {
  await page.goto("/load");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  const chart = page.locator("#loaded-chart");
  await chart.getByRole("button", { name: "By brand" }).click();
  await expect(chart).toContainText("Remaining filament by brand");
  await expect(chart.getByRole("img").first()).toHaveAccessibleName(
    "Prusament: 2,880 g remaining across 4 spools, 48% of the total",
  );
  await expect(chart.getByRole("img")).toHaveCount(4);
  await chart.getByText("View as table").click();
  await expect(chart.locator("thead")).toContainText("Brand");

  // The same chart, with the same remembered view, sits above the plan on Sync.
  await page.goto("/sync");
  const syncChart = page.locator("#sync-chart");
  await expect(syncChart).toBeVisible();
  await expect(syncChart).toContainText("Remaining filament by brand");
  await expect(syncChart.getByRole("img").first()).toHaveAccessibleName(/^Prusament: 2,880 g/);
});

test("chart bars stay visible in forced-colors (high contrast) mode", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/load");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  const bar = page.locator("#loaded-chart .chart-bar").first();
  await expect(bar).toBeVisible();
  const { background, page: canvas } = await bar.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    page: getComputedStyle(document.body).backgroundColor,
  }));
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
  expect(background).not.toBe(canvas);
});

test("printing the Sync page drops navigation and controls but keeps the plan", async ({
  page,
}) => {
  await page.goto("/sync?sample=1");
  await expect(page.locator("#suggestions article").first()).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#app-sidebar")).toBeHidden();
  await expect(page.locator("footer").first()).toBeHidden();
  await expect(page.getByRole("button", { name: "Same spool" }).first()).toBeHidden();
  await expect(page.locator("#sync-summary")).toBeVisible();
  await expect(page.locator("#suggestions article").first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe("rgb(255, 255, 255)");
});

test("the question-mark key and sidebar button open a shortcuts list", async ({ page }) => {
  await page.goto("/load");
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Focus the search or filter on this page");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Typing a question mark into a field is just typing.
  await page.getByLabel("Find a service").focus();
  await page.keyboard.type("what?");
  await expect(page.getByLabel("Find a service")).toHaveValue("what?");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("the plan summary can be copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/sync?sample=1");
  await page.getByRole("button", { name: "All 3 are the same spool" }).click();
  await page.getByRole("button", { name: /Click again to confirm 3 pairs/ }).click();
  await page.getByRole("button", { name: "Add all missing to Spoolio" }).click();
  await page.getByRole("button", { name: "Add all missing to FilaMeter" }).click();
  await page.locator("#copy-plan").click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.split(/\r?\n/)).toEqual([
    "SpoolSync plan: 2 changes",
    "- Spoolio: 0 updates, 1 new",
    "- FilaMeter: 0 updates, 1 new",
    "1 spool has open conflicts left as they are",
  ]);
});

const lowStockFile = {
  name: "low.json",
  mimeType: "application/json",
  buffer: Buffer.from(
    JSON.stringify({
      version: 1,
      filaments: [
        {
          id: "a",
          type: "PLA",
          brand: "Zeta",
          colorName: "Alpha",
          weightTotal: 1000,
          weightRemaining: 100,
        },
        {
          id: "b",
          type: "PLA",
          brand: "Beta",
          colorName: "Bravo",
          weightTotal: 1000,
          weightRemaining: 900,
        },
        {
          id: "c",
          type: "PETG",
          brand: "Alpha",
          colorName: "Charlie",
          weightTotal: 1000,
          weightRemaining: 150,
        },
      ],
    }),
  ),
};

test("spools that are running low are flagged and can be filtered", async ({ page }) => {
  await page.goto("/load");
  await expect(page.locator("#low-only")).toBeHidden();
  await page.locator("#spoolio-file").setInputFiles(lowStockFile);
  await expect(page.locator("#loaded-stats")).toContainText("2 running low");
  const lowButton = page.locator("#low-only");
  await expect(lowButton).toHaveText("Running low (2)");
  await expect(page.locator("#loaded-table tbody tr")).toHaveCount(3);

  await lowButton.click();
  await expect(lowButton).toHaveAttribute("aria-pressed", "true");
  const rows = page.locator("#loaded-table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Low");
  await expect(page.locator("#loaded-summary")).toContainText("Showing 2 of 3 spools");
  await lowButton.click();
  await expect(rows).toHaveCount(3);
});

test("table columns sort, announce their order, and keep keyboard focus", async ({ page }) => {
  await page.goto("/load");
  await page.locator("#spoolio-file").setInputFiles(lowStockFile);
  await expect(page.locator("#loaded-table tbody tr")).toHaveCount(3);
  const brands = async () => {
    const headers = await page.locator("#loaded-table thead th").allInnerTexts();
    const column = headers.findIndex((header) => /^brand/i.test(header.trim())) + 1;
    return page.locator(`#loaded-table tbody tr td:nth-child(${column})`).allInnerTexts();
  };
  expect(await brands()).toEqual(["Zeta", "Beta", "Alpha"]);

  await page.getByRole("button", { name: /^Brand/ }).click();
  await expect(page.getByRole("columnheader", { name: /Brand/ })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  expect(await brands()).toEqual(["Alpha", "Beta", "Zeta"]);
  await expect(page.getByRole("button", { name: /^Brand/ })).toBeFocused();

  await page.getByRole("button", { name: /^Brand/ }).click();
  expect(await brands()).toEqual(["Zeta", "Beta", "Alpha"]);
  await page.getByRole("button", { name: /^Brand/ }).click();
  await expect(page.getByRole("columnheader", { name: /Brand/ })).toHaveAttribute(
    "aria-sort",
    "none",
  );

  await page.getByRole("button", { name: /^Remaining/ }).click();
  expect(await brands()).toEqual(["Zeta", "Alpha", "Beta"]);
});

test("the chart can group by color family", async ({ page }) => {
  await page.goto("/load");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  const chart = page.locator("#loaded-chart");
  await chart.getByRole("button", { name: "By color" }).click();
  await expect(chart).toContainText("Remaining filament by color");
  await expect(chart.getByRole("img")).toHaveCount(5);
  await expect(chart.getByRole("img").first()).toHaveAccessibleName(
    "Yellow: 1,800 g remaining across 2 spools, 30% of the total",
  );
});

test("the reorder list covers low spools once each and can be copied", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/load");
  await expect(page.locator("#copy-reorder")).toBeHidden();
  await page.locator("#spoolio-file").setInputFiles(lowStockFile);
  await page.locator("#copy-reorder").click();
  await expect(page.getByText("Copied 2 spools to reorder")).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.split(/\r?\n/)).toEqual([
    "Running low (2):",
    "- Zeta PLA Alpha: 100 g left (10%)",
    "- Alpha PETG Charlie: 150 g left (15%)",
  ]);
});

test("the low-stock threshold can be changed, and is remembered", async ({ page }) => {
  await page.goto("/load");
  await expect(page.locator("#low-threshold-wrap")).toBeHidden();
  const filaments = [100, 150, 250, 900].map((remaining, index) => ({
    id: `s${index}`,
    type: "PLA",
    brand: "B",
    colorName: `C${index}`,
    weightTotal: 1000,
    weightRemaining: remaining,
  }));
  await page.locator("#spoolio-file").setInputFiles({
    name: "thr.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, filaments })),
  });
  const select = page.locator("#low-threshold");
  await expect(select).toHaveValue("20");
  await expect(page.locator("#low-only")).toHaveText("Running low (2)");

  await select.selectOption("10");
  await expect(page.locator("#low-only")).toHaveText("Running low (1)");
  await expect(page.locator("#loaded-stats")).toContainText("1 running low");

  await select.selectOption("30");
  await expect(page.locator("#low-only")).toHaveText("Running low (3)");
  await expect(page.locator("#loaded-stats")).toContainText("3 running low");

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("spoolsync:low-stock-percent")))
    .toBe("30");
  await page.reload();
  await expect(page.locator("#low-threshold")).toHaveValue("30");
  await expect(page.locator("#low-only")).toHaveText("Running low (3)");
});

test("the chart can group by storage location", async ({ page }) => {
  await page.goto("/load");
  const entry = (id: string, location: string, used: number) => ({
    _id: id,
    filament: id,
    material: "PLA",
    brand: "Same",
    color: "#2244CC",
    total_weight: 1000,
    used_weight: used,
    location,
  });
  await page.locator("#filameter-file").setInputFiles({
    name: "filameter.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        regular: [
          entry("a", "Shelf A", 200),
          entry("b", "Shelf A", 500),
          entry("c", "Dry box", 100),
        ],
      }),
    ),
  });
  const chart = page.locator("#loaded-chart");
  // One service of one brand, material and color: location is the only useful grouping.
  await expect(chart).toContainText("Remaining filament by location");
  await expect(chart.getByRole("button")).toHaveCount(0);
  await expect(chart.getByRole("img").first()).toHaveAccessibleName(
    "Shelf A: 1,300 g remaining across 2 spools, 59% of the total",
  );
  await expect(chart.getByRole("img").nth(1)).toHaveAccessibleName(
    "Dry box: 900 g remaining across 1 spool, 41% of the total",
  );
});

test("table sort, the low-only filter, and the service filter are remembered", async ({ page }) => {
  await page.goto("/load");
  await page.locator("#spoolio-file").setInputFiles(lowStockFile);
  await page.getByRole("button", { name: /^Brand/ }).click();
  await page.locator("#low-only").click();
  await page.getByRole("button", { name: "Read-only", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("spoolsync:prefs")))
    .toContain('"sourceFilter":"readonly"');

  await page.reload();
  await expect(page.locator("#low-only")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("columnheader", { name: /Brand/ })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  const brands = await page.locator("#loaded-table tbody tr td:nth-child(3)").allInnerTexts();
  expect(brands).toEqual(["Alpha", "Zeta"]);
  await expect(page.getByRole("button", { name: "Read-only", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator('[data-panel="spoolstock"]')).toBeVisible();
  await expect(page.locator('[data-panel="spoolman"]')).toBeHidden();
});

test("the Sync filter is remembered", async ({ page }) => {
  await page.goto("/sync?sample=1");
  await page.getByRole("button", { name: /^Open conflicts/ }).click();
  await expect(page.locator("#groups")).toContainText("Nothing here.");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("spoolsync:prefs")))
    .toContain('"syncFilter":"open"');
  await page.reload();
  await expect(page.locator("#groups")).toContainText("Nothing here.");
});

test("the last file used for a service is remembered, without its contents", async ({ page }) => {
  await page.goto("/load");
  const lastFile = page.locator("#spoolio-last-file");
  await expect(lastFile).toBeHidden();
  await page
    .locator("#spoolio-file")
    .setInputFiles({ ...lowStockFile, name: "my-spoolio-backup.json" });
  // While the service has something loaded, the badge says it all.
  await expect(lastFile).toBeHidden();
  await page.locator("#spoolio-panel").getByRole("button", { name: "Unload Spoolio" }).click();
  await expect(lastFile).toContainText("my-spoolio-backup.json");
  await expect(lastFile).toContainText("3 spools");
  await expect(lastFile).toContainText("Browsers cannot reopen files for you");

  const stored = await page.evaluate(() => localStorage.getItem("spoolsync:file-history") ?? "");
  expect(stored).toContain("my-spoolio-backup.json");
  expect(stored).not.toContain("weightRemaining");

  await page.reload();
  await page.locator("#spoolio-panel > summary").click();
  await expect(page.locator("#spoolio-last-file")).toContainText("my-spoolio-backup.json");
  await page.locator("#spoolio-last-file").getByRole("button", { name: "Forget" }).click();
  await expect(page.locator("#spoolio-last-file")).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("spoolsync:file-history"))).toBeNull();
});

test("the saved-settings dialog shows what is remembered and can forget it", async ({ page }) => {
  await page.goto("/load");
  await page.getByRole("button", { name: "Saved settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Saved in this browser" });
  // A fresh browser has saved only the version it first saw (so a later update can be announced).
  await expect(dialog).toContainText("Preferences");
  await expect(dialog).toContainText("1 entry");
  await expect(dialog).not.toContainText("File history");
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.locator("#spoolio-file").setInputFiles(lowStockFile);
  await page.locator("#low-threshold").selectOption("30");
  await page.getByRole("button", { name: "Saved settings" }).click();
  await expect(dialog).toContainText("Preferences");
  await expect(dialog).toContainText("File history");
  await expect(dialog).toContainText("Loaded inventories (this tab only)");

  await dialog.getByRole("button", { name: "Forget File history" }).click();
  await expect(dialog).not.toContainText("File history");
  await expect(dialog).toContainText("Preferences");

  // Closing after forgetting reloads the page, so nothing stale stays on screen.
  const reloaded = page.waitForEvent("load");
  await dialog.getByRole("button", { name: "Close" }).click();
  await reloaded;
  expect(await page.evaluate(() => localStorage.getItem("spoolsync:file-history"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("spoolsync:low-stock-percent"))).toBe("30");

  await page.getByRole("button", { name: "Saved settings" }).click();
  await page
    .getByRole("dialog", { name: "Saved in this browser" })
    .getByRole("button", { name: "Forget everything" })
    .click();
  await expect(page.locator("#saved-data-empty")).toBeVisible();
  const reloadedAgain = page.waitForEvent("load");
  await page
    .getByRole("dialog", { name: "Saved in this browser" })
    .getByRole("button", { name: "Close" })
    .click();
  await reloadedAgain;
  // Visiting again records the current version once more; nothing else comes back.
  expect(
    await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]),
  ).toEqual(["spoolsync:last-seen-version"]);
  await expect(page.locator("#load-bar")).toBeHidden();
});

test("settings can be exported and imported into another browser, minus credentials", async ({
  page,
  browser,
}) => {
  await page.goto("/load");
  await page.locator("#spoolio-file").setInputFiles(lowStockFile);
  await page.locator("#low-threshold").selectOption("30");
  await page.getByRole("button", { name: /^Brand/ }).click();
  await page.evaluate(() => localStorage.setItem("spoolsync:spoolman-token", "SECRET-TOKEN"));
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("spoolsync:prefs")))
    .toContain("tableSort");

  await page.getByRole("button", { name: "Saved settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Saved in this browser" });
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export settings" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^spoolsync-settings-\d{4}-\d{2}-\d{2}\.json$/);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(chunks).toString("utf8");
  expect(exported).toContain('"format": "spoolsync-settings"');
  expect(exported).toContain("spoolsync:low-stock-percent");
  expect(exported).not.toContain("SECRET-TOKEN");

  // A fresh browser profile imports it.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/load");
  await otherPage.getByRole("button", { name: "Saved settings" }).click();
  const otherDialog = otherPage.getByRole("dialog", { name: "Saved in this browser" });
  await otherDialog.getByLabel("Settings file to import").setInputFiles({
    name: "settings.json",
    mimeType: "application/json",
    buffer: Buffer.from(exported),
  });
  await expect(otherDialog.locator("#import-settings-result")).toContainText("Imported");
  const reloaded = otherPage.waitForEvent("load");
  await otherDialog.getByRole("button", { name: "Close" }).click();
  await reloaded;
  expect(await otherPage.evaluate(() => localStorage.getItem("spoolsync:low-stock-percent"))).toBe(
    "30",
  );
  expect(
    await otherPage.evaluate(() => localStorage.getItem("spoolsync:spoolman-token")),
  ).toBeNull();

  // Credentials in a hand-edited file are skipped and reported; junk is refused.
  await otherPage.getByRole("button", { name: "Saved settings" }).click();
  await otherDialog.getByLabel("Settings file to import").setInputFiles({
    name: "planted.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "spoolsync-settings",
        version: 1,
        entries: { "spoolsync:spoolman-token": "planted", "spoolsync:chart-view": "brand" },
      }),
    ),
  });
  await expect(otherDialog.locator("#import-settings-result")).toContainText(
    "Imported 1 setting; skipped 1",
  );
  await otherDialog.getByLabel("Settings file to import").setInputFiles({
    name: "junk.json",
    mimeType: "application/json",
    buffer: Buffer.from("not json at all"),
  });
  await expect(otherDialog.locator("#import-settings-result")).toContainText("not valid JSON");
  await other.close();
});

test("changes to the plan can be undone and redone from buttons and the keyboard", async ({
  page,
}) => {
  await page.goto("/sync?sample=1");
  await page.getByRole("button", { name: "All 3 are the same spool" }).click();
  await page.getByRole("button", { name: /Click again to confirm 3 pairs/ }).click();
  const undo = page.locator("#undo-choice");
  const redo = page.locator("#redo-choice");
  // Confirming the pairs was the first step in the history.
  await expect(undo).toContainText("Undo confirming 3 matches");
  await expect(redo).toBeDisabled();

  await page.getByRole("button", { name: "Add all missing to Spoolio" }).click();
  await expect(page.locator("#sync-bar-summary")).toContainText("1 change ready");
  await expect(undo).toBeEnabled();
  await expect(undo).toContainText("Undo adding all missing spools to Spoolio");

  await undo.click();
  await expect(page.locator("#sync-bar")).toBeHidden();
  await expect(page.getByText("Undid adding all missing spools to Spoolio")).toBeVisible();
  await expect(undo).toContainText("Undo confirming 3 matches");
  await expect(redo).toBeEnabled();

  await redo.click();
  await expect(page.locator("#sync-bar-summary")).toContainText("1 change ready");

  // Keyboard: Ctrl+Z undoes, Ctrl+Shift+Z redoes, and typing in a field keeps its own undo.
  await page.keyboard.press("Control+z");
  await expect(page.locator("#sync-bar")).toBeHidden();
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator("#sync-bar-summary")).toContainText("1 change ready");
  await page.getByLabel("Filter spools").focus();
  await page.keyboard.type("abc");
  await page.keyboard.press("Control+z");
  await expect(page.locator("#sync-bar-summary")).toContainText("1 change ready");

  // Individual picks are undoable too.
  await page.getByLabel("Filter spools").fill("");
  const radio = page.getByRole("radio").first();
  if (await radio.count()) {
    await radio.check();
    await expect(undo).toContainText("Undo change to");
  }
  await page.getByRole("button", { name: "Reset choices" }).click();
  await expect(undo).toContainText("Undo resetting all choices");
  await undo.click();
  // Undoing the reset brings back both the added spool and the value that was picked.
  await expect(page.locator("#sync-bar-summary")).toContainText(
    "2 changes ready across 2 services",
  );
});

test("answers to possible matches can be undone and redone", async ({ page }) => {
  await page.goto("/sync?sample=1");
  const undo = page.locator("#undo-choice");
  const redo = page.locator("#redo-choice");
  await expect(page.locator("#suggestions article")).toHaveCount(3);
  await expect(undo).toBeDisabled();

  // The exact name picks a pair's own button, not the "All 3 are the same spool" bulk one.
  await page.getByRole("button", { name: "Same spool", exact: true }).first().click();
  await expect(page.locator("#suggestions article")).toHaveCount(2);
  await expect(page.locator("#match-answers")).toContainText("1 same");
  await expect(undo).toContainText("Undo confirming a match");

  await undo.click();
  await expect(page.locator("#suggestions article")).toHaveCount(3);
  await expect(page.locator("#match-answers")).toBeHidden();
  await expect(page.getByText("Undid confirming a match")).toBeVisible();
  await expect(redo).toContainText("Redo confirming a match");

  await redo.click();
  await expect(page.locator("#suggestions article")).toHaveCount(2);

  // A bulk answer is one step, and so is resetting afterwards; Ctrl+Z walks back through both.
  await page.getByRole("button", { name: "All 2 are different" }).click();
  await page.getByRole("button", { name: /Click again to reject 2 pairs/ }).click();
  await expect(page.locator("#suggestions-section")).toBeHidden();
  await page.getByRole("button", { name: "Reset my match answers" }).click();
  await expect(page.locator("#suggestions article")).toHaveCount(3);

  await page.keyboard.press("Control+z");
  await expect(page.locator("#suggestions-section")).toBeHidden();
  await expect(page.locator("#match-answers")).toContainText("2 different");
  await page.keyboard.press("Control+z");
  await expect(page.locator("#suggestions article")).toHaveCount(2);
  await expect(page.locator("#match-answers")).toContainText("1 same");

  // The saved answers follow, so a reload keeps whatever the history left in place.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("spoolsync:match-decisions")))
    .toContain('"confirmed":["');
  await page.reload();
  await expect(page.locator("#suggestions article")).toHaveCount(2);
});

test("the sticky bar counts unanswered matches and jumps to them", async ({ page }) => {
  await page.goto("/sync?sample=1");
  await expect(page.locator("#suggestions article")).toHaveCount(3);
  const bar = page.locator("#sync-bar");
  const summary = page.locator("#sync-bar-summary");

  await page.locator("#tour-apply").scrollIntoViewIfNeeded();
  await expect(bar).toBeVisible();
  await expect(summary).toContainText("Pending matches (3)");
  await page.getByRole("link", { name: "Review matches" }).click();
  await expect(page.locator("#suggestions-section")).toBeInViewport();

  await page.getByRole("button", { name: "Same spool", exact: true }).first().click();
  await page.locator("#tour-apply").scrollIntoViewIfNeeded();
  await expect(summary).toContainText("Pending matches (2)");
});

test("answering a possible match keeps keyboard focus in the list", async ({ page }) => {
  await page.goto("/sync?sample=1");
  await expect(page.locator("#suggestions article")).toHaveCount(3);
  await page
    .locator("#suggestions article")
    .first()
    .getByRole("button", { name: "Same spool" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#suggestions article")).toHaveCount(2);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest("#suggestions") !== null))
    .toBe(true);
});
