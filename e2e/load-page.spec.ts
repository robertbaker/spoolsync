import { expect, test } from "@playwright/test";

import { buildXlsx } from "../packages/spoolsync-core/src/adapters/shared/xlsx-fixture";

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
  const panels = page.locator("details[data-panel]");
  const total = await panels.count();
  expect(total).toBeGreaterThanOrEqual(13);
  await expect(page.locator("#source-count")).toHaveText(`${total} of ${total} services`);

  await page.getByLabel("Find a service").fill("excel");
  await expect(page.locator("details[data-panel]:not([hidden])")).toHaveCount(1);
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
  await expect(page.locator("details[data-panel]:not([hidden])")).toHaveCount(1);

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
  const preview = page.locator("#smart-message details");
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
