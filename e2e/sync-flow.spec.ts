import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { createFakeSpoolman } from "../packages/spoolsync-core/src/adapters/spoolman/fake-server";

const SPOOLMAN = "http://spoolman.test:7912";
const spoolstockCsv = fileURLToPath(
  new URL(
    "../packages/spoolsync-core/src/adapters/spoolstock/fixtures/export.csv",
    import.meta.url,
  ),
);
const ttag = fileURLToPath(
  new URL("../packages/spoolsync-core/src/adapters/tigertag/fixtures/studio.ttag", import.meta.url),
);

/** Serves a fake Spoolman to the page, CORS included, through Playwright's request interception. */
async function routeSpoolman(page: import("@playwright/test").Page) {
  const anycubic = { id: 1, name: "Anycubic" };
  const black = {
    id: 10,
    name: "Black",
    material: "PLA",
    density: 1.25,
    diameter: 1.75,
    color_hex: "000000",
    vendor: anycubic,
  };
  const red = {
    id: 12,
    name: "Red",
    material: "PETG",
    density: 1.27,
    diameter: 1.75,
    color_hex: "CC0000",
    vendor: anycubic,
  };
  const fake = createFakeSpoolman({
    vendors: [anycubic],
    filaments: [black, red],
    spools: [
      {
        id: 51,
        filament: black,
        lot_nr: "spoolstock:spool:410e5312",
        initial_weight: 1000,
        remaining_weight: 860,
        location: "Shelf A",
        archived: false,
        extra: {},
      },
      {
        id: 53,
        filament: red,
        initial_weight: 1000,
        remaining_weight: 420,
        archived: false,
        extra: {},
      },
    ],
  });
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  };
  await page.route(`${SPOOLMAN}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/info")
      return route.fulfill({ json: { version: "0.23.1" }, headers: cors });
    const response = await fake.fetchImpl(request.url(), {
      method: request.method(),
      body: request.postData() ?? undefined,
    });
    return route.fulfill({
      status: response.status,
      body: await response.text(),
      headers: { ...cors, "content-type": "application/json" },
    });
  });
  return fake;
}

test("connect, load, resolve, apply to Spoolman and show Spoolstock as read-only", async ({
  page,
}) => {
  const fake = await routeSpoolman(page);

  await page.goto("/connections");
  await page.getByLabel("Spoolman address").fill(SPOOLMAN);
  await page.getByRole("button", { name: "Save and test" }).click();
  await expect(page.getByText("Connected to Spoolman 0.23.1")).toBeVisible();

  await page.goto("/load");
  await page.locator("#spoolman-load").click();
  await expect(page.getByText(`Loaded 2 spools from ${SPOOLMAN}`)).toBeVisible();
  await page.locator("#spoolstock-file").setInputFiles(spoolstockCsv);
  await expect(page.getByText("Loaded 2 spools from export.csv")).toBeVisible();
  await page.locator("#tigertag-file").setInputFiles(ttag);
  await expect(page.getByText("Loaded 2 spools from studio.ttag")).toBeVisible();

  await page.goto("/sync");
  const black = page
    .locator("article", { has: page.getByRole("heading", { name: /Anycubic PLA Black/ }) })
    .filter({ has: page.getByText("Spoolstock 410e5312") });
  await expect(black.getByText("1 to resolve")).toBeVisible();
  await black.getByRole("radio", { name: "875" }).check();
  await expect(black.getByText("Ready")).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: /^Apply \d+ changes? to Spoolman$/ }).click();
  await expect(page.getByText(/^\d+ applied$/)).toBeVisible();
  expect(fake.spools.get(51)).toMatchObject({ remaining_weight: 875 });
  await expect(page.getByText("Spoolstock is read-only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download Spoolstock CSV" })).toHaveCount(0);
});

test("sync asks for two sources", async ({ page }) => {
  await page.goto("/sync");
  await expect(page.getByText("Nothing loaded yet")).toBeVisible();
});
