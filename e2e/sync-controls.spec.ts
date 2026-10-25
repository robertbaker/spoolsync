import { expect, test } from "@playwright/test";

test("sync filters, bulk choices, leave-as-is and reset retain their behavior", async ({
  page,
}) => {
  await page.goto("/load");
  await page.locator("#spoolman-file").setInputFiles({
    name: "spoolman.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        {
          id: 1,
          initial_weight: 1000,
          remaining_weight: 600,
          filament: {
            id: 1,
            name: "Black",
            material: "PLA",
            color_hex: "000000",
            vendor: { id: 1, name: "Acme" },
          },
        },
      ]),
    ),
  });
  await expect(page.getByText("Loaded 1 spool from spoolman.json")).toBeVisible();
  await page.locator("#spoolio-file").setInputFiles({
    name: "spoolio.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        filaments: [
          {
            id: "one",
            spoolmanId: 1,
            brand: "Acme",
            type: "PLA",
            colorName: "Black",
            colorHex: "#000000",
            weightTotal: 1000,
            weightRemaining: 500,
          },
        ],
      }),
    ),
  });
  await expect(page.getByText("Loaded 1 spool from spoolio.json")).toBeVisible();
  await page.goto("/sync");
  const card = page.locator("article[data-group]");
  await expect(card).toHaveCount(1);
  await expect(card.locator("[data-status-for]")).toHaveText("1 to resolve");
  await page.getByRole("button", { name: /^Open conflicts/ }).click();
  await page.getByRole("button", { name: "Take lowest remaining weight", exact: true }).click();
  await expect(page.locator("#groups")).toHaveText("Nothing here.");
  await page.getByRole("button", { name: /^All / }).click();
  await expect(card.locator("[data-status-for]")).toHaveText("Ready");
  const remaining = card.getByRole("row").filter({ hasText: "Remaining (g)" });
  await remaining.getByLabel("Leave as is").check();
  await expect(card.locator("[data-status-for]")).toHaveText("1 to resolve");
  await remaining.getByLabel("500", { exact: true }).check();
  await expect(card.locator("[data-status-for]")).toHaveText("Ready");
  await page.reload();
  await expect(card.locator("[data-status-for]")).toHaveText("Ready");
  await page.getByRole("button", { name: "Reset choices", exact: true }).click();
  await expect(card.locator("[data-status-for]")).toHaveText("1 to resolve");
});
