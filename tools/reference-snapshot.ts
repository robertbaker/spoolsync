/**
 * Builds the reference-data snapshots the site serves (`public/reference/*.json`), so visitors
 * download a catalog from SpoolSync once instead of every visitor fetching it from its service.
 * Runs before `astro build`. A service being down never fails the build; pass `--strict` to make a
 * provider with no snapshot at all an error, and `--force` to refetch and accept a smaller catalog.
 * `SKIP_REFERENCE_SNAPSHOT=1` skips it for an offline build.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { buildSnapshots } from "./reference-snapshot/build";
import { openPrintTagSource } from "./reference-snapshot/openprinttag-source";

if (process.env["SKIP_REFERENCE_SNAPSHOT"] === "1") {
  console.log(
    "[reference-snapshot] skipped (SKIP_REFERENCE_SNAPSHOT=1); the site will fetch live.",
  );
  process.exit(0);
}

const args = new Set(process.argv.slice(2));
const outIndex = process.argv.indexOf("--out");
const outDir = outIndex > 0 ? (process.argv[outIndex + 1] ?? "public") : "public";

const results = await buildSnapshots(
  {
    io: {
      fetch: (url, init) =>
        fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(120_000) }) as never,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
    },
    async readText(path) {
      try {
        return await readFile(path, "utf8");
      } catch {
        return null;
      }
    },
    async writeText(path, text) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text);
    },
    now: () => Date.now(),
    log: (message) => console.log(`[reference-snapshot] ${message}`),
  },
  {
    outDir,
    force: args.has("--force"),
    sources: { openprinttag: openPrintTagSource() },
  },
);

if (args.has("--strict") && results.some((result) => result.status === "failed")) process.exit(1);
