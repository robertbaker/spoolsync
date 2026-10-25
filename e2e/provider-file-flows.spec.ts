import { expect, test } from "@playwright/test";

const spoolioExport = JSON.stringify({
  version: 1,
  filaments: [
    {
      id: "spoolio-only",
      type: "PETG",
      brand: "Example Spoolio Brand",
      colorName: "Spoolio green",
      colorHex: "#22AA55",
      diameter: 1.75,
      weightTotal: 1000,
      weightRemaining: 700,
    },
  ],
});

test("Spoolman downloads display inherited-value warnings from saved resolutions", async ({
  page,
}) => {
  await page.goto("/load");
  await page.locator("#spoolman-file").setInputFiles({
    name: "spoolman.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([{ id: 1, price: 15, filament: { id: 1, price: 12 } }])),
  });
  await expect(page.getByText("Loaded 1 spool from spoolman.json")).toBeVisible();
  await page.locator("#tigertag-file").setInputFiles({
    name: "empty.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(page.getByText("Loaded 0 spools from empty.json")).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.setItem(
      "spoolsync:resolutions",
      JSON.stringify([["spoolman:1", { values: { price: null }, createIn: [] }]]),
    ),
  );
  await page.goto("/sync");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Spoolman JSON" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await expect(page.getByText(/cleared price will inherit 12/)).toBeVisible();
});

test("a storage quota failure cannot leave an older imported inventory available to Sync", async ({
  page,
}) => {
  await page.goto("/load");
  await page.locator("#spoolio-file").setInputFiles({
    name: "old.json",
    mimeType: "application/json",
    buffer: Buffer.from(spoolioExport),
  });
  await expect(page.getByText("Loaded 1 spool from old.json")).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "spoolsync:load:spoolio")
        throw new DOMException("Storage is full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#spoolio-file").setInputFiles({
    name: "new.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ version: 1, filaments: [{ id: "new", brand: "New inventory" }] }),
    ),
  });
  await expect(page.getByText("Loaded 1 spool from new.json")).toBeVisible();
  await expect(page.getByText("Kept on this page only")).toBeVisible();
  await expect(page.getByRole("cell", { name: "New inventory", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("spoolsync:load:spoolio"))).toBeNull();
  await page.goto("/sync");
  await expect(page.getByRole("heading", { name: "Nothing loaded yet" })).toBeVisible();
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`TigerTag downloads display format conversion warnings on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) errors.push(message.text());
    });
    await page.goto("/load");
    await expect(page).toHaveTitle(/SpoolSync/);
    await page.locator("#tigertag-file").setInputFiles({
      name: "empty-tigertag.json",
      mimeType: "application/json",
      buffer: Buffer.from("{}"),
    });
    await expect(page.getByText("Loaded 0 spools from empty-tigertag.json")).toBeVisible();
    await page.locator("#spoolio-file").setInputFiles({
      name: "three-mm.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          filaments: [
            {
              id: "three-mm",
              type: "PLA",
              brand: "Example",
              colorName: "Three millimeter spool",
              diameter: 3,
              weightTotal: 1000,
              weightRemaining: 700,
            },
          ],
        }),
      ),
    });
    await expect(page.getByText("Loaded 1 spool from three-mm.json")).toBeVisible();
    await page.goto("/sync");
    await expect(page).toHaveURL(/\/sync\/?$/);
    await page.getByRole("button", { name: "Add all missing to TigerTag" }).click();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download TigerTag .ttag" }).click();
    expect((await downloaded).suggestedFilename()).toMatch(/\.ttag$/);
    await expect(page.getByText(/diameter 3 mm was exported as 2.85 mm/)).toBeVisible();
    await expect(page.getByText(/This TigerTag file has no exportedBy account/)).toBeVisible();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
    if (process.env.SPOOLSYNC_QA_SCREENSHOT)
      await page.locator("#tour-apply").screenshot({
        path: process.env.SPOOLSYNC_QA_SCREENSHOT.replace(/\.png$/, `-${viewport.name}.png`),
      });
  });
}

const providerCases = [
  {
    source: "threeDfp",
    label: "3DFilamentProfiles",
    providerFile: {
      name: "three-dfp.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          spools: [
            {
              short_code: "three-dfp-only",
              brand: "Example 3DFP Brand",
              material: "PLA",
              color: "3DFP blue",
              rgb: "#3366CC",
              remaining_grams: 510,
            },
          ],
        }),
      ),
    },
    outputButton: "Download JSON",
    extension: ".json",
    outputCount: /Downloaded 2 3DFilamentProfiles rows/,
    outputText: '"color": "Spoolio green"',
  },
  {
    source: "bambuddy",
    label: "Bambuddy",
    providerFile: {
      name: "bambuddy.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "id,material,brand,color_name,rgba,label_weight,weight_used\n8,PLA,Example Bambuddy Brand,Bambuddy orange,#CC7722,1000,220\n",
      ),
    },
    outputButton: "Download Bambuddy CSV",
    extension: ".csv",
    outputCount: /Downloaded 1 Bambuddy rows?/,
    outputText: "Spoolio green",
  },
  {
    source: "filameter",
    label: "FilaMeter",
    providerFile: {
      name: "filameter.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          regular: [
            {
              _id: "filameter-only",
              filament: "FilaMeter violet",
              material: "PLA",
              brand: "Example FilaMeter Brand",
              color: "#7733AA",
              total_weight: 1000,
              used_weight: 430,
            },
          ],
          local: [],
        }),
      ),
    },
    outputButton: "Download JSON",
    extension: ".json",
    outputCount: /Downloaded 2 FilaMeter rows/,
    outputText: '"filament": "Spoolio green"',
  },
] as const;

for (const provider of providerCases) {
  test(`${provider.label} file import can create missing spools and download an export`, async ({
    page,
  }) => {
    await page.goto("/load");
    await page.locator(`#${provider.source}-file`).setInputFiles(provider.providerFile);
    await expect(page.getByText(`Loaded 1 spool from ${provider.providerFile.name}`)).toBeVisible();

    await page.locator("#spoolio-file").setInputFiles({
      name: "spoolio.json",
      mimeType: "application/json",
      buffer: Buffer.from(spoolioExport),
    });
    await expect(page.getByText("Loaded 1 spool from spoolio.json")).toBeVisible();

    await page.goto("/sync");
    await page.getByRole("button", { name: `Add all missing to ${provider.label}` }).click();

    const output = page.getByRole("button", { name: provider.outputButton });
    await expect(output).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await output.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`${provider.source}.*\\${provider.extension}$`, "i"),
    );
    await expect(page.getByText(provider.outputCount)).toBeVisible();

    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    let contents = "";
    for await (const chunk of stream!) contents += chunk.toString();
    expect(contents).toContain(provider.outputText);
  });
}

test("Bambuddy API fetch loads inventory from the configured server", async ({ page }) => {
  await page.route("http://bambuddy.test:8000/**", async (route) => {
    const request = route.request();
    expect(request.headers()["x-api-key"]).toBe("test-key");
    expect(new URL(request.url()).pathname).toBe("/api/v1/inventory/spools");
    expect(new URL(request.url()).searchParams.get("include_archived")).toBe("true");
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "*",
      },
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: 41,
            material: "PETG",
            brand: "Example Bambuddy Brand",
            color_name: "API yellow",
            rgba: "#EECC33",
            label_weight: 1000,
            weight_used: 125,
          },
        ],
      }),
    });
  });

  await page.goto("/load");
  await expect(page.locator("#bambuddy-logo")).toBeVisible();
  await page.getByLabel("Bambuddy server address").fill("http://bambuddy.test:8000");
  await page.getByLabel("Bambuddy API key").fill("test-key");
  await page.locator("#bambuddy-fetch").click();
  await expect(page.getByText("1 loaded from API")).toBeVisible();
  await expect(page.getByText("API yellow")).toBeVisible();
});
