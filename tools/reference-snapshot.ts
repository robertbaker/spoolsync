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

const rawArgs = process.argv.slice(2);
let outDir = "public";
let force = false;
let strict = false;
for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i]!;
  if (arg === "--force") force = true;
  else if (arg === "--strict") strict = true;
  else if (arg === "--out") {
    const next = rawArgs[++i];
    if (!next || next.startsWith("-")) throw new Error("--out requires a directory path");
    outDir = next;
  } else if (arg.startsWith("--out=")) {
    const next = arg.slice("--out=".length);
    if (!next) throw new Error("--out requires a directory path");
    outDir = next;
  } else {
    throw new Error(`Unknown option: ${arg}`);
  }
}

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
    force,
    sources: { openprinttag: openPrintTagSource() },
  },
);

if (strict && results.some((result) => result.status === "failed")) process.exit(1);
