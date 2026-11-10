import { compareGroup } from "@spoolsync/core/core/compare";
import { matchSpools, recordKey, splitPairKey } from "@spoolsync/core/core/match";
import { SOURCE_IDS, type LoadResult, type SourceId } from "@spoolsync/core/core/model";
import { mergeRecordEdits } from "@spoolsync/core/core/reference";
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
  const spools = [];
  const recordKeys = new Set<string>();
  for (const result of loaded.values()) {
    for (const spool of result.spools) {
      spools.push(spool);
      recordKeys.add(recordKey(spool));
    }
  }
  const validatePairs = (pairs: readonly string[]) => {
    for (const pair of pairs) {
      for (const key of splitPairKey(pair) ?? [pair]) {
        if (!recordKeys.has(key))
          throw new Error(`Match decision references unknown record: ${key}`);
      }
    }
  };
  validatePairs(decisions.confirmed);
  validatePairs(decisions.rejected);
  const matches = matchSpools(spools, decisions);
  const groupByRecord = new Map<string, string>();
  for (const group of matches.groups) {
    for (const spool of Object.values(group.members)) {
      groupByRecord.set(recordKey(spool), group.id);
    }
  }
  for (const pair of decisions.confirmed) {
    const [a, b] = splitPairKey(pair)!;
    if (groupByRecord.get(a) !== groupByRecord.get(b))
      throw new Error(
        `Could not confirm ${a},${b}: the match conflicts with other records from the same source. Review your --confirm choices and cross-IDs.`,
      );
  }
  for (const pair of decisions.rejected) {
    const [a, b] = splitPairKey(pair)!;
    if (groupByRecord.get(a) === groupByRecord.get(b))
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
  const unresolved: Array<{ group: string; field: string }> = [];
  for (const group of matches.groups) {
    const resolvedValues = resolutions.get(group.id)?.values;
    for (const comparison of compareGroup(group)) {
      if (
        comparison.kind === "conflict" &&
        (!resolvedValues || !(comparison.field in resolvedValues))
      ) {
        unresolved.push({ group: group.id, field: comparison.field });
      }
    }
  }
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
    unresolved,
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
