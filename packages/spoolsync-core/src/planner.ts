import {
  buildPlan,
  defaultResolution,
  type GroupResolution,
  type PlannedChange,
} from "./core/compare";
import {
  matchSpools,
  groupKey,
  pairKey,
  recordKey,
  type MatchDecisions,
  type MatchResult,
  type MatchSuggestion,
  type SpoolGroup,
} from "./core/match";
import {
  COMPARABLE_FIELDS,
  WRITABLE_SOURCE_IDS,
  type CommonSpool,
  type SourceId,
} from "./core/model";

export function ensureResolution(
  resolutions: Map<string, GroupResolution>,
  group: SpoolGroup,
): GroupResolution {
  let resolution = resolutions.get(group.id);
  if (!resolution) {
    resolution = defaultResolution(group);
    resolutions.set(group.id, resolution);
  }
  return resolution;
}

/** Keeps prior choices when a group grows after a spool is added or a match is confirmed. */
export function reconcileResolutions(
  groups: SpoolGroup[],
  previous: ReadonlyMap<string, GroupResolution>,
): Map<string, GroupResolution> {
  const next = new Map<string, GroupResolution>();
  for (const group of groups) {
    const kept = previous.get(group.id);
    if (kept) {
      next.set(group.id, {
        ...kept,
        values: structuredClone(kept.values),
        createIn: kept.createIn.filter(
          (source) => WRITABLE_SOURCE_IDS.includes(source) && !group.members[source],
        ),
      });
      continue;
    }
    // At most one member per source: enumerate its possible ancestor groups (at most 127).
    // Splitting the group ID is unsafe because native record IDs may themselves contain '+'.
    const ancestorIds = new Set([""]);
    for (const key of Object.values(group.members)
      .map((spool) => groupKey([recordKey(spool)]))
      .sort()) {
      // Snapshot before inserting; iterating the live Set would revisit newly added subsets.
      const previousAncestors = Array.from(ancestorIds);
      for (const ancestor of previousAncestors)
        ancestorIds.add(ancestor ? `${ancestor}+${key}` : key);
    }
    ancestorIds.delete("");
    const contributors: GroupResolution[] = [];
    for (const [id, resolution] of previous) {
      if (ancestorIds.has(id)) contributors.push(resolution);
    }
    if (contributors.length) {
      const merged = defaultResolution(group);
      for (const field of COMPARABLE_FIELDS) {
        const choices = contributors.filter((resolution) => field in resolution.values);
        if (!choices.length) continue;
        const value = choices[0]!.values[field];
        if (
          choices.every((choice) => JSON.stringify(choice.values[field]) === JSON.stringify(value))
        )
          merged.values[field] = structuredClone(value);
        else delete merged.values[field];
      }
      merged.createIn = [
        ...new Set(contributors.flatMap((resolution) => resolution.createIn)),
      ].filter((source) => WRITABLE_SOURCE_IDS.includes(source) && !group.members[source]);
      next.set(group.id, merged);
    }
  }
  return next;
}

export function decideMatch(
  decisions: MatchDecisions,
  suggestion: MatchSuggestion,
  same: boolean,
): MatchDecisions {
  const pair = pairKey(...suggestion.pair);
  const selected = same ? decisions.confirmed : decisions.rejected;
  const opposite = same ? decisions.rejected : decisions.confirmed;
  if (selected.includes(pair) && !opposite.includes(pair)) return decisions;
  const next = selected.includes(pair) ? selected : [...selected, pair];
  const cleared = opposite.filter((candidate) => candidate !== pair);
  return same ? { confirmed: next, rejected: cleared } : { confirmed: cleared, rejected: next };
}

export function planSync(
  groups: SpoolGroup[],
  resolutions: ReadonlyMap<string, GroupResolution>,
  suggestions: MatchSuggestion[],
): Map<SourceId, PlannedChange[]> {
  const pendingGroupIds = new Set(suggestions.flatMap((suggestion) => suggestion.groupIds));
  return buildPlan(groups, resolutions, pendingGroupIds);
}

export function findMatches(spools: CommonSpool[], decisions: MatchDecisions): MatchResult {
  return matchSpools(spools, decisions);
}
