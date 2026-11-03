/**
 * Rewrites the supported-tools regions of the Markdown docs from the services registry
 * (`packages/spoolsync-core/src/core/services.ts`), so tool lists and capability tables are never
 * edited by hand.
 *
 *   bun run docs:services          rewrite the regions in place
 *   bun run docs:services:check    exit 1 when any region is stale (used in CI)
 *
 * A region is delimited by HTML comments. `<!-- services:start -->` ... `<!-- services:end -->`
 * holds the capability table; `<!-- services:NAME:start -->` ... `<!-- services:NAME:end -->`
 * holds the generator called NAME (see `GENERATORS`). Names ending in `-inline` replace text in
 * the middle of a sentence; the others replace whole lines.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { SERVICE_COUNT_WORD, formatLabel } from "../packages/spoolsync-core/src/core/services";
import {
  SERVICE_VIEWS,
  joinNames,
  type ServiceView,
} from "../src/lib/services";

/** Markdown files that contain regions, relative to the repository root. */
export const DOC_FILES = [
  "README.md",
  "packages/spoolsync-cli/README.md",
  "packages/spoolsync-core/README.md",
] as const;

const bold = (names: readonly string[]) => names.map((name) => `**${name}**`);
const cell = (text: string) => text.replaceAll("|", "\\|");

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column]!.length)),
  );
  const line = (cells: readonly string[]) =>
    `| ${cells.map((text, column) => text.padEnd(widths[column]!)).join(" | ")} |`;
  return [
    line(header),
    `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`,
    ...rows.map(line),
  ].join("\n");
}

function writeText(service: ServiceView): string {
  if (!service.canWrite) return "Read-only (does not accept imports)";
  return service.writeNote ? `${service.write} (${service.writeNote})` : service.write;
}

function readOnly(): ServiceView[] {
  return SERVICE_VIEWS.filter((service) => !service.canWrite);
}

const names = (views: readonly ServiceView[]) => views.map((service) => service.name);

/** One generator per region name; `""` is the plain `services:start` region. */
export const GENERATORS: Record<string, () => string> = {
  "": () =>
    table(
      ["Service", "Platform", "Read", "Write back", "Export from"],
      SERVICE_VIEWS.map((service) => [
        cell(service.fullName),
        cell(service.platformLabels.join(", ")),
        cell(service.read),
        cell(writeText(service)),
        cell(service.summary),
      ]),
    ),
  "list-inline": () => joinNames(bold(SERVICE_VIEWS.map((service) => service.fullName))),
  "count-inline": () => SERVICE_COUNT_WORD,
  "readonly-inline": () =>
    `${joinNames(names(readOnly()))} are read-only sources: SpoolSync reads their exports and uses their values to update other services, but they do not accept imports.`,
  "readonly-names-inline": () => joinNames(names(readOnly())),
  "api-load-inline": () =>
    joinNames(
      SERVICE_VIEWS.filter((service) => service.apiInBrowser).map((service) => service.connectionName),
      "or",
    ),
  "api-write-inline": () =>
    joinNames(
      SERVICE_VIEWS.filter((service) => service.apiWriteInBrowser).map((service) => service.connectionName),
      "or",
    ),
  "cli-names-inline": () => joinNames(names([...SERVICE_VIEWS])),
  "cli-inputs": () =>
    table(
      ["Service", "File option", "API option", "Reads files"],
      SERVICE_VIEWS.map((service) => [
        service.fullName,
        `\`${service.cliFlag}\``,
        service.cliApiFlag ? `\`${service.cliApiFlag}\`` : "None",
        service.formats.map(formatLabel).join(", "),
      ]),
    ),
  "cli-writing": () => {
    const direct = SERVICE_VIEWS.filter((service) => service.cliApiFlag && service.canWrite).map(
      (service) => service.name,
    );
    return table(
      ["Inventory source", "How it receives changes"],
      [
        ["File inventory", "Output file in `--output-dir`"],
        ["`--empty` target", "Output file in `--output-dir`"],
        [`Direct ${joinNames(direct)}`, "`--apply`"],
        [joinNames(names(readOnly())), "Read-only"],
      ],
    );
  },
};

function pattern(name: string): RegExp {
  const prefix = name ? `services:${name}:` : "services:";
  return new RegExp(`(<!-- ${prefix}start -->)([\\s\\S]*?)(<!-- ${prefix}end -->)`, "g");
}

/** Replaces every region in `text`; returns the new text and the region names it filled. */
export function renderRegions(text: string): { text: string; regions: string[] } {
  const regions: string[] = [];
  let output = text;
  for (const [name, generate] of Object.entries(GENERATORS)) {
    const inline = name.endsWith("-inline");
    output = output.replace(pattern(name), (_match, open: string, _body: string, close: string) => {
      regions.push(name || "table");
      const body = generate();
      return inline ? `${open}${body}${close}` : `${open}\n${body}\n${close}`;
    });
  }
  return { text: output, regions };
}

/** Marker comments with no generator are a mistake worth failing on. */
export function unknownRegions(text: string): string[] {
  const known = new Set(Object.keys(GENERATORS));
  const found = [...text.matchAll(/<!-- services:(?:([a-z-]+):)?start -->/g)].map((match) => match[1] ?? "");
  return found.filter((name) => !known.has(name));
}

export interface SyncResult {
  file: string;
  changed: boolean;
  regions: string[];
}

export async function syncDocs(root: string, check: boolean): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const file of DOC_FILES) {
    const path = resolve(root, file);
    const current = await readFile(path, "utf8");
    const unknown = unknownRegions(current);
    if (unknown.length > 0) throw new Error(`${file}: no generator for region(s): ${unknown.join(", ")}`);
    const next = renderRegions(current);
    const changed = next.text !== current;
    if (changed && !check) await writeFile(path, next.text);
    results.push({ file, changed, regions: next.regions });
  }
  return results;
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const root = resolve(import.meta.dir, "..");
  const results = await syncDocs(root, check);
  const stale = results.filter((result) => result.changed);
  for (const result of results) {
    const status = result.changed ? (check ? "stale" : "updated") : "up to date";
    console.log(`${result.file}: ${status} (${result.regions.length} regions)`);
  }
  if (check && stale.length > 0) {
    console.error("Supported-tool docs are out of date. Run `bun run docs:services` and commit the result.");
    process.exitCode = 1;
  }
}
