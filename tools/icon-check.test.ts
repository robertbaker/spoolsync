import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every icon the site names must exist in the installed icon sets. astro-icon fails the whole page
 * at render time for a missing one, and an icon set renaming an icon in a dependency update is
 * exactly how that happens, so this catches it in the unit tests instead of in the browser.
 */
const SETS = ["material-symbols", "simple-icons", "tabler"] as const;

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(astro|ts|tsx|mdx)$/.test(entry) && !entry.endsWith(".test.ts")) files.push(path);
  }
  return files;
}

interface IconSet {
  icons: Record<string, unknown>;
  aliases?: Record<string, unknown>;
}

test("every named icon exists in its installed icon set", () => {
  const sets = new Map<string, IconSet>(
    SETS.map((name) => [
      name,
      JSON.parse(readFileSync(`node_modules/@iconify-json/${name}/icons.json`, "utf8")) as IconSet,
    ]),
  );
  const used = new Map<string, string>();
  const pattern = new RegExp(`["'\`](${SETS.join("|")}):([a-z0-9-]+)["'\`]`, "g");
  for (const file of sourceFiles("src")) {
    for (const match of readFileSync(file, "utf8").matchAll(pattern))
      used.set(`${match[1]}:${match[2]}`, file);
  }
  expect(used.size).toBeGreaterThan(20);
  const missing = [...used]
    .filter(([name]) => {
      const [set, icon] = name.split(":") as [string, string];
      const found = sets.get(set)!;
      return !(icon in found.icons) && !(icon in (found.aliases ?? {}));
    })
    .map(([name, file]) => `${name} (${file})`);
  expect(missing).toEqual([]);
});
