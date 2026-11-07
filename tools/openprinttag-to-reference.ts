/**
 * Builds a SpoolSync reference file from a local clone of
 * https://github.com/OpenPrintTag/openprinttag-database (YAML, no bulk export).
 *
 * Bun tools/openprinttag-to-reference.ts <clone-dir> <output.json>
 *
 * Load the output on the Load page's reference file input and pick the "OpenPrintTag database"
 * mapping. Reads only; the clone is never modified.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { flattenOpenPrintTag } from "../packages/spoolsync-core/src/core/reference/openprinttag";

function yamlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...yamlFiles(path));
    else if (/\.ya?ml$/i.test(entry.name)) out.push(path);
  }
  return out;
}

function readTable(root: string, name: string): unknown[] {
  return yamlFiles(join(root, "data", name)).map((file) =>
    Bun.YAML.parse(readFileSync(file, "utf8")),
  );
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: bun tools/openprinttag-to-reference.ts <clone-dir> <output.json>");
  process.exit(0);
}
const [root, output, ...extra] = args;
if (!root || !output || extra.length || root.startsWith("-") || output.startsWith("-")) {
  console.error("Usage: bun tools/openprinttag-to-reference.ts <clone-dir> <output.json>");
  process.exit(2);
}
const records = flattenOpenPrintTag({
  brands: readTable(root, "brands"),
  materials: readTable(root, "materials"),
  packages: readTable(root, "material-packages"),
});
writeFileSync(output, `${JSON.stringify(records, null, 2)}\n`);
console.log(`Wrote ${records.length} records to ${output}`);
