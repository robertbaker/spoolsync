import type { CleanupProposal } from "@spoolsync/core/core/cleanup";
import { formatValue } from "@spoolsync/core/core/compare";
import type { ComparableField } from "@spoolsync/core/core/model";

import { formatMoney, formatWeight } from "~/lib/units";

const WEIGHT_FIELDS: readonly ComparableField[] = [
  "initialWeight",
  "remainingWeight",
  "emptySpoolWeight",
];

/**
 * A value as the person reads it: weights and prices in their chosen units, "(empty)" for none.
 * Text that was not a number yet (a price typed as "$24,99") is shown as written.
 */
export function displayValue(field: ComparableField, value: CleanupProposal["before"]): string {
  if (value === null || value === "") return "(empty)";
  if (typeof value === "number") {
    if (WEIGHT_FIELDS.includes(field)) return formatWeight(value);
    if (field === "price") return formatMoney(value);
  }
  return formatValue(field, value);
}
