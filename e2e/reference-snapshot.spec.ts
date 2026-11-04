import { expect, test, type Page } from "@playwright/test";

const inventory = {
  name: "export.json",
  mimeType: "application/json",
  buffer: Buffer.from(
    JSON.stringify({
      version: 1,
      filaments: [{ id: "s1", type: "PLA", brand: "Example", colorName: "Green" }],
    }),
  ),
};

/** Loads one inventory, which is what reveals the Reference data panel. */
async function openReferencePanel(page: Page): Promise<void> {
  await page.goto("/load");
  await page.locator("#smart-file").setInputFiles([inventory]);
  await expect(page.locator("#load-bar-summary")).toContainText("1 spool");
  await expect(page.locator("#reference-panel")).toBeVisible();
  await page.locator("#reference-details > summary").click();
}

/** A snapshot file as `tools/reference-snapshot.ts` writes it, with one synthetic record. */
function snapshotBody(generatedAt: number, token: string): string {
  const columns = [
    "id",
    "vendor",
    "name",
    "material",
    "colorName",
    "colorHexes",
    "diameter",
    "density",
    "nozzleTempMin",
    "nozzleTempMax",
    "bedTempMin",
    "bedTempMax",
    "initialWeight",
    "emptySpoolWeight",
    "price",
    "barcode",
    "url",
  ];
  return JSON.stringify({
    version: 1,
    providerId: "openfilamentdatabase",
    generatedAt,
    sourceToken: token,
    source: "https://api.openfilamentdatabase.org/json/all.json",
    attribution: "Open Filament Database (openfilamentdatabase.org)",
    license: "MIT",
    skipped: 0,
    columns,
    rows: [
      [
        "s1",
        "Example",
        "PLA Matte",
        "PLA",
        "Green",
        ["00AA00"],
        1.75,
        1.24,
        190,
        220,
        0,
        60,
        1000,
        200,
        null,
        null,
        null,
      ],
    ],
  });
}

test("reference data comes from the built-in snapshot without asking the service for the catalog", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("openfilamentdatabase.org")) external.push(request.url());
  });
  await page.route("**/reference/openfilamentdatabase.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: snapshotBody(Date.now() - 60_000, "2026-11-04T02:16:41Z"),
    }),
  );

  await openReferencePanel(page);
  await page.locator("#reference-provider").selectOption("openfilamentdatabase");
  await page.locator('[data-key="fetch-openfilamentdatabase"]').click();

  await expect(page.locator("#reference-source-message")).toContainText("built into SpoolSync");
  await expect(page.locator("#reference-source-message")).toContainText("1 filament");
  expect(external).toEqual([]);

  // A reload uses the copy the browser kept, so even the snapshot is not requested again.
  await openReferencePanel(page);
  await page.locator("#reference-provider").selectOption("openfilamentdatabase");
  await page.locator('[data-key="fetch-openfilamentdatabase"]').click();
  await expect(page.locator("#reference-source-message")).toContainText("this browser kept");
  expect(external).toEqual([]);
});

test("a stale copy is checked with one small request and kept when nothing changed", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("openfilamentdatabase.org")) external.push(request.url());
  });
  await page.route("**/reference/openfilamentdatabase.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: snapshotBody(Date.now() - 3 * 24 * 3_600_000, "token-1"),
    }),
  );
  await page.route("https://api.openfilamentdatabase.org/api/v1/index.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ generated_at: "token-1" }),
    }),
  );

  await openReferencePanel(page);
  await page.locator("#reference-provider").selectOption("openfilamentdatabase");
  await page.locator('[data-key="fetch-openfilamentdatabase"]').click();

  await expect(page.locator("#reference-source-message")).toContainText("nothing has changed");
  expect(external).toEqual(["https://api.openfilamentdatabase.org/api/v1/index.json"]);
});
