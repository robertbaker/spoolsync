import type { SpoolGroup } from "../match";
import { SOURCE_IDS, COMPARABLE_FIELDS, type ComparableField, type SourceId } from "../model";
import { SOURCE_FIELDS } from "./fields";
import type {
  FieldValue,
  FieldOption,
  FieldComparison,
  GroupResolution,
  SpoolValues,
} from "./types";
import { isBlank, valuesEqual } from "./values";

export function presentSources(group: SpoolGroup): SourceId[] {
  return SOURCE_IDS.filter((source) => group.members[source]);
}

/** Every field where the group's members differ or some are blank. Matching fields are left out. */
export function compareGroup(group: SpoolGroup): FieldComparison[] {
  const sources = presentSources(group);
  if (sources.length < 2) return [];
  const comparisons: FieldComparison[] = [];
  for (const field of COMPARABLE_FIELDS) {
    const options: FieldOption[] = [];
    const blank: SourceId[] = [];
    let participants = 0;
    for (const source of sources) {
      if (!SOURCE_FIELDS[source].has(field)) continue;
      participants++;
      const value = group.members[source]![field];
      if (isBlank(value)) {
        blank.push(source);
        continue;
      }
      const option = options.find((candidate) => valuesEqual(field, candidate.value, value));
      if (option) option.sources.push(source);
      else options.push({ value: Array.isArray(value) ? [...value] : value, sources: [source] });
    }
    if (participants < 2 || options.length === 0) continue;
    if (options.length > 1) comparisons.push({ field, kind: "conflict", options, blank });
    else if (blank.length) comparisons.push({ field, kind: "fill", options, blank });
  }
  return comparisons;
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
  return compareGroup(group)
    .filter(
      (comparison) => comparison.kind === "conflict" && !(comparison.field in resolution.values),
    )
    .map((comparison) => comparison.field);
}

/**
 * The full spool as it should look after the run: resolved values first, then each field from the
 * first service (in source order) that has one. Used to create the spool where it is missing.
 */
export function mergedValues(group: SpoolGroup, resolution: GroupResolution): SpoolValues {
  const sources = presentSources(group);
  const out = {} as Record<ComparableField, FieldValue>;
  for (const field of COMPARABLE_FIELDS) {
    if (field in resolution.values) {
      out[field] = resolution.values[field]!;
      continue;
    }
    const found = sources
      .map((source) => group.members[source]![field])
      .find((value) => !isBlank(value));
    out[field] = found ?? (field === "archived" ? false : field === "colors" ? [] : null);
  }
  return structuredClone(out) as SpoolValues;
}
