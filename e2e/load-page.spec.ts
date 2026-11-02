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

  // Unloading from the summary must not collapse or toggle the panel.
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
