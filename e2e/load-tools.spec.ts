import { expect, test } from "@playwright/test";

test.describe("Load page tools", () => {
  test("the drying guide lists moisture-prone spools with typical settings", async ({ page }) => {
    await page.goto("/load?sample=1");
    const panel = page.locator("#drying-panel");
    await expect(panel).toBeVisible();
    const summary = panel.locator("summary");
    await expect(summary).toContainText("Drying guide (");
    await summary.click();
    await expect(panel).toContainText("PETG: 65 °C for 6 h (typical)");
    // PLA rarely needs drying, so it appears only on request.
    await expect(panel.getByText("Prusament PLA")).toHaveCount(0);
    await panel.getByLabel("Also show materials that rarely need drying").check();
    await expect(panel).toContainText("PLA: 45 °C for 4 h (typical)");
  });

  test("pressing Enter on a scanned label code opens that spool", async ({ page }) => {
    await page.goto("/load?sample=1");
    const filter = page.getByRole("searchbox", { name: "Filter loaded spools" });
    await filter.fill("spoolio:sample-spoolio-1");
    await filter.press("Enter");
    const drawer = page.locator("dialog[open]");
    await expect(drawer).toBeVisible();
    await expect(page.locator("#spool-drawer-title")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    // The filter box is left empty for the next scan.
    await expect(filter).toHaveValue("");

    // A code for a spool that is not loaded says so instead of filtering to nothing.
    await filter.fill("spoolio:99999");
    await filter.press("Enter");
    await expect(page.getByText("No loaded spool has the code spoolio:99999")).toBeVisible();

    // Ordinary text is still a filter.
    await filter.fill("PETG");
    await filter.press("Enter");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });

  test("the label dialog explains how to find a spool from its label", async ({ page }) => {
    await page.goto("/load?sample=1");
    await page
      .getByRole("button", { name: /Print labels/ })
      .first()
      .click();
    await expect(page.locator("#labels-dialog")).toContainText("filter box and press Enter");
  });
});

test("the reorder list links a SUNLU spool to the SUNLU store first, with the coupon and disclosures", async ({
  page,
}) => {
  await page.goto("/load");
  await page.locator("#spoolio-file").setInputFiles({
    name: "spoolio.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        filaments: [
          {
            id: "s1",
            brand: "SUNLU",
            type: "PLA",
            colorName: "Fire Red",
            weightTotal: 1000,
            weightRemaining: 50,
          },
          {
            id: "s2",
            brand: "Prusament",
            type: "PETG",
            colorName: "Orange",
            weightTotal: 1000,
            weightRemaining: 40,
          },
        ],
      }),
    ),
  });
  const panel = page.locator("#reorder-panel");
  await panel.locator("summary").click();

  const sunlu = panel.locator("li a[data-shop='sunlu']").first();
  const href = await sunlu.getAttribute("href");
  const url = new URL(href!);
  expect(url.origin).toBe("https://store.sunlu.com");
  expect(url.searchParams.get("sca_ref")).toBe("12700401.UcCqD96LNe");
  expect(url.searchParams.get("q")).toBe("PLA Fire Red");
  await expect(sunlu).toHaveAttribute("rel", /sponsored/);
  await expect(panel).toContainText("Coupon code SpoolSync (5% off)");

  // Clicking the code copies it.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await panel.locator("button[data-coupon='SpoolSync']").first().click();
  await expect(page.getByText("Copied coupon code SpoolSync")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("SpoolSync");

  // Prusament has no store of its own here, so it gets Amazon only.
  const amazon = panel.locator("a[data-shop='amazon']");
  expect(await amazon.count()).toBeGreaterThanOrEqual(2);
  await expect(amazon.first()).toHaveAttribute("href", /tag=spoolsync-20/);
  await expect(panel.locator("[data-disclosure]")).toHaveCount(2);
  await expect(panel).toContainText(
    "As an Amazon Associate, SpoolSync earns from qualifying purchases.",
  );
  await expect(panel).toContainText("SUNLU links are affiliate links");
});
