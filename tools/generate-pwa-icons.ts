/**
 * Renders the app icons from `public/favicon.svg`. Run `bun tools/generate-pwa-icons.ts` after
 * changing the favicon and commit the PNGs in `public/icons/`.
 *
 * - `icon-192.png` and `icon-512.png` keep the favicon's rounded square ("any" purpose).
 * - `icon-maskable-512.png` is full-bleed orange with the mark inside the central 80% safe zone, so
 *   launchers can crop it to any shape.
 * - `apple-touch-icon.png` (180 px) is full-bleed, because iOS rounds corners itself.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const root = path.join(import.meta.dir, "..");
const out = path.join(root, "public", "icons");
const BRAND = "#f97316";

const svg = await readFile(path.join(root, "public", "favicon.svg"));
await mkdir(out, { recursive: true });

async function rounded(size: number): Promise<Buffer> {
  return sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
}

/** The mark scaled into the middle of a square of the brand color. */
async function fullBleed(size: number, markScale: number): Promise<Buffer> {
  const mark = Math.round(size * markScale);
  const inner = await sharp(svg, { density: 384 }).resize(mark, mark).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BRAND } })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toBuffer();
}

const files: Record<string, Buffer> = {
  "icon-192.png": await rounded(192),
  "icon-512.png": await rounded(512),
  "icon-maskable-512.png": await fullBleed(512, 0.8),
  "apple-touch-icon.png": await fullBleed(180, 1),
};
for (const [name, data] of Object.entries(files)) {
  await writeFile(path.join(out, name), data);
  console.log(`public/icons/${name} (${data.length} bytes)`);
}
