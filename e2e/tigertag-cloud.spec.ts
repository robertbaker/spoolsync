import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { decodeFields, encodeValue } from "../packages/spoolsync-core/src/adapters/tigertag/cloud";

const spoolstockCsv = fileURLToPath(
  new URL(
    "../packages/spoolsync-core/src/adapters/spoolstock/fixtures/export.csv",
    import.meta.url,
  ),
);

/** Google sign-in and a one-document Firestore inventory, served through request interception. */
async function routeGoogle(page: Page) {
  const doc = {
    uid: "04AA",
    id_type: 142,
    id_brand: 15962,
    id_material: 38219,
    color_r: 0,
    color_g: 0,
    color_b: 0,
    color_a: 255,
    color_name: "Black",
    measure_gr: 1000,
    weight_available: 870,
    data1: 56,
  };
  const writes: Array<{ url: string; fields: Record<string, unknown> }> = [];
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  };
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
  await page.route("https://firestore.googleapis.com/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (request.method() === "PATCH") {
      writes.push({
        url: request.url(),
        fields: decodeFields(JSON.parse(request.postData()!).fields),
      });
      return route.fulfill({ headers: cors, json: {} });
    }
    const fields = (encodeValue(doc) as { mapValue: { fields: unknown } }).mapValue.fields;
    return route.fulfill({
      headers: cors,
      json: {
        documents: [
          { name: "projects/p/databases/(default)/documents/users/u1/inventory/docA", fields },
        ],
      },
    });
  });
  return writes;
}

test("sign in to TigerTag, fetch the cloud inventory and apply a change", async ({ page }) => {
  const writes = await routeGoogle(page);

  await page.goto("/connections");
  await page.locator("#tigertag-email-input").fill("me@example.com");
  await page.locator("#tigertag-password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Signed in as me@example.com")).toBeVisible();

  await page.goto("/load");
  await page.getByRole("button", { name: "Fetch from TigerTag cloud" }).click();
  await expect(page.getByText("Loaded 1 spool from TigerTag")).toBeVisible();
  await page.locator("#spoolstock-file").setInputFiles(spoolstockCsv);
  await expect(page.getByText("Loaded 2 spools from export.csv")).toBeVisible();

  await page.goto("/sync");
  await page.getByRole("button", { name: "Same spool" }).first().click();
  const card = page
    .locator("article", { has: page.getByText("TigerTag 04AA") })
    .filter({ has: page.getByText("Spoolstock 410e5312") });
  await card.getByRole("radio", { name: "875" }).check();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: /^Apply \d+ changes? to TigerTag$/ }).click();
  await expect(page.getByText(/^\d+ applied$/)).toBeVisible();
  expect(writes[0]?.url).toContain("/users/u1/inventory/docA");
  expect(writes[0]?.fields).toMatchObject({ weight_available: 875 });
});
