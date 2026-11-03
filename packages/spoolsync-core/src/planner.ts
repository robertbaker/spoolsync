import {
  BULK_EDIT_KEYS,
  buildPlan,
  sanitizeBulkEdit,
  type BulkEdit,
  compareGroup,
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
  type ComparableField,
  type SourceId,
  type WritableSourceId,
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

/**
 * IDs of every group this one could have grown from. At most one member per source: enumerate its
 * possible ancestor groups (at most 127). Splitting the group ID is unsafe because native record
 * IDs may themselves contain '+'.
 */
function ancestorGroupIds(group: SpoolGroup): Set<string> {
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
  return ancestorIds;
}

/**
 * Carries bulk edits over to the current groups. An edit follows its group when it grows; when
 * several groups merge, a part is kept only if every contributing edit agrees on it. Edits for
 * groups that no longer exist are dropped.
 */
export function reconcileBulkEdits(
  groups: SpoolGroup[],
  previous: ReadonlyMap<string, BulkEdit>,
): Map<string, BulkEdit> {
  const next = new Map<string, BulkEdit>();
  for (const group of groups) {
    const kept = previous.get(group.id);
    if (kept) {
      next.set(group.id, { ...kept });
      continue;
    }
    const ancestors = ancestorGroupIds(group);
    const contributors = [...previous].filter(([id]) => ancestors.has(id)).map(([, edit]) => edit);
    if (!contributors.length) continue;
    const merged: Record<string, unknown> = {};
    for (const key of BULK_EDIT_KEYS) {
      const values = contributors.map((edit) => edit[key]);
      if (values.every((value) => value !== undefined && value === values[0]))
        merged[key] = values[0];
    }
    const edit = sanitizeBulkEdit(merged);
    if (edit) next.set(group.id, edit);
  }
  return next;
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
    const ancestorIds = ancestorGroupIds(group);
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

/**
 * Resolutions from the CLI's global choices: `--resolve field=source` takes that source's value for
 * every group that has one, and `--create-in` adds every spool a service lacks. Shared so the
 * website can check what a CLI command would plan.
 */
export function resolutionsFromChoices(
  groups: SpoolGroup[],
  resolves: ReadonlyArray<readonly [ComparableField, SourceId]>,
  createIn: readonly WritableSourceId[],
): Map<string, GroupResolution> {
  const resolutions = new Map<string, GroupResolution>();
  for (const group of groups) {
    const resolution = ensureResolution(resolutions, group);
    for (const [field, source] of resolves) {
      const comparison = compareGroup(group).find((item) => item.field === field);
      const option = comparison?.options.find((candidate) => candidate.sources.includes(source));
      if (option) resolution.values[field] = option.value;
    }
    for (const source of createIn) if (!group.members[source]) resolution.createIn.push(source);
  }
  return resolutions;
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
  edits: ReadonlyMap<string, BulkEdit> = new Map(),
): Map<SourceId, PlannedChange[]> {
  const pendingGroupIds = new Set(suggestions.flatMap((suggestion) => suggestion.groupIds));
  return buildPlan(groups, resolutions, pendingGroupIds, edits);
}

export function findMatches(spools: CommonSpool[], decisions: MatchDecisions): MatchResult {
  return matchSpools(spools, decisions);
}
