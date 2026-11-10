import { expect, test } from "@playwright/test";

test.describe("Sidebar navigation", () => {
  test("one Inventory link stays current on Load and Sync, with its steps beneath it", async ({
    page,
  }) => {
    await page.goto("/load");
    const sidebar = page.getByRole("navigation", { name: "Main" });
    const inventory = sidebar.getByRole("link", { name: "Inventory", exact: true });
    await expect(inventory).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: "Load", exact: true })).toHaveAttribute(
      "aria-current",
      "step",
    );

    await page.goto("/sync");
    await expect(inventory).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: "Review", exact: true })).toHaveAttribute(
      "aria-current",
      "step",
    );

    await page.goto("/cli");
    await expect(inventory).not.toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: "CLI", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("the sidebar shows how many inventories are loaded", async ({ page }) => {
    await page.goto("/load?sample=1");
    await expect(page.locator("#load-bar-summary")).toContainText("services loaded");
    const sidebar = page.getByRole("navigation", { name: "Main" });
    await expect(sidebar.locator("[data-sb-loaded]")).toBeVisible();
    await expect(sidebar.locator('[data-sb-step="load"]')).toHaveAttribute("data-state", "current");
    await page.goto("/cli");
    await expect(sidebar.locator('[data-sb-step="load"]')).toHaveAttribute("data-state", "done");
  });

  test("collapse state is kept across pages and toggles with Ctrl+B", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    const collapse = page.getByRole("button", { name: "Collapse sidebar" });
    await expect(html).toHaveAttribute("data-sidebar", "expanded");
    await collapse.click();
    await expect(html).toHaveAttribute("data-sidebar", "collapsed");
    // On the desktop rail the logo is the expand control and the chevron button is hidden.
    await expect(page.getByRole("link", { name: "Expand sidebar" })).toBeVisible();
    const chevron = page.locator("[data-sb-collapse]");
    await expect(chevron).toBeHidden();
    await expect(chevron).toHaveAttribute("aria-expanded", "false");
    // Links keep their accessible names when only icons are shown.
    await expect(
      page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "CLI", exact: true }),
    ).toBeVisible();

    await page.goto("/cli");
    await expect(html).toHaveAttribute("data-sidebar", "collapsed");
    await page.keyboard.press("Control+b");
    await expect(html).toHaveAttribute("data-sidebar", "expanded");
    await page.reload();
    await expect(html).toHaveAttribute("data-sidebar", "expanded");
  });

  test("the command palette can toggle the sidebar", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").fill("toggle sidebar");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-sidebar", "collapsed");
  });

  test("the units toggle switches between grams and ounces", async ({ page }) => {
    await page.goto("/");
    const units = page.getByRole("button", { name: /^Units: grams/ });
    await units.click();
    await expect(page.getByRole("button", { name: /^Units: ounces/ })).toBeVisible();
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 800 } });

    test("a bottom bar holds the main pages and More opens the full menu as a drawer", async ({
      page,
    }) => {
      await page.goto("/cli");
      const bar = page.getByRole("navigation", { name: "Quick links" });
      await expect(bar).toBeVisible();
      await expect(bar.getByRole("link", { name: "CLI" })).toHaveAttribute("aria-current", "page");
      const drawer = page.getByRole("navigation", { name: "Main" });
      await expect(drawer).toBeHidden();

      await bar.getByRole("button", { name: "More" }).click();
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("button", { name: "Keyboard shortcuts" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();

      await bar.getByRole("button", { name: "More" }).click();
      await drawer.getByRole("button", { name: "Keyboard shortcuts" }).click();
      await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
      await expect(drawer).toBeHidden();
    });

    test("the page does not scroll sideways", async ({ page }) => {
      await page.goto("/load");
      const scrolls = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(scrolls).toBe(false);
    });
  });

  test.describe("on a tablet", () => {
    test.use({ viewport: { width: 900, height: 800 } });

    test("the rail is collapsed and expands while focused", async ({ page }) => {
      await page.goto("/");
      // Headless Linux starts the pointer at (0,0), over the sidebar, which would expand the rail.
      await page.mouse.move(800, 400);
      const sidebar = page.locator("#app-sidebar");
      const narrow = (await sidebar.boundingBox())?.width ?? 0;
      expect(narrow).toBeLessThan(100);
      await sidebar.getByRole("link", { name: "CLI", exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(200);
    });
  });

  test("a skip link jumps to the navigation", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to navigation" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#app-sidebar")).toBeFocused();
  });
});

test.describe("Inventory workflow", () => {
  test("the workflow stepper tracks loaded inventories and links between the steps", async ({
    page,
  }) => {
    await page.goto("/load");
    const stepper = page.getByRole("navigation", { name: "Inventory workflow" });
    await expect(stepper.getByRole("link", { name: /Load/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(stepper).toContainText("Needs two inventories");

    await page.goto("/load?sample=1");
    await expect(stepper).toContainText("inventories loaded");
    await expect(stepper.locator('[data-step="load"]')).toHaveAttribute("data-state", "current");

    await stepper.getByRole("link", { name: /Review/ }).click();
    await expect(page).toHaveURL(/\/sync$/);
    const syncStepper = page.getByRole("navigation", { name: "Inventory workflow" });
    await expect(syncStepper.getByRole("link", { name: /Review/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await syncStepper.getByRole("link", { name: /Apply/ }).click();
    await expect(page).toHaveURL(/\/sync#tour-apply$/);
    await expect(syncStepper.locator('[data-step="apply"]')).toHaveAttribute(
      "data-state",
      "current",
    );
  });

  test("/inventory sends people to Load when nothing is loaded and Review when something is", async ({
    page,
  }) => {
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/load$/);

    await page.goto("/load?sample=1");
    await expect(page.locator("#load-bar-summary")).toContainText("services loaded");
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/sync$/);
  });
});

test.describe("Supported tools matrix", () => {
  test("lists every tool and filters by search and capability", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#supported-tools");
    const rows = section.locator("[data-matrix-row]");
    const shown = section.locator("[data-matrix-row]:not([hidden])");
    const total = await rows.count();
    expect(total).toBeGreaterThanOrEqual(13);
    await expect(section.locator("#matrix-status")).toContainText(`all ${total} tools`);

    await section.getByRole("button", { name: "Can write back" }).click();
    const writable = await shown.count();
    expect(writable).toBeLessThan(total);
    await expect(section.getByRole("button", { name: "Can write back" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(rows.filter({ hasText: "Spoolstock" }).first()).toBeHidden();

    await section.getByRole("button", { name: "All", exact: true }).click();
    await section.getByRole("searchbox", { name: "Search supported tools" }).fill("excel");
    await expect(shown).toHaveCount(1);
    await expect(shown).toContainText("SpoolMaster");

    await section.getByRole("searchbox", { name: "Search supported tools" }).fill("nothing here");
    await expect(section.locator("#matrix-empty")).toBeVisible();
  });

  test("shows each tool as a card on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/#supported-tools");
    const first = page.locator("#supported-tools [data-matrix-row]").first();
    await expect(first).toBeVisible();
    await expect(first.getByText("Write back", { exact: true })).toBeVisible();
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(scrolls).toBe(false);
  });
});
