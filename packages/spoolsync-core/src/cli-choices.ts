import {
  changeParts,
  compareGroup,
  valuesEqual,
  type GroupResolution,
  type PlannedChange,
} from "./core/compare";
import type { MatchDecisions, MatchSuggestion, SpoolGroup } from "./core/match";
import {
  WRITABLE_SOURCE_IDS,
  type ComparableField,
  type SourceId,
  type WritableSourceId,
} from "./core/model";
import { planSync, resolutionsFromChoices } from "./planner";

/** The CLI options that stand in for a plan built in the browser. */
export interface CliChoices {
  resolves: Array<[ComparableField, SourceId]>;
  createIn: WritableSourceId[];
  /** Pairs as `source:id,source:id`. */
  confirm: string[];
  reject: string[];
  /** Planned changes the command would write that the plan does not contain. */
  extra: number;
  /** Planned changes in the plan that the command would not write. */
  missing: number;
}

const pairArgument = (pair: string) => pair.replace("|", ",");

/** A comparable description of what a change writes, for telling two plans apart. */
function signatures(plan: ReadonlyMap<SourceId, PlannedChange[]>): Set<string> {
  const out = new Set<string>();
  for (const changes of plan.values())
    for (const change of changes) {
      const parts = changeParts(change);
      if (change.kind === "create")
        out.add(JSON.stringify([parts[0]!.key, change.values, change.links]));
      else {
        for (const { field } of change.changes)
          out.add(
            JSON.stringify([
              parts.find((part) => part.field === field)!.key,
              change.changes.find((item) => item.field === field)!.to,
            ]),
          );
        const links = parts.find((part) => part.kind === "links");
        if (links) out.add(JSON.stringify([links.key, change.links]));
      }
    }
  return out;
}

/**
 * Finds the CLI options closest to a plan. The CLI resolves a field from one source for every spool
 * and adds missing spools everywhere it is asked to, so a plan with per-spool choices or excluded
 * changes may not be reproducible; `extra` and `missing` count the difference, and both are 0 when
 * the command plans exactly what `target` contains.
 */
export function deriveCliChoices(
  groups: SpoolGroup[],
  resolutions: ReadonlyMap<string, GroupResolution>,
  decisions: MatchDecisions,
  suggestions: MatchSuggestion[],
  target: ReadonlyMap<SourceId, PlannedChange[]>,
  loadedSources: readonly SourceId[],
): CliChoices {
  const records = new Set(
    groups.flatMap((group) =>
      Object.values(group.members).map((spool) => `${spool.source}:${spool.sourceId}`),
    ),
  );
  const known = (pair: string) => {
    const parts = pair.split("|");
    return parts.length === 2 && parts.every((key) => records.has(key) && !key.includes(","));
  };
  const resolves: Array<[ComparableField, SourceId]> = [];
  const fields = new Set(
    [...resolutions.values()].flatMap((resolution) =>
      Object.keys(resolution.values),
    ) as ComparableField[],
  );
  for (const field of fields) {
    let best: { source: SourceId; matches: number } | undefined;
    for (const source of loadedSources) {
      let matches = 0;
      for (const group of groups) {
        const chosen = resolutions.get(group.id)?.values;
        if (!chosen || !(field in chosen)) continue;
        const option = compareGroup(group)
          .find((item) => item.field === field)
          ?.options.find((candidate) => candidate.sources.includes(source));
        if (option && valuesEqual(field, option.value, chosen[field]!)) matches++;
      }
      if (matches > 0 && (!best || matches > best.matches)) best = { source, matches };
    }
    if (best) resolves.push([field, best.source]);
  }
  const createIn = WRITABLE_SOURCE_IDS.filter((source) =>
    [...resolutions.values()].some((resolution) => resolution.createIn.includes(source)),
  );
  const simulated = planSync(
    groups,
    resolutionsFromChoices(groups, resolves, createIn),
    suggestions,
  );
  const wanted = signatures(target);
  const produced = signatures(simulated);
  return {
    resolves: resolves.sort(([a], [b]) => a.localeCompare(b)),
    createIn,
    confirm: decisions.confirmed.filter(known).map(pairArgument),
    reject: decisions.rejected.filter(known).map(pairArgument),
    extra: produced.difference(wanted).size,
    missing: wanted.difference(produced).size,
  };
}
