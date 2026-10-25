import { randomUUID } from "node:crypto";

import type { AdapterRuntime } from "@spoolsync/core/adapters/shared/runtime";

import { CliError } from "./errors";
import { buildRecord } from "./record";
import { loadReference } from "./references";
import type { CliOptions, ReferenceRow, SpoolmanSpool, TtagFile } from "./types";

export interface ConverterDependencies {
  loadReference(filename: string): Promise<ReferenceRow[]>;
  runtime: AdapterRuntime;
}
const defaultConverterDependencies: ConverterDependencies = {
  loadReference,
  runtime: { now: () => Date.now(), randomUUID },
};

export async function createTtag(
  spools: SpoolmanSpool[],
  options: CliOptions,
  dependencies: ConverterDependencies = defaultConverterDependencies,
): Promise<{ file: TtagFile; skipped: string[]; warnings: string[] }> {
  const [brands, materials] = await Promise.all([
    dependencies.loadReference("id_brand.json"),
    dependencies.loadReference("id_material.json"),
  ]);
  const refs = { brands, materials };
  const records = [];
  const skipped = [];
  const warnings: string[] = [];
  for (let i = 0; i < spools.length; i += 1) {
    const spool = spools[i];
    if (!options.includeArchived && spool?.archived === true) {
      skipped.push(String(spool.id ?? i + 1));
      continue;
    }
    records.push(buildRecord(spool, refs, i, warnings, dependencies.runtime));
  }
  if (!records.length) throw new CliError("No active spools were found to import");
  return {
    file: {
      format: "tigertag",
      kind: "ttag",
      version: 1,
      exportedAt: new Date(dependencies.runtime.now()).toISOString(),
      exportedBy: null,
      source: "spoolman",
      records,
    },
    skipped,
    warnings,
  };
}
