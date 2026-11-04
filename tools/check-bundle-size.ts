/** Fails when the built site's scripts or styles outgrow their budgets. Run after `bun run build`. */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { checkBudgets } from "./bundle-budget/check";

const directory = process.argv[2] ?? "dist/_astro";
const files = (await readdir(directory)).filter((file) => /\.(js|css)$/.test(file));
const assets = await Promise.all(
  files.map(async (file) => ({
    file,
    gzipBytes: gzipSync(await readFile(join(directory, file))).length,
  })),
);
const report = checkBudgets(assets);
const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;
console.log(
  `[bundle] JavaScript ${kb(report.totals.js)}, CSS ${kb(report.totals.css)}, largest script ${report.totals.largestJs?.file ?? "-"} (${kb(report.totals.largestJs?.gzipBytes ?? 0)}), gzipped.`,
);
for (const failure of report.failures) console.error(`[bundle] ${failure}`);
if (report.failures.length) process.exit(1);
