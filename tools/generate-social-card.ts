import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";
import sharp from "sharp";

import { socialCardHtml } from "./social-card/template";

async function generateSocialCard() {
  console.log("Generating social card...");

  const interWoff2 = readFileSync(
    resolve("public/fonts/inter-latin-variable-wghtOnly-normal.woff2"),
  ).toString("base64");
  const spaceGroteskWoff2 = readFileSync(
    resolve("public/fonts/space-grotesk-latin-variable-wghtOnly-normal.woff2"),
  ).toString("base64");

  const html = socialCardHtml({ interWoff2, spaceGroteskWoff2 });

  const chromePath = process.env["SPOOLSYNC_CHROME_PATH"];
  const browser = await chromium.launch({
    headless: true,
    ...(chromePath ? { executablePath: chromePath } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const pngBuffer = await page.screenshot({ type: "png" });
  await browser.close();

  mkdirSync(resolve("src/assets/images"), { recursive: true });

  for (const directory of ["src/assets/images", "public"]) {
    await sharp(pngBuffer).png({ quality: 95 }).toFile(resolve(directory, "social-card.png"));
    await sharp(pngBuffer)
      .avif({ quality: 85, effort: 6 })
      .toFile(resolve(directory, "social-card.avif"));
  }

  console.log("Social card generated successfully at:");
  console.log(" - src/assets/images/social-card.avif");
  console.log(" - src/assets/images/social-card.png");
  console.log(" - public/social-card.avif");
  console.log(" - public/social-card.png");
}

generateSocialCard().catch((err) => {
  console.error(err);
  process.exit(1);
});
