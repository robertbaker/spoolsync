import { expect, test } from "@playwright/test";

// The palette, shortcuts list, saved-data dialog and changelog load on first use, and each language
// downloads on its own. These check that an early key press or click is not lost and that a saved
// language is in place for the first render.

test("a shortcut pressed before the palette code has loaded still opens it", async ({ page }) => {
  // Hold the palette chunk back so the key press certainly arrives first.
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/_astro\/palette\..*\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  release();
  await expect(page.getByRole("combobox")).toBeVisible();
});

test("? opens the shortcuts list and Escape closes it", async ({ page }) => {
  await page.goto("/cli");
  await page.keyboard.press("?");
  await expect(page.locator("#shortcuts-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#shortcuts-dialog")).toBeHidden();
});

test("the saved-data dialog opens from the sidebar", async ({ page }) => {
  await page.goto("/cli");
  await page.getByRole("button", { name: "Saved settings" }).click();
  await expect(page.locator("#saved-data-dialog")).toBeVisible();
});

test("a saved language is applied before the first render", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("spoolsync:language", "de"));
  await page.goto("/cli");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.getByRole("button", { name: "Saved settings" }).click();
  await expect(page.locator("#saved-data-dialog").getByLabel("Sprache")).toBeVisible();
});

test("choosing another language redraws an open dialog once its messages arrive", async ({
  page,
}) => {
  await page.goto("/cli");
  await page.getByRole("button", { name: "Saved settings" }).click();
  const dialog = page.locator("#saved-data-dialog");
  await dialog.getByLabel("Language").selectOption("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(dialog.getByLabel("Langue")).toBeVisible();
});
