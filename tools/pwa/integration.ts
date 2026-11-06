import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AstroIntegration } from "astro";

import { cacheVersion, precacheUrls, renderServiceWorker } from "./service-worker";

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(directory, prefix), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? listFiles(directory, `${prefix}${entry.name}/`)
        : Promise.resolve([`${prefix}${entry.name}`]),
    ),
  );
  return nested.flat();
}

/** The address a precached file is served from, for hashing: pages drop their extension. */
const sourceFile = (url: string) => (url === "/" ? "index.html" : url.slice(1));

/** Writes `sw.js` into the build output once every other file exists, so it can list them. */
export function serviceWorker(): AstroIntegration {
  return {
    name: "spoolsync-service-worker",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const root = fileURLToPath(dir);
        const files = await listFiles(root);
        const urls = precacheUrls(files);
        const entries = await Promise.all(
          urls.map(async (url) => {
            const relative = sourceFile(url);
            const name = files.includes(relative) ? relative : `${relative}.html`;
            return { url, content: await readFile(path.join(root, name)) };
          }),
        );
        const template = await readFile(path.join(import.meta.dirname, "sw.js"), "utf8");
        await writeFile(
          path.join(root, "sw.js"),
          renderServiceWorker(template, cacheVersion(entries), urls),
        );
      },
    },
  };
}
