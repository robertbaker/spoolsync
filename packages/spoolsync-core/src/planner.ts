import {
  BULK_EDIT_KEYS,
  buildPlan,
  sanitizeBulkEdit,
  type BulkEdit,
  compareGroup,
  defaultResolution,
  SOURCE_FIELDS,
  valuesEqual,
  type GroupResolution,
  type PlannedChange,
  type RecordEdits,
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

type HeldValues = NonNullable<GroupResolution["seen"]>[ComparableField];

/** What each member that stores `field` holds for it now. */
function heldValues(group: SpoolGroup, field: ComparableField): HeldValues {
  const held: NonNullable<HeldValues> = {};
  for (const [source, member] of Object.entries(group.members) as Array<[SourceId, CommonSpool]>)
    if (SOURCE_FIELDS[source].has(field)) held[source] = structuredClone(member[field]);
  return held;
}

/** Notes what the services hold for each newly chosen field, for `reconcileResolutions` to check. */
export function withResolutionBasis(
  group: SpoolGroup,
  resolution: GroupResolution,
): GroupResolution {
  const seen: NonNullable<GroupResolution["seen"]> = {};
  for (const key in resolution.values) {
    const field = key as ComparableField;
    seen[field] = resolution.seen?.[field] ?? heldValues(group, field);
  }
  return { ...resolution, seen };
}

export function ensureResolution(
  resolutions: Map<string, GroupResolution>,
  group: SpoolGroup,
): GroupResolution {
  let resolution = resolutions.get(group.id);
  if (!resolution) {
    resolution = withResolutionBasis(group, defaultResolution(group));
    resolutions.set(group.id, resolution);
  }
  return resolution;
}

/**
 * Drops chosen values the services have moved on from. A service that now holds the chosen value is
 * a finished write, not a change; any other new value means the choice was made against old data,
 * so the field goes back to its default instead of overwriting what the service holds now.
 */
function withoutStaleValues(group: SpoolGroup, resolution: GroupResolution): GroupResolution {
  const values = structuredClone(resolution.values);
  const seen: NonNullable<GroupResolution["seen"]> = {};
  let fills: GroupResolution["values"] | undefined;
  for (const key in values) {
    const field = key as ComparableField;
    const chosen = values[field]!;
    const moved = (Object.entries(resolution.seen?.[field] ?? {}) as Array<[SourceId, never]>).some(
      ([source, before]) => {
        const member = group.members[source];
        return (
          member !== undefined &&
          !valuesEqual(field, member[field], before, source) &&
          !valuesEqual(field, member[field], chosen, source)
        );
      },
    );
    if (moved) {
      fills ??= defaultResolution(group).values;
      if (!(field in fills)) {
        delete values[field];
        continue;
      }
      values[field] = fills[field]!;
    }
    seen[field] = heldValues(group, field);
  }
  return { ...resolution, values, seen };
}

/**
 * IDs of every group this one could have grown from. At most one member per source: enumerate its
 * possible ancestor groups (at most 2^14 - 1 with the 14 sources). Splitting the group ID is unsafe
 * because native record IDs may themselves contain '+'.
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
    const contributors = previous
      .entries()
      .filter(([id]) => ancestors.has(id))
      .map(([, edit]) => edit)
      .toArray();
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

/**
 * Keeps prior choices when a group grows after a spool is added or a match is confirmed, except
 * those the services' data has since overtaken.
 */
export function reconcileResolutions(
  groups: SpoolGroup[],
  previous: ReadonlyMap<string, GroupResolution>,
): Map<string, GroupResolution> {
  const next = new Map<string, GroupResolution>();
  for (const group of groups) {
    const kept = previous.get(group.id);
    if (kept) {
      next.set(group.id, {
        ...withoutStaleValues(group, kept),
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
      const seen: NonNullable<GroupResolution["seen"]> = {};
      for (const field of COMPARABLE_FIELDS) {
        const choices = contributors.filter((resolution) => field in resolution.values);
        if (!choices.length) continue;
        const value = choices[0]!.values[field];
        if (
          choices.every((choice) => JSON.stringify(choice.values[field]) === JSON.stringify(value))
        ) {
          merged.values[field] = structuredClone(value);
          seen[field] = Object.assign({}, ...choices.map((choice) => choice.seen?.[field]));
        } else delete merged.values[field];
      }
      merged.seen = seen;
      merged.createIn = [
        ...new Set(contributors.flatMap((resolution) => resolution.createIn)),
      ].filter((source) => WRITABLE_SOURCE_IDS.includes(source) && !group.members[source]);
      next.set(group.id, withoutStaleValues(group, merged));
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
    const comparisons = resolves.length ? compareGroup(group) : [];
    for (const [field, source] of resolves) {
      const comparison = comparisons.find((item) => item.field === field);
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

/** `decideMatch` for many suggestions at once, in one pass instead of one array copy per pair. */
export function decideMatches(
  decisions: MatchDecisions,
  suggestions: readonly MatchSuggestion[],
  same: boolean,
): MatchDecisions {
  const selected = new Set(same ? decisions.confirmed : decisions.rejected);
  const opposite = new Set(same ? decisions.rejected : decisions.confirmed);
  for (const suggestion of suggestions) {
    const pair = pairKey(...suggestion.pair);
    selected.add(pair);
    opposite.delete(pair);
  }
  return same
    ? { confirmed: [...selected], rejected: [...opposite] }
    : { confirmed: [...opposite], rejected: [...selected] };
}

export function planSync(
  groups: SpoolGroup[],
  resolutions: ReadonlyMap<string, GroupResolution>,
  suggestions: MatchSuggestion[],
  edits: ReadonlyMap<string, BulkEdit> = new Map(),
  recordEdits: RecordEdits = new Map(),
): Map<SourceId, PlannedChange[]> {
  const pendingGroupIds = new Set(suggestions.flatMap((suggestion) => suggestion.groupIds));
  return buildPlan(groups, resolutions, pendingGroupIds, edits, recordEdits);
}

export function findMatches(spools: CommonSpool[], decisions: MatchDecisions): MatchResult {
  return matchSpools(spools, decisions);
}

let lastMatch: {
  spools: CommonSpool[];
  spoolSet: ReadonlySet<CommonSpool>;
  decisions: MatchDecisions;
  result: MatchResult;
} | null = null;

const sameItems = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * `findMatches` for callers that only read the match (the Sync session, charts, counts, drawers)
 * and ask repeatedly with the same inventory. The last answer is reused while the records (by
 * identity; matching sorts them, so order does not matter, and duplicate records throw before
 * anything is cached) and the saved decisions (by content) are unchanged, so records must be
 * replaced rather than edited in place between calls. The returned result is shared: do not mutate
 * it. A caller that needs its own match to change should use `findMatches`.
 */
export function findMatchesCached(spools: CommonSpool[], decisions: MatchDecisions): MatchResult {
  // The same object twice would pass the membership check below for a different inventory; it is
  // a duplicate record, which matchSpools rejects.
  const unique = new Set(spools).size === spools.length;
  if (
    unique &&
    lastMatch &&
    lastMatch.spools.length === spools.length &&
    spools.every((spool) => lastMatch!.spoolSet.has(spool)) &&
    sameItems(lastMatch.decisions.confirmed, decisions.confirmed) &&
    sameItems(lastMatch.decisions.rejected, decisions.rejected)
  )
    return lastMatch.result;
  const result = matchSpools(spools, decisions);
  lastMatch = {
    spools: [...spools],
    spoolSet: new Set(spools),
    decisions: { confirmed: [...decisions.confirmed], rejected: [...decisions.rejected] },
    result,
  };
  return result;
}
