import path from "node:path";

import { FIELD_LABELS, formatValue, type PlannedChange } from "@spoolsync/core/core/compare";
import {
  isWritableSource,
  type ApplyLogEntry,
  type LoadResult,
  type WritableSourceId,
} from "@spoolsync/core/core/model";
import {
  buildRollback,
  parseRollback,
  planRollback,
  serializeRollback,
  type RollbackDocument,
  type RollbackPlan,
} from "@spoolsync/core/workflow";

import type { Options } from "./options";
import type { CliDependencies, CliOutput } from "./runtime";
import type { RemoteService } from "./services";
import { userConfigPath, writeTextAtomic } from "./user-config";

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Where rollback files go: `--rollback-dir`, else a `rollbacks` folder beside the settings file. */
export const rollbackDirectory = (options: Pick<Options, "rollbackDir">): string =>
  options.rollbackDir
    ? path.resolve(options.rollbackDir)
    : path.join(path.dirname(userConfigPath()), "rollbacks");

export function rollbackFileName(document: RollbackDocument): string {
  const stamp = document.createdAt.replace(/[:.]/g, "-").replace(/Z$/, "");
  return `spoolsync-rollback-${document.source}-${stamp}.json`;
}

/** The default way to save a rollback file: atomically, readable only by the current user. */
export async function writeRollbackFile(
  document: RollbackDocument,
  options: Pick<Options, "rollbackDir">,
): Promise<string> {
  const file = path.join(rollbackDirectory(options), rollbackFileName(document));
  await writeTextAtomic(file, serializeRollback(document));
  return file;
}

/**
 * Saves the rollback file for a service's planned changes just before they are written. When it
 * cannot be saved nothing is written, since going on without the safety net would defeat the point;
 * `--no-rollback` is the way to write without one.
 */
export async function saveRollbackBeforeWrite(
  source: WritableSourceId,
  label: string,
  changes: readonly PlannedChange[],
  options: Options,
  dependencies: Pick<CliDependencies, "saveRollback" | "now">,
): Promise<string | undefined> {
  if (options.noRollback) return undefined;
  const document = buildRollback(source, changes, { target: label, now: dependencies.now() });
  if (!document.updates.length && !document.creations.length) return undefined;
  try {
    return await dependencies.saveRollback(document, options);
  } catch (error) {
    throw new Error(
      `Could not save the rollback file, so nothing was written to ${label}: ${reason(error)} Use --no-rollback to write without one.`,
    );
  }
}

/** The `rollback` report printed by `--restore-rollback` with `--format json`. */
export interface RestoreReport {
  schemaVersion: 1;
  report: "rollback";
  source: WritableSourceId;
  /** The rollback file that was read. */
  file: string;
  /** When that file was made, or an empty string when it does not say. */
  createdAt: string;
  fields: number;
  spools: number;
  changes: Array<{
    spool: string;
    label: string;
    field: string;
    current: unknown;
    restoreTo: unknown;
  }>;
  skipped: Array<{ label: string; field: string | null; reason: string }>;
  creations: string[];
  applied?: ApplyLogEntry[];
  /** The rollback file written for this restore, so it can itself be taken back. */
  rollbackFile?: string;
}

const spoolLabel = (change: RollbackPlan["changes"][number]) =>
  [change.spool.vendor, change.spool.material, change.spool.name ?? `#${change.spool.sourceId}`]
    .filter(Boolean)
    .join(" ");

/**
 * `--restore-rollback <file>`: reads a rollback file, shows what can be put back against the
 * service's current values (fields changed since are left alone), and with `--apply` writes it.
 * Returns the loaded spools so a watch snapshot has something to hold.
 */
export async function runRestore(
  options: Options,
  dependencies: CliDependencies,
  output: CliOutput,
): Promise<LoadResult["spools"]> {
  const file = options.restoreRollback as string;
  let document: RollbackDocument;
  try {
    document = parseRollback(await dependencies.readText(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(
        `Could not load rollback file "${file}": file not found. Check the path (relative paths are resolved from ${process.cwd()}).`,
      );
    throw new Error(`Could not load rollback file "${file}": ${reason(error)}`);
  }
  let service: RemoteService | undefined;
  for (const candidate of dependencies.remoteServices(options))
    if (candidate.source === document.source && candidate.apply) service = candidate;
  if (!service?.apply || !isWritableSource(service.source))
    throw new Error(
      `The rollback file is for ${document.service}. Give its connection to restore it, for example ${document.source === "spoolman" ? "--spoolman-url" : document.source === "filamentdb" ? "--filamentdb-url" : "--filadex-url"} <address>.`,
    );
  const inventory = await service.load();
  const plan = planRollback(document, inventory);
  const key = (change: RollbackPlan["changes"][number]) =>
    `${change.source}:${change.spool.sourceId}`;
  let applied: ApplyLogEntry[] | undefined;
  let rollbackFile: string | undefined;
  if (options.apply && plan.changes.length) {
    rollbackFile = await saveRollbackBeforeWrite(
      service.source,
      service.label,
      plan.changes,
      options,
      dependencies,
    );
    if (rollbackFile && !options.json) output.error(`Saved rollback file ${rollbackFile}`);
    applied = await service.apply(plan.changes, (done, total) => {
      if (!options.json) output.error(`Restoring ${service.label} changes: ${done}/${total}`);
    });
    if (applied.some((entry) => !entry.ok)) output.setExitCode(1);
  }
  const changes = plan.changes.flatMap((change) =>
    change.changes.map((item) => ({
      spool: key(change),
      label: spoolLabel(change),
      field: item.field,
      current: item.from,
      restoreTo: item.to,
    })),
  );
  if (options.json) {
    const report: RestoreReport = {
      schemaVersion: 1,
      report: "rollback",
      source: document.source,
      file,
      createdAt: document.createdAt,
      fields: plan.fields,
      spools: plan.changes.length,
      changes,
      skipped: plan.skipped,
      creations: plan.creations.map((creation) => creation.label),
      ...(applied ? { applied } : {}),
      ...(rollbackFile ? { rollbackFile } : {}),
    };
    output.log(JSON.stringify(report, null, 2));
  } else {
    const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
    output.log(
      `Rollback file for ${document.service}${document.createdAt ? ` from ${document.createdAt}` : ""}: ${plural(plan.fields, "field")} in ${plural(plan.changes.length, "spool")} can be put back.`,
    );
    for (const change of plan.changes)
      output.log(
        `  ${key(change)} ${spoolLabel(change)}: ${change.changes
          .map(
            (item) =>
              `${FIELD_LABELS[item.field]} ${formatValue(item.field, item.from)} -> ${formatValue(item.field, item.to)}`,
          )
          .join("; ")}`,
      );
    if (plan.skipped.length) {
      output.log(`${plural(plan.skipped.length, "item")} left alone:`);
      for (const item of plan.skipped)
        output.log(
          `  ${item.label}${item.field ? `, ${FIELD_LABELS[item.field]}` : ""}: ${item.reason}`,
        );
    }
    if (plan.creations.length) {
      output.log(
        `${plural(plan.creations.length, "spool")} ${plan.creations.length === 1 ? "was" : "were"} created by that sync. SpoolSync never deletes spools; delete these in ${document.service} yourself:`,
      );
      for (const creation of plan.creations) output.log(`  ${creation.label}`);
    }
    if (applied) output.log("Apply results:", applied);
    else if (plan.changes.length) output.log("Dry run only. Add --apply to put these values back.");
    if (rollbackFile) output.log(`Rollback file for this restore: ${rollbackFile}`);
  }
  return inventory.spools;
}
