import { expect, test } from "@playwright/test";

test("tour navigation, same-page steps, Back and Finish preserve URLs and focus", async ({
  page,
}) => {
  await page.goto("/?tour=0");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading")).toHaveText("Welcome to SpoolSync");
  await expect(dialog.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
  for (const title of [
    "Drop your exports",
    "Or connect to a service",
    "Review matches",
    "Resolve differences",
    "Apply or export",
  ]) {
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await expect(dialog.getByRole("heading")).toHaveText(title);
  }
  await expect(page).toHaveURL(/\/sync\?tour=5$/);
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(dialog.getByRole("heading")).toHaveText("Resolve differences");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await dialog.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/sync$/);
  await expect(page.getByRole("button", { name: "Take a tour", exact: true })).toBeFocused();
  await expect(page.locator(".spoolsync-tour-highlight")).toHaveCount(0);
});

test("connection password toggles and unsupported URL validation retain their behavior", async ({
  page,
}) => {
  await page.goto("/load");
  const togglePassword = async (toggle: string, input: string) => {
    await page.locator(toggle).click();
    await expect(page.locator(input)).toHaveAttribute("type", "text");
    await expect(page.locator(toggle)).toHaveAttribute("aria-label", "Hide value");
    await page.locator(toggle).click();
    await expect(page.locator(input)).toHaveAttribute("type", "password");
  };
  // One service shows at a time: Spoolman is open first, then TigerTag.
  await togglePassword("#toggle-spoolman-token", "#spoolman-token");
  await page.locator("#spoolman-url").fill("ftp://spoolman.test");
  await page.locator("#spoolman-test").click();
  await expect(page.locator("#spoolman-result")).toContainText("Check the address");
  await expect(page.locator("#spoolman-url")).toBeFocused();
  await expect(page.locator("#spoolman-test")).toBeEnabled();
  await page.locator('[data-tile="tigertag"]').click();
  await page.locator("#tigertag-settings > summary").click();
  await togglePassword("#toggle-tigertag-password", "#tigertag-password");
});

test("the tour walks the Load page through to Sync and the old Connections link redirects", async ({
  page,
}) => {
  await page.goto("/?tour=1");
  const dialog = page.getByRole("dialog");
  await expect(page).toHaveURL(/\/load\?tour=1$/);
  await expect(dialog.getByRole("heading")).toHaveText("Drop your exports");
  await expect(page.locator(".spoolsync-tour-highlight")).toHaveCount(1);
  const response = await page.request.get("/connections", { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers()["location"]).toContain("/load");
});
