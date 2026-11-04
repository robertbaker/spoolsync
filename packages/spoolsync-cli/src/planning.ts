import { compareGroup } from "@spoolsync/core/core/compare";
import { matchSpools, recordKey } from "@spoolsync/core/core/match";
import { mergeRecordEdits } from "@spoolsync/core/core/reference";
import { SOURCE_IDS, type LoadResult, type SourceId } from "@spoolsync/core/core/model";
import { planSync, resolutionsFromChoices } from "@spoolsync/core/planner";

import { pairArg, type Options } from "./args";
import { runCleanup } from "./cleanup";
import type { ReferenceOutcome } from "./reference";

/** Pure CLI decisions and plan construction; no files or remote writes. */
export function createCliPlan(
  options: Options,
  loaded: ReadonlyMap<SourceId, LoadResult>,
  /** Matches against `--reference`, computed by the caller because reading the file is async. */
  reference?: ReferenceOutcome,
) {
  const decisions = {
    confirmed: options.confirm.map(pairArg),
    rejected: options.reject.map(pairArg),
  };
  const spools = [...loaded.values()].flatMap((result) => result.spools);
  const recordKeys = new Set(spools.map(recordKey));
  for (const pair of [...decisions.confirmed, ...decisions.rejected])
    for (const key of pair.split("|"))
      if (!recordKeys.has(key)) throw new Error(`Match decision references unknown record: ${key}`);
  const matches = matchSpools(spools, decisions);
  const groupByRecord = new Map(
    matches.groups.flatMap((group) =>
      Object.values(group.members).map((spool) => [recordKey(spool), group.id] as const),
    ),
  );
  for (const pair of decisions.confirmed) {
    const [a, b] = pair.split("|");
    if (groupByRecord.get(a!) !== groupByRecord.get(b!))
      throw new Error(
        `Could not confirm ${a},${b}: the match conflicts with other records from the same source. Review your --confirm choices and cross-IDs.`,
      );
  }
  for (const pair of decisions.rejected) {
    const [a, b] = pair.split("|");
    if (groupByRecord.get(a!) === groupByRecord.get(b!))
      throw new Error(
        `Could not reject ${a},${b}: these records are already linked by cross-IDs or other confirmations. Correct those links before rejecting the pair.`,
      );
  }
  const resolutions = resolutionsFromChoices(matches.groups, options.resolves, options.createIn);
  // Safe cleanups become planned updates on the record they came from; nothing else is applied.
  const cleanup = options.cleanup ? runCleanup(options, loaded) : undefined;
  const plan = planSync(
    matches.groups,
    resolutions,
    matches.suggestions,
    undefined,
    // Reference fills are applied after cleanups: they come from an explicit file the person gave.
    cleanup || reference ? mergeRecordEdits(cleanup?.edits, reference?.edits) : undefined,
  );
  const plannedChanges = Object.fromEntries(
    SOURCE_IDS.filter((source) => loaded.has(source)).map((source) => [
      source,
      plan.get(source) ?? [],
    ]),
  );
  const summary = {
    inventories: Object.fromEntries(
      SOURCE_IDS.filter((source) => loaded.has(source)).map((source) => [
        source,
        {
          file: options.inputs.get(source),
          spools: loaded.get(source)!.spools.length,
          warnings: loaded.get(source)!.warnings,
        },
      ]),
    ),
    groups: matches.groups.length,
    suggestions: matches.suggestions,
    problems: matches.problems,
    unresolved: matches.groups.flatMap((group) =>
      compareGroup(group)
        .filter(
          (comparison) =>
            comparison.kind === "conflict" &&
            !(comparison.field in (resolutions.get(group.id)?.values ?? {})),
        )
        .map((comparison) => ({ group: group.id, field: comparison.field })),
    ),
    changes: Object.fromEntries(
      SOURCE_IDS.map((source) => [
        source,
        {
          updates: (plan.get(source) ?? []).filter((change) => change.kind === "update").length,
          creates: (plan.get(source) ?? []).filter((change) => change.kind === "create").length,
        },
      ]),
    ),
    plannedChanges,
  };

  return { spools, matches, resolutions, plan, summary, cleanup, reference };
}
