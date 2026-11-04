import { csvText } from "../../adapters/shared/tabular";
import type { FieldValue } from "../comparison/types";
import { SOURCE_LABELS } from "../model";
import type { ReferenceItem } from "./types";

/** Spreadsheets read cells starting with these characters as formulas; inventory text is untrusted. */
const safe = (value: string): string => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

const cell = (value: FieldValue): string =>
  value === null ? "" : Array.isArray(value) ? value.join("; ") : String(value);

export const REFERENCE_CSV_COLUMNS = [
  "service",
  "spool_id",
  "spool",
  "match",
  "reference",
  "provider",
  "field",
  "current",
  "reference_value",
  "action",
  "confidence",
  "can_apply",
  "reason",
  "source_link",
] as const;

/**
 * The reviewed spools as CSV, one line per field that differs or could be filled, so the changes
 * can be checked in a spreadsheet before anything is accepted. A spool with nothing to change still
 * gets one line saying how it matched, so the file also shows what was left alone.
 */
export function referenceCsv(
  items: readonly ReferenceItem[],
  spoolLabel: (spoolKey: string) => string,
): string {
  const rows: Record<string, unknown>[] = [];
  for (const item of items) {
    const reference = item.selected?.reference ?? null;
    const base = {
      service: SOURCE_LABELS[item.source],
      spool_id: safe(item.sourceId),
      spool: safe(spoolLabel(item.spoolKey)),
      match: item.chosen && !item.selected ? "ruled out" : item.match.status,
      reference: safe(
        reference
          ? [reference.vendor, reference.material, reference.name, reference.colorName]
              .filter(Boolean)
              .join(" ") || reference.id
          : "",
      ),
      provider: reference?.providerLabel ?? "",
      source_link: reference?.sourceUrl ?? reference?.url ?? "",
    };
    const changes = item.diffs.filter((diff) => diff.status !== "same");
    if (!changes.length) {
      rows.push({
        ...base,
        field: "",
        current: "",
        reference_value: "",
        action: reference ? "in sync" : "none",
        confidence: "",
        can_apply: "",
        reason: item.match.note ?? "",
      });
      continue;
    }
    for (const diff of changes) {
      const proposal = item.proposals.find((candidate) => candidate.field === diff.field);
      rows.push({
        ...base,
        field: diff.field,
        current: safe(cell(diff.spoolValue)),
        reference_value: safe(cell(diff.referenceValue)),
        action: proposal ? proposal.kind : "kept",
        confidence: proposal?.confidence ?? "",
        can_apply: proposal ? (proposal.applicable ? "yes" : "no") : "",
        reason: safe(proposal?.reason ?? "Differs, but overwriting is off for this field."),
      });
    }
  }
  // One fixed column order, whatever order each row was built in.
  return csvText(
    rows.map((row) =>
      Object.fromEntries(REFERENCE_CSV_COLUMNS.map((column) => [column, row[column] ?? ""])),
    ),
    REFERENCE_CSV_COLUMNS,
  );
}
