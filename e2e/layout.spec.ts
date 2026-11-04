import { expect, test, type Page } from "@playwright/test";

/**
 * Pages must fit the screen: no sideways scrolling. Elements that stick out but are clipped by a
 * container (decorative shapes, scrollers) are fine; `wide` only names suspects when a page
 * scrolls. This is cheaper than screenshot baselines (which differ by operating system) and catches
 * the same regression: one unbreakable line or table pushing a whole page wider than a phone.
 */
const PAGES = ["/", "/load", "/sync", "/cli", "/resources", "/credits", "/privacy"];
const VIEWPORTS = [
  { name: "phone", width: 360, height: 780 },
  { name: "large phone", width: 430, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
] as const;

async function overflow(page: Page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return {
      scrolls: document.documentElement.scrollWidth > limit,
      wide: [...document.querySelectorAll("body *")]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          // Fixed bars and visually hidden helpers are positioned on purpose; scrollers clip their own.
          if (getComputedStyle(element).position === "fixed" || box.width === 0) return false;
          return (
            box.right > limit + 1 &&
            !element.closest("[class*='overflow-x'], pre, table, [data-scroll]")
          );
        })
        .slice(0, 4)
        .map(
          (element) =>
            `${element.tagName.toLowerCase()}#${element.id}.${String(element.className).slice(0, 40)}`,
        ),
    };
  });
}

/**
 * Entrance animations can push an element sideways for a moment, so a page counts as overflowing
 * only if it still does after a short settle; a real overflow never goes away and still fails.
 */
async function fits(page: Page) {
  await expect
    .poll(
      async () => {
        const result = await overflow(page);
        return result.scrolls
          ? `wider than the screen: ${result.wide.join(", ") || "(unknown)"}`
          : "";
      },
      { timeout: 3000 },
    )
    .toBe("");
}

for (const viewport of VIEWPORTS) {
  test.describe(`layout on a ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const path of PAGES) {
      test(`${path} does not scroll sideways`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await fits(page);
      });
    }

    test("/load with open service panels and loaded inventories fits", async ({ page }) => {
      await page.goto("/load?sample=1");
      await expect(page.locator("#load-bar-summary")).toContainText("services loaded");
      for (const panel of await page.locator("details[data-panel]").all()) {
        await panel.evaluate((element) => ((element as HTMLDetailsElement).open = true));
      }
      await fits(page);
    });
  });
}
