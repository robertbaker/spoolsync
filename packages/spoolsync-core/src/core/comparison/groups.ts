import { recordKey } from "../matching/keys";
import type { SpoolGroup } from "../matching/types";
import { isBroaderMaterial } from "../material";
import { SOURCE_IDS, COMPARABLE_FIELDS, type ComparableField, type SourceId } from "../model";
import { SOURCE_FIELDS } from "./fields";
import type { RecordEdits } from "./record-edits";
import type {
  FieldValue,
  FieldOption,
  FieldComparison,
  GroupResolution,
  SpoolValues,
} from "./types";
import { clusterByTolerance, hasTolerance, isBlank, valuesEqual } from "./values";

export function presentSources(group: SpoolGroup): SourceId[] {
  const present: SourceId[] = [];
  for (const source of SOURCE_IDS) {
    if (group.members[source]) present.push(source);
  }
  return present;
}

/** Every field where the group's members differ or some are blank. Matching fields are left out. */
export function compareGroup(group: SpoolGroup): FieldComparison[] {
  const sources = presentSources(group);
  if (sources.length < 2) return [];
  // The Sync page asks about the same group many times per render. Matching rebuilds groups, so an
  // answer is reused while the group's member records are the same objects. Callers must treat the
  // result as read-only.
  const members = sources.map((source) => group.members[source]);
  const cached = comparisonCache.get(group);
  if (
    cached &&
    cached.members.length === members.length &&
    cached.members.every((member, index) => member === members[index])
  )
    return cached.comparisons;
  const comparisons = compareMembers(group, sources);
  comparisonCache.set(group, { members, comparisons });
  return comparisons;
}

const comparisonCache = new WeakMap<
  SpoolGroup,
  { members: unknown[]; comparisons: FieldComparison[] }
>();

function compareMembers(group: SpoolGroup, sources: SourceId[]): FieldComparison[] {
  const comparisons: FieldComparison[] = [];
  for (const field of COMPARABLE_FIELDS) {
    const options: FieldOption[] = [];
    const blank: SourceId[] = [];
    const present: Array<{ source: SourceId; value: FieldValue }> = [];
    let participants = 0;
    for (const source of sources) {
      const member = group.members[source]!;
      if (!SOURCE_FIELDS[source].has(field) || member.unavailable?.includes(field)) continue;
      participants++;
      const value = member[field];
      if (isBlank(value)) blank.push(source);
      else present.push({ source, value });
    }
    // Tolerant numbers are clustered in sorted order, so which options exist does not depend on
    // which service is listed first; options still appear in service order.
    const numeric =
      hasTolerance(field) && present.every((entry) => typeof entry.value === "number");
    const clusters = numeric
      ? clusterByTolerance(
          field,
          present.map((entry) => entry.value as number),
        )
      : undefined;
    const byCluster = new Map<number, FieldOption>();
    present.forEach(({ source, value }, index) => {
      const option = clusters
        ? byCluster.get(clusters[index]!)
        : options.find((candidate) => valuesEqual(field, candidate.value, value));
      if (option) {
        option.sources.push(source);
        return;
      }
      const created = { value: Array.isArray(value) ? [...value] : value, sources: [source] };
      options.push(created);
      if (clusters) byCluster.set(clusters[index]!, created);
    });
    if (participants < 2 || options.length === 0) continue;
    const richer = field === "material" ? richestOption(options) : undefined;
    if (richer) {
      // Materials that only differ in how specific they are are not a disagreement: the specific
      // one is offered as a fill-in (first option, so the default resolution takes it) and the
      // services holding a broader type get it. A specific value is never replaced by a base type.
      comparisons.push({
        field,
        kind: "fill",
        options: [richer, ...options.filter((option) => option !== richer)],
        blank,
      });
    } else if (options.length > 1) comparisons.push({ field, kind: "conflict", options, blank });
    else if (blank.length) comparisons.push({ field, kind: "fill", options, blank });
  }
  return comparisons;
}

/**
 * The one option every other option is a broader form of (PLA-Glow for PLA and PLA-Glow), or
 * undefined when the options disagree: PLA, PLA-Glow and PLA-Silk have no single richest value.
 */
function richestOption(options: FieldOption[]): FieldOption | undefined {
  if (options.length < 2) return undefined;
  return options.find((candidate) =>
    options.every(
      (other) =>
        other === candidate ||
        (typeof other.value === "string" &&
          typeof candidate.value === "string" &&
          isBroaderMaterial(other.value, candidate.value)),
    ),
  );
}

/**
 * Starting point before the user touches anything: blanks are filled from the one value that
 * exists, conflicts are left open, and nothing is created.
 */
export function defaultResolution(group: SpoolGroup): GroupResolution {
  const values: GroupResolution["values"] = {};
  for (const comparison of compareGroup(group)) {
    if (comparison.kind === "fill") values[comparison.field] = comparison.options[0]!.value;
  }
  return { values, createIn: [] };
}

export function openConflicts(group: SpoolGroup, resolution: GroupResolution): ComparableField[] {
  const result: ComparableField[] = [];
  for (const comparison of compareGroup(group)) {
    if (comparison.kind === "conflict" && !(comparison.field in resolution.values)) {
      result.push(comparison.field);
    }
  }
  return result;
}

/**
 * The full spool as it should look after the run: resolved values first, then each field from the
 * first service (in source order) that has one. Used to create the spool where it is missing.
 */
export function mergedValues(
  group: SpoolGroup,
  resolution: GroupResolution,
  recordEdits: RecordEdits = new Map(),
): SpoolValues {
  const sources = presentSources(group);
  const out = {} as Record<ComparableField, FieldValue>;
  for (const field of COMPARABLE_FIELDS) {
    if (field in resolution.values) {
      const val = resolution.values[field]!;
      out[field] = Array.isArray(val) ? [...val] : val;
      continue;
    }
    // A service that stores the field wins over one that does not: Spoolman has one temperature, so
    // its "range" is that value twice and must not replace a real range from another service.
    let found: FieldValue | undefined;
    let fallback: FieldValue | undefined;
    for (const source of sources) {
      const member = group.members[source]!;
      const stored = SOURCE_FIELDS[source].has(field) && !member.unavailable?.includes(field);
      if (field === "archived" && !stored) continue;
      const edited = recordEdits.get(recordKey(member))?.[field];
      const value = edited !== undefined ? edited : member[field];
      if (isBlank(value)) continue;
      if (stored) {
        found = value;
        break;
      }
      fallback ??= value;
    }
    found ??= fallback;
    if (field === "material" && typeof found === "string") found = richestMaterial(group, found);
    if (found !== undefined) {
      out[field] = Array.isArray(found) ? [...found] : found;
    } else {
      out[field] = field === "archived" ? false : field === "colors" ? [] : null;
    }
  }
  return out as SpoolValues;
}

/** The most specific material any record holds, when `found` is only a broader form of it. */
function richestMaterial(group: SpoolGroup, found: string): string {
  let best = found;
  for (const source of presentSources(group)) {
    const material = group.members[source]!.material;
    if (typeof material === "string" && isBroaderMaterial(best, material)) best = material;
  }
  return best;
}
