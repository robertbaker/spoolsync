import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const spoolio = (remaining: number[], price?: number) =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      filaments: remaining.map((weightRemaining, index) => ({
        id: `s${index + 1}`,
        type: index === 0 ? "PETG" : "PLA",
        brand: index === 2 ? "Polymaker" : "Prusa",
        colorName: `Color ${index + 1}`,
        colorHex: `#00${index + 1}0${index + 1}0`,
        weightTotal: 1000,
        weightRemaining,
        ...(price === undefined ? {} : { price: price + index * 10 }),
      })),
    }),
  );
const keep = Buffer.from(
  JSON.stringify(
    [1, 2, 3].map((n) => ({
      id: `k${n}`,
      brand: "Prusa",
      family: "PLA",
      color: `Color ${n}`,
      newQuantity: 1,
    })),
  ),
);

async function loadSpoolio(page: Page, remaining: number[], price?: number) {
  await page.goto("/load");
  await page.locator("#smart-file").setInputFiles({
    name: "spoolio.json",
    mimeType: "application/json",
    buffer: spoolio(remaining, price),
  });
  await expect(page.locator("#load-bar-summary")).toContainText("1 service loaded");
}

async function violations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"])
    .analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    targets: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
  }));
}

test.describe("labels", () => {
  test("printing labels makes a sheet of the chosen spools with a QR code each", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed++;
      };
    });
    await loadSpoolio(page, [100, 500, 900], 20);
    const open = page.getByRole("button", { name: "Print labels" });
    await open.click();
    const dialog = page.getByRole("dialog", { name: "Print labels" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#label-summary")).toContainText("3 labels");
    await expect(dialog.locator(".spool-label")).toHaveCount(3);

    await dialog.getByLabel("Running low").check();
    await expect(dialog.locator("#label-summary")).toContainText("1 label,");
    await dialog.getByLabel("All loaded spools").check();
    await dialog.getByLabel("Label size").selectOption("small");
    await expect(dialog.locator("#label-summary")).toContainText("50 × 30 mm");
    // The choice is remembered for next time.
    expect(await page.evaluate(() => localStorage.getItem("spoolsync:label-options"))).toContain(
      '"preset":"small"',
    );

    await dialog.getByRole("button", { name: "Print labels" }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
    await expect(page.locator("body")).toHaveClass(/printing-labels/);
    const sheet = page.locator("#label-sheet");
    await expect(sheet.locator(".spool-label")).toHaveCount(3);
    await expect(sheet.locator('svg[aria-label="QR code for spoolio:s1"]')).toBeAttached();
    await expect(sheet.first()).toContainText("Prusa");
    await expect(sheet).toContainText("100 / 1000 g");

    // On paper, only the sheet is shown.
    await page.emulateMedia({ media: "print" });
    await expect(sheet).toBeVisible();
    await expect(page.locator("#app-sidebar")).toBeHidden();
    await expect(page.locator("#loaded-table")).toBeHidden();
    const box = await sheet.locator(".spool-label").first().boundingBox();
    expect(box?.width).toBeGreaterThan(150);

    // The browser reports the print finished; the page returns to normal.
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await expect(page.locator("body")).not.toHaveClass(/printing-labels/);
    await expect(sheet).toHaveCount(0);
  });

  test("the sheet is never shown on screen and low-stock selection only labels low spools", async ({
    page,
  }) => {
    await loadSpoolio(page, [100, 500, 900]);
    await page.getByRole("button", { name: "Print labels" }).click();
    const dialog = page.getByRole("dialog", { name: "Print labels" });
    await dialog.getByLabel("Running low").check();
    await expect(dialog.locator(".spool-label")).toHaveCount(1);
    await expect(dialog.locator(".spool-label")).toContainText("100 / 1000 g");
    await expect(page.locator("#label-sheet")).toHaveCount(0);
  });

  test("a selection with no spools disables printing", async ({ page }) => {
    await loadSpoolio(page, [800, 900]);
    await page.getByRole("button", { name: "Print labels" }).click();
    const dialog = page.getByRole("dialog", { name: "Print labels" });
    await dialog.getByLabel("Running low").check();
    await expect(dialog.locator("#label-summary")).toContainText("No spools match");
    await expect(dialog.getByRole("button", { name: "Print labels" })).toBeDisabled();
  });
});

test.describe("trend and cost charts", () => {
  test("the trend builds up across loads and can be forgotten", async ({ page }) => {
    await loadSpoolio(page, [100, 200, 300]);
    await expect(page.locator("#loaded-trend")).toContainText(
      "A trend appears after your next load",
    );
    await loadSpoolio(page, [100, 200, 100]);
    const trend = page.locator("#loaded-trend");
    await expect(trend).toContainText("Remaining filament over time");
    await expect(trend).toContainText("Down 200 g");
    await expect(
      trend.getByRole("img", { name: /Line chart of remaining filament/ }),
    ).toBeVisible();
    await trend.getByText("View trend as table").click();
    await expect(trend.locator("tbody tr")).toHaveCount(2);
    await expect(trend.locator("tbody tr").first()).toContainText("400");
    await expect(trend.locator("tbody tr").last()).toContainText("600");

    // Totals only: no names or ids reach storage.
    const stored = await page.evaluate(() => localStorage.getItem("spoolsync:stock-history"));
    expect(stored).toContain("totalGrams");
    expect(stored).not.toContain("Prusa");

    await page.getByRole("button", { name: "Saved settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Saved in this browser" });
    await expect(dialog).toContainText("Stock history");
    await dialog.getByRole("button", { name: "Forget Stock history" }).click();
    expect(await page.evaluate(() => localStorage.getItem("spoolsync:stock-history"))).toBeNull();
  });

  test("sample data does not add to the history", async ({ page }) => {
    await page.goto("/load");
    await page.getByRole("button", { name: "Try it with sample data" }).click();
    await expect(page.locator("#loaded-chart")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("spoolsync:stock-history"))).toBeNull();
    await expect(page.locator("#loaded-trend")).toBeHidden();
  });

  test("cost per kilogram is charted where prices exist, with a table", async ({ page }) => {
    await loadSpoolio(page, [100, 200, 300], 20);
    const cost = page.locator("#loaded-cost");
    await expect(cost).toContainText("Cost per kilogram by service");
    // 20 + 30 + 40 over 3 kg.
    await expect(cost.getByRole("img", { name: /Spoolio: 30\.00 per kilogram/ })).toBeVisible();
    await cost.getByRole("button", { name: "By material" }).click();
    await expect(cost).toContainText("Cost per kilogram by material");
    await expect(cost.getByRole("img")).toHaveCount(2);
    await cost.getByText("View cost as table").click();
    // PLA: spools at 30 and 40 over 2 kg; PETG: one spool at 20.
    await expect(cost.locator("tbody tr").first()).toContainText("PLA");
    await expect(cost.locator("tbody tr").first()).toContainText("35.00");
    await expect(cost.locator("tbody tr").last()).toContainText("PETG");
  });

  test("without prices the cost chart explains why it is empty", async ({ page }) => {
    await page.goto("/load");
    await page.locator("#smart-file").setInputFiles({
      name: "keep.json",
      mimeType: "application/json",
      buffer: keep,
    });
    await expect(page.locator("#load-bar-summary")).toContainText("1 service loaded");
    await expect(page.locator("#loaded-cost")).toContainText("nothing to show yet");
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility (${colorScheme})`, () => {
    test.use({ colorScheme });

    test("charts, labels dialog and install affordances have no detectable violations", async ({
      page,
    }) => {
      await loadSpoolio(page, [100, 200, 300], 20);
      await loadSpoolio(page, [100, 200, 100], 20);
      await page.locator("#smart-file").setInputFiles({
        name: "keep.json",
        mimeType: "application/json",
        buffer: keep,
      });
      await expect(page.locator("#load-bar-summary")).toContainText("2 services loaded");
      await expect(page.locator("#loaded-trend svg")).toBeVisible();
      await expect(page.locator("#loaded-cost")).toContainText("Cost per kilogram");
      await page.locator("#loaded-trend").getByText("View trend as table").click();
      await page.locator("#loaded-cost").getByText("View cost as table").click();
      expect(await violations(page)).toEqual([]);

      await page.evaluate(() => {
        const event = new Event("beforeinstallprompt", { cancelable: true });
        Object.assign(event, { prompt: async () => undefined, userChoice: new Promise(() => {}) });
        window.dispatchEvent(event);
      });
      await expect(page.getByRole("button", { name: "Install" })).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await page.getByRole("button", { name: "Print labels" }).click();
      await expect(page.getByRole("dialog", { name: "Print labels" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}

test.describe("forced colors", () => {
  test("chart marks use system colors", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await loadSpoolio(page, [100, 200, 300], 20);
    await loadSpoolio(page, [100, 200, 100], 20);
    const stroke = await page
      .locator("#loaded-trend .chart-line")
      .evaluate((element) => getComputedStyle(element).stroke);
    expect(stroke).not.toBe("none");
    const background = await page
      .locator("#loaded-cost .chart-bar")
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(background).not.toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("install as an app", () => {
  test("links a valid manifest with installable icons", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBe("/manifest.webmanifest");
    const response = await request.get(href!);
    expect(response.ok()).toBe(true);
    expect(response.headers()["cache-control"]).toContain("no-cache");
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      name: "SpoolSync",
      display: "standalone",
      scope: "/",
      start_url: "/load",
    });
    const sizes = manifest.icons.map((icon: { sizes: string; purpose: string }) => [
      icon.sizes,
      icon.purpose,
    ]);
    expect(sizes).toContainEqual(["192x192", "any"]);
    expect(sizes).toContainEqual(["512x512", "any"]);
    expect(sizes).toContainEqual(["512x512", "maskable"]);
    for (const icon of manifest.icons) {
      const file = await request.get(icon.src);
      expect(file.ok()).toBe(true);
      expect(file.headers()["content-type"]).toContain("image/png");
    }
    expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute("href")).toBe(
      "/icons/apple-touch-icon.png",
    );
  });

  test("the Install button appears only when the browser offers installation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Install" })).toBeHidden();
    await page.evaluate(() => {
      const w = window as unknown as { prompts: number };
      w.prompts = 0;
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          w.prompts++;
        },
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      window.dispatchEvent(event);
    });
    const install = page.getByRole("button", { name: "Install" });
    await expect(install).toBeVisible();
    await install.click();
    await expect(install).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { prompts: number }).prompts)).toBe(1);
  });

  test("the service worker saves the app shell and keeps it working offline", async ({
    page,
    context,
  }) => {
    await page.goto("/load");
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.state;
    });
    // Precaching happens during install; wait for the versioned cache to hold the pages.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const names = (await caches.keys()).filter((name) => name.startsWith("spoolsync-"));
          if (names.length !== 1) return [];
          const cache = await caches.open(names[0]!);
          return (await cache.keys()).map((request) => new URL(request.url).pathname);
        }),
      )
      .toEqual(expect.arrayContaining(["/", "/load", "/sync", "/offline", "/favicon.svg"]));
    // The worker controls this page after it claims it.
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    // Cross-origin requests are never saved.
    await page.route("https://raw.githubusercontent.com/**", (route) =>
      route.fulfill({
        status: 200,
        headers: { "access-control-allow-origin": "*" },
        body: "## changelog",
      }),
    );
    await page.evaluate(() => fetch("https://raw.githubusercontent.com/x/y/main/CHANGELOG.md"));
    const origins = await page.evaluate(async () => {
      const found = new Set<string>();
      for (const name of await caches.keys())
        for (const request of await (await caches.open(name)).keys())
          found.add(new URL(request.url).origin);
      return [...found];
    });
    expect(origins).toEqual([new URL(page.url()).origin]);

    await context.setOffline(true);
    // Going offline fires the browser's event, which shows the indicator.
    await expect(page.locator("#offline-indicator")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Load inventories");
    // A page that was never visited shows the offline page rather than a browser error.
    await page.goto("/resources/never-visited-page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("You are offline");
    await context.setOffline(false);
  });
});
