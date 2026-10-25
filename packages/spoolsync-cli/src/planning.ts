import { compareGroup, type GroupResolution } from "@spoolsync/core/core/compare";
import { matchSpools, recordKey } from "@spoolsync/core/core/match";
import { SOURCE_IDS, type LoadResult, type SourceId } from "@spoolsync/core/core/model";
import { ensureResolution, planSync } from "@spoolsync/core/planner";

import { pairArg, type Options } from "./args";

/** Pure CLI decisions and plan construction; no files or remote writes. */
export function createCliPlan(options: Options, loaded: ReadonlyMap<SourceId, LoadResult>) {
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
  const resolutions = new Map<string, GroupResolution>();
  for (const group of matches.groups) {
    const resolution = ensureResolution(resolutions, group);
    for (const [field, source] of options.resolves) {
      const comparison = compareGroup(group).find((item) => item.field === field);
      const option = comparison?.options.find((candidate) => candidate.sources.includes(source));
      if (option) resolution.values[field] = option.value;
    }
    for (const source of options.createIn)
      if (!group.members[source]) resolution.createIn.push(source);
  }
  const plan = planSync(matches.groups, resolutions, matches.suggestions);
  const plannedChanges = Object.fromEntries(
    SOURCE_IDS.filter((source) => loaded.has(source)).map((source) => [
      source,
      plan.get(source) ?? [],
    ]),
  );
  const summary = {
    inventories: Object.fromEntries(
      [...loaded].map(([source, result]) => [
        source,
        {
          file: options.inputs.get(source),
          spools: result.spools.length,
          warnings: result.warnings,
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

  return { spools, matches, resolutions, plan, summary };
}
