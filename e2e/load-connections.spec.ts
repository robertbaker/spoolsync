import { expect, test } from "@playwright/test";

import { createFakeSpoolman } from "../packages/spoolsync-core/src/adapters/spoolman/fake-server";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};

test("Spoolman connection can be set up and cleared without leaving the Load page", async ({
  page,
}) => {
  await page.goto("/load");
  await expect(page.locator("#spoolman-load")).toBeDisabled();
  await expect(page.locator("#spoolman-target")).toHaveText("No Spoolman server configured yet.");
  // Nothing is configured yet, so the settings are already open.
  await expect(page.locator("#spoolman-url")).toBeVisible();

  await page.route("http://spoolman.test:7912/**", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({
          status: 200,
          headers: cors,
          json: route.request().url().endsWith("/api/v1/info") ? { version: "0.23.1" } : [],
        }),
  );
  await page.locator("#spoolman-url").fill("spoolman.test:7912");
  await page.getByRole("button", { name: "Save and test" }).click();
  await expect(page.locator("#spoolman-target")).toHaveText("From http://spoolman.test:7912");
  await expect(page.locator("#spoolman-load")).toBeEnabled();

  await page.getByRole("button", { name: "Forget" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Forget" }).click();
  await expect(page.locator("#spoolman-load")).toBeDisabled();
  await expect(page.locator("#spoolman-target")).toHaveText("No Spoolman server configured yet.");
});

test("changing the Spoolman address drops its fetched snapshot but keeps file inventories", async ({
  page,
}) => {
  const filament = { id: 10, name: "Black", material: "PLA", density: 1.25, diameter: 1.75 };
  const fake = createFakeSpoolman({
    filaments: [filament],
    spools: [{ id: 51, filament, initial_weight: 1000, remaining_weight: 860, extra: {} }],
  });
  await page.route(/^http:\/\/(one|two)\.test:7912\//, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (new URL(request.url()).pathname === "/api/v1/info")
      return route.fulfill({ json: { version: "0.23.1" }, headers: cors });
    const response = await fake.fetchImpl(request.url(), { method: request.method() });
    return route.fulfill({
      status: response.status,
      body: await response.text(),
      headers: { ...cors, "content-type": "application/json" },
    });
  });
  await page.goto("/load");
  await page.locator("#spoolio-file").setInputFiles({
    name: "spoolio.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, filaments: [{ id: "a", brand: "Kept" }] })),
  });
  // Loading a file opens its own panel and closes the others once it finishes. The tile toggles, so
  // clicking before that settles can close the Spoolman panel that was open at the time.
  await expect(page.locator("#spoolio-status")).toContainText("1 loaded from file");
  await page.locator('[data-tile="spoolman"]').click();
  await expect(page.locator('[data-tile="spoolman"]')).toHaveAttribute("aria-expanded", "true");
  await page.locator("#spoolman-url").fill("http://one.test:7912");
  await page.getByRole("button", { name: "Save and test" }).click();
  await expect(page.getByText("Connected to Spoolman 0.23.1")).toBeVisible();
  await page.locator("#spoolman-load").click();
  await expect(page.locator("#load-bar-summary")).toContainText("2 services loaded");

  await page.locator("#spoolman-url").fill("http://two.test:7912");
  await page.getByRole("button", { name: "Save and test" }).click();
  await expect(page.locator("#spoolman-target")).toHaveText("From http://two.test:7912");
  await expect(page.locator("#spoolman-status")).toContainText("Not loaded");
  await expect(page.locator("#load-bar-summary")).toContainText("1 service loaded");
  await expect(page.locator("#spoolio-status")).toContainText("1 loaded from file");
});

test("TigerTag sign-in works from its panel and clears the password", async ({ page }) => {
  await page.route("https://identitytoolkit.googleapis.com/**", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({
          headers: cors,
          json: {
            localId: "u1",
            email: "me@example.com",
            idToken: "t0",
            refreshToken: "r0",
            expiresIn: "3600",
          },
        }),
  );
  await page.goto("/load");
  await page.locator('[data-tile="tigertag"]').click();
  await expect(page.locator("#tigertag-cloud")).toBeDisabled();
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await expect(page.locator("#tigertag-email-input")).toBeFocused();
  await page.locator("#tigertag-email-input").fill("me@example.com");
  await page.locator("#tigertag-password").fill("not-a-real-password");
  await page.locator("#tigertag-sign-in").click();
  await expect(page.locator("#tigertag-cloud-hint")).toHaveText("Signed in as me@example.com");
  await expect(page.locator("#tigertag-cloud")).toBeEnabled();
  await expect(page.locator("#tigertag-password")).toHaveValue("");

  await page.locator("#tigertag-sign-out").click();
  await expect(page.locator("#tigertag-cloud")).toBeDisabled();
});

test("connected services can be fetched automatically when the page opens", async ({ page }) => {
  const filament = { id: 10, name: "Black", material: "PLA", density: 1.25, diameter: 1.75 };
  const fake = createFakeSpoolman({
    filaments: [filament],
    spools: [{ id: 51, filament, initial_weight: 1000, remaining_weight: 860, extra: {} }],
  });
  let spoolRequests = 0;
  await page.route("http://auto.test:7912/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/info")
      return route.fulfill({ json: { version: "0.23.1" }, headers: cors });
    if (url.pathname === "/api/v1/spool") spoolRequests++;
    const response = await fake.fetchImpl(request.url(), { method: request.method() });
    return route.fulfill({
      status: response.status,
      body: await response.text(),
      headers: { ...cors, "content-type": "application/json" },
    });
  });

  await page.goto("/load");
  await expect(page.locator("#auto-fetch")).not.toBeChecked();
  await page.locator("#spoolman-url").fill("http://auto.test:7912");
  await page.getByRole("button", { name: "Save and test" }).click();
  await expect(page.getByText("Connected to Spoolman 0.23.1")).toBeVisible();

  // Without the setting, a fresh page does nothing by itself. (Testing the connection made a
  // request of its own, so compare with the count at this point.)
  const afterTest = spoolRequests;
  await page.reload();
  await expect(page.locator("#spoolman-status")).toContainText("Not loaded");
  expect(spoolRequests).toBe(afterTest);

  await page.locator("#auto-fetch").check();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("spoolsync:prefs")))
    .toContain('"autoFetch":true');
  await page.reload();
  await expect(page.locator("#auto-fetch")).toBeChecked();
  await expect(page.locator("#spoolman-status")).toContainText("1 loaded");
  expect(spoolRequests).toBeGreaterThan(afterTest);

  // An already loaded service is not fetched again on a reload.
  const before = spoolRequests;
  await page.reload();
  await expect(page.locator("#spoolman-status")).toContainText("1 loaded");
  expect(spoolRequests).toBe(before);
});
