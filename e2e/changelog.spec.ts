import { expect, test, type Page } from "@playwright/test";

import cliPackage from "../packages/spoolsync-cli/package.json" with { type: "json" };

const version = cliPackage.version;
const RAW = "https://raw.githubusercontent.com/**";
const cors = { "access-control-allow-origin": "*" };

const changelog = `# Changelog

## [9.9.9](https://github.com/robertbaker/spoolsync/compare/spoolsync-cli-v${version}...spoolsync-cli-v9.9.9) (2027-01-01)

### Features

* **web:** brand new thing ([aaaaaaa](https://github.com/robertbaker/spoolsync/commit/aaaaaaa1111))

## [${version}](https://github.com/robertbaker/spoolsync/compare/spoolsync-cli-v0.0.1...spoolsync-cli-v${version}) (2026-10-28)

### Bug Fixes

* **sync:** retain completed write logs across apply failures ([3aa6df2](https://github.com/robertbaker/spoolsync/commit/3aa6df2bb5c7a9202515f61798aaf530b554f30f))
`;

async function serveChangelog(page: Page, body = changelog) {
  await page.route(RAW, (route) =>
    route.fulfill({ status: 200, headers: { ...cors, "content-type": "text/plain" }, body }),
  );
}

test("the footer shows the version, and clicking it shows the changelog from GitHub", async ({
  page,
}) => {
  await serveChangelog(page);
  await page.goto("/");
  const button = page.getByRole("button", { name: new RegExp(`SpoolSync version ${version}`) });
  await expect(button).toHaveText(`v${version}`);
  await button.click();

  const dialog = page.getByRole("dialog", { name: "What's new" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Version 9.9.9" })).toContainText(
    "brand new thing",
  );
  const current = dialog.getByRole("region", { name: `Version ${version}` });
  await expect(current).toContainText("You are here");
  await expect(current).toContainText("Bug Fixes");
  await expect(current).toContainText("retain completed write logs across apply failures");
  await expect(dialog).toContainText("A newer version, 9.9.9, is available");

  const commit = current.getByRole("link", { name: "3aa6df2" });
  await expect(commit).toHaveAttribute(
    "href",
    "https://github.com/robertbaker/spoolsync/commit/3aa6df2bb5c7a9202515f61798aaf530b554f30f",
  );
  await expect(commit).toHaveAttribute("rel", "noopener noreferrer");
  await expect(commit).toHaveAttribute("target", "_blank");
  await expect(dialog.getByRole("link", { name: "Open the changelog on GitHub" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("an unreachable GitHub is explained, and a saved copy is used when there is one", async ({
  page,
}) => {
  await page.route(RAW, (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: /show what is new/ }).click();
  const dialog = page.getByRole("dialog", { name: "What's new" });
  await expect(dialog.locator("#changelog-error")).toContainText("Could not load the changelog");
  await expect(dialog.getByRole("link", { name: "Open it on GitHub" })).toBeVisible();
  await page.keyboard.press("Escape");

  // One successful load saves a copy; later failures fall back to it.
  await page.unroute(RAW);
  await serveChangelog(page);
  await page.getByRole("button", { name: /show what is new/ }).click();
  await expect(dialog).toContainText("brand new thing");
  await page.keyboard.press("Escape");
  await page.unroute(RAW);
  await page.route(RAW, (route) => route.abort());
  await page.getByRole("button", { name: /show what is new/ }).click();
  await expect(dialog).toContainText("Could not reach GitHub");
  await expect(dialog).toContainText("Showing the copy saved on");
  await expect(dialog).toContainText("brand new thing");
});

test("a changelog cannot inject markup or non-https links", async ({ page }) => {
  await serveChangelog(
    page,
    `## [${version}](javascript:void) (2026-10-28)\n\n### Features\n\n* <img src=x onerror=window.__pwned=1> ([abcdef1](javascript:void))\n`,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /show what is new/ }).click();
  const dialog = page.getByRole("dialog", { name: "What's new" });
  await expect(dialog).toContainText("<img src=x onerror=window.__pwned=1>");
  await expect(dialog.locator("img")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
  ).toBeUndefined();
  await expect(dialog.getByRole("link", { name: "abcdef1" })).toHaveCount(0);
});

test("the first visit after an update says so once, but a first-ever visit does not", async ({
  page,
}) => {
  await serveChangelog(page);
  await page.goto("/");
  await expect(page.getByText(/SpoolSync updated to/)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("spoolsync:last-seen-version"))).toBe(
    version,
  );

  await page.evaluate(() => localStorage.setItem("spoolsync:last-seen-version", "0.0.1"));
  await page.reload();
  await expect(page.getByText(`SpoolSync updated to v${version}`)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("spoolsync:last-seen-version"))).toBe(
    version,
  );

  await page.reload();
  await expect(page.getByText(/SpoolSync updated to/)).toHaveCount(0);
});
