import { COMPARABLE_FIELDS, type CommonSpool, type ComparableField } from "../model";
import { FIELD_LABELS, SOURCE_FIELDS } from "./fields";
import { formatValue, valuesEqual } from "./values";

/** Fields shown when judging whether two records are the same spool, in display order. */
export const PAIR_FIELDS = [
  "vendor",
  "material",
  "colors",
  "name",
  "remainingWeight",
  "initialWeight",
  "location",
  "purchasedOn",
] as const satisfies readonly ComparableField[];

/**
 * Same: equal as a person would judge it (see `valuesEqual`). differs: the values disagree.
 * unsupported: a side's service has no place for the field, so it cannot be compared.
 */
export type PairStatus = "same" | "differs" | "unsupported";

export interface PairRow {
  field: ComparableField;
  label: string;
  left: string;
  right: string;
  status: PairStatus;
}

/** A field-by-field comparison of two records; used to review a possible match. */
export function comparePair(a: CommonSpool, b: CommonSpool): PairRow[] {
  return PAIR_FIELDS.filter((field) => COMPARABLE_FIELDS.includes(field)).map((field) => {
    const aStored = SOURCE_FIELDS[a.source].has(field);
    const bStored = SOURCE_FIELDS[b.source].has(field);
    const status: PairStatus =
      aStored && bStored
        ? valuesEqual(field, a[field], b[field])
          ? "same"
          : "differs"
        : "unsupported";
    return {
      field,
      label: FIELD_LABELS[field],
      left: aStored ? formatValue(field, a[field]) : "Not stored",
      right: bStored ? formatValue(field, b[field]) : "Not stored",
      status,
    };
  });
}
