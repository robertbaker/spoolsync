import { createHash } from "node:crypto";

/** Page addresses are served without ".html" (see `trailingSlash: "never"` and Workers assets). */
export function pageUrl(file: string): string {
  const name = file.replace(/\.html$/, "");
  return name === "index" ? "/" : `/${name}`;
}

/** Pages that open offline from the first visit; other pages are saved as they are visited. */
const SHELL_PAGES = new Set(["index", "load", "sync", "connections", "cli", "credits", "offline"]);

/**
 * The files to save at install time, as site addresses: the main pages, hashed scripts and styles,
 * fonts, icons and the manifest. Files are paths relative to the build directory. Social images,
 * blog posts, source maps, and host config files are left out.
 */
export function precacheUrls(files: readonly string[]): string[] {
  const urls = new Set<string>();
  for (const file of files.map((name) => name.replaceAll("\\", "/"))) {
    if (file.endsWith(".map")) continue;
    if (/^[^/]+\.html$/.test(file)) {
      if (SHELL_PAGES.has(file.replace(/\.html$/, ""))) urls.add(pageUrl(file));
    } else if (/^_astro\/.+\.(js|css)$/.test(file) || /^fonts\/.+\.woff2$/.test(file)) {
      urls.add(`/${file}`);
    } else if (
      file.startsWith("icons/") ||
      ["favicon.svg", "logo-mark.svg", "logo.svg", "manifest.webmanifest"].includes(file)
    ) {
      urls.add(`/${file}`);
    }
  }
  return [...urls].sort();
}

/** A short version that changes whenever any precached file's name or content changes. */
export function cacheVersion(entries: ReadonlyArray<{ url: string; content: Uint8Array }>): string {
  const hash = createHash("sha256");
  for (const { url, content } of [...entries].sort((a, b) => a.url.localeCompare(b.url))) {
    hash.update(url).update("\0").update(content).update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

/** Fills the template's version and precache list. */
export function renderServiceWorker(
  template: string,
  version: string,
  precache: readonly string[],
): string {
  if (!/^[0-9a-f]{12}$/.test(version)) throw new Error(`Unexpected cache version: ${version}`);
  if (!template.includes("__VERSION__") || !template.includes("/* __PRECACHE__ */ []"))
    throw new Error("The service worker template is missing its placeholders.");
  return template
    .replace("__VERSION__", version)
    .replace("/* __PRECACHE__ */ []", JSON.stringify(precache, null, 2));
}
