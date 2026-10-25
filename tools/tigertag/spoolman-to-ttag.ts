#!/usr/bin/env bun

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseArgs, printHelp } from "./converter/args";
import { createTtag } from "./converter/convert";
import { log } from "./converter/log";
import { writeAtomically } from "./converter/output";
import { loadSpools } from "./converter/spools";
import type { CliOptions } from "./converter/types";

export { createTtag } from "./converter/convert";
export { parseSpoolPayload } from "./converter/spools";

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error: any) {
    log("error", error.message);
    process.exitCode = error.exitCode ?? 1;
    return;
  }
  if (options.help) {
    printHelp();
    return;
  }
  try {
    const spools = await loadSpools(options);
    const { file, skipped, warnings } = await createTtag(spools, options);
    const destination = await writeAtomically(
      options.output ?? "",
      `${JSON.stringify(file, null, 2)}\n`,
    );
    log("info", `Wrote ${file.records.length} spool record(s) to ${destination}`);
    if (skipped.length)
      log(
        "info",
        `Excluded ${skipped.length} archived spool(s); pass --include-archived to include them`,
      );
    for (const warning of warnings.slice(0, 10)) log("warn", warning);
    if (warnings.length > 10) log("warn", `...and ${warnings.length - 10} more`);
    const genericBrands = new Set(
      file.records.filter((record) => record.id_brand === 65535).map((record) => record.brand),
    );
    if (genericBrands.size)
      log(
        "info",
        `${genericBrands.size} vendor name(s) use TigerTag's Generic brand ID; their original names are retained`,
      );
    log(
      "info",
      "Open the .ttag file in Tiger Studio Manager and inspect the import preview before accepting",
    );
  } catch (error: any) {
    log("error", error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
