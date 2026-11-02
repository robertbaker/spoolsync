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
