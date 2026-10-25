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
    "Connect Spoolman or TigerTag",
    "Load your inventories",
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
  await page.goto("/connections");
  for (const [toggle, input] of [
    ["#toggle-spoolman-token", "#spoolman-token"],
    ["#toggle-tigertag-password", "#tigertag-password"],
  ]) {
    await page.locator(toggle!).click();
    await expect(page.locator(input!)).toHaveAttribute("type", "text");
    await expect(page.locator(toggle!)).toHaveAttribute("aria-label", "Hide value");
    await page.locator(toggle!).click();
    await expect(page.locator(input!)).toHaveAttribute("type", "password");
  }
  await page.locator("#spoolman-url").fill("ftp://spoolman.test");
  await page.locator("#spoolman-test").click();
  await expect(page.locator("#spoolman-result")).toContainText("Check the address");
  await expect(page.locator("#spoolman-url")).toBeFocused();
  await expect(page.locator("#spoolman-test")).toBeEnabled();
});
