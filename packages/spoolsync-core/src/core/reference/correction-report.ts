import { FIELD_LABELS } from "../comparison/fields";
import { formatValue } from "../comparison/values";
import type { ReferenceField, ReferenceFilament, ReferenceItem } from "./types";

/**
 * A difference between a spool and the catalog record it was matched to, worded so it can be sent
 * to the catalog's maintainers.
 */
export interface CorrectionPoint {
  field: ReferenceField | "color";
  /** What the catalog says. */
  catalog: string;
  /** What the person's spools say; several spools may disagree with the record in the same way. */
  spools: Array<{ value: string; count: number }>;
}

export interface CorrectionRecord {
  reference: ReferenceFilament;
  points: CorrectionPoint[];
}

export interface CorrectionReport {
  /** Markdown, ready to paste into an issue or an email. Empty when there is nothing to report. */
  markdown: string;
  /** Records with at least one difference. */
  records: number;
  /** Differences in all. */
  points: number;
  /** Provider names the differences concern, in the order they appear. */
  providers: string[];
}

const title = (reference: ReferenceFilament) =>
  [reference.vendor, reference.material, reference.name, reference.colorName]
    .filter(Boolean)
    .join(" ") || reference.id;

/** Same orderings as `localeCompare` with defaults and with "en", without per-call setup. */
const FIELD_COLLATOR = new Intl.Collator();
const TITLE_COLLATOR = new Intl.Collator("en");

const hash = (hex: string) => `#${hex}`;

/**
 * The differences between loaded spools and the catalog records they are matched to, grouped by
 * record. Only matches that are certain count (a clear match or one a person chose), and a
 * difference where the spool simply lacks a value is not a correction. The report carries values
 * only: no spool names, ids, services, weights or prices, so nothing personal leaves the page.
 */
export function correctionRecords(items: readonly ReferenceItem[]): CorrectionRecord[] {
  type Pending = { reference: ReferenceFilament; points: Map<string, CorrectionPoint> };
  const records = new Map<string, Pending>();
  const note = (
    reference: ReferenceFilament,
    field: CorrectionPoint["field"],
    catalog: string,
    spool: string,
  ) => {
    const record: Pending = records.get(reference.id) ?? { reference, points: new Map() };
    records.set(reference.id, record);
    const point: CorrectionPoint = record.points.get(field) ?? { field, catalog, spools: [] };
    record.points.set(field, point);
    const known = point.spools.find((entry) => entry.value === spool);
    if (known) known.count += 1;
    else point.spools.push({ value: spool, count: 1 });
  };
  for (const item of items) {
    const reference = item.selected?.reference;
    if (!reference) continue;
    if (!item.chosen && item.match.status !== "matched") continue;
    for (const diff of item.diffs) {
      if (diff.status !== "differs") continue;
      if (diff.field === "colors") continue; // reported through the color check below
      // Vendor and price are how a record was found and what was paid, not facts about the filament.
      if (diff.field === "vendor" || diff.field === "price") continue;
      note(
        reference,
        diff.field,
        formatValue(diff.field, diff.referenceValue),
        formatValue(diff.field, diff.spoolValue),
      );
    }
    if (item.color && item.color.verdict === "mismatch" && !item.color.countDiffers)
      note(reference, "color", hash(item.color.referenceHex), hash(item.color.spoolHex));
  }
  return [...records.values()]
    .map(({ reference, points }) => ({
      reference,
      points: [...points.values()].sort((a, b) => FIELD_COLLATOR.compare(a.field, b.field)),
    }))
    .sort(
      (a, b) =>
        TITLE_COLLATOR.compare(title(a.reference), title(b.reference)) ||
        (a.reference.id < b.reference.id ? -1 : 1),
    );
}

const label = (field: CorrectionPoint["field"]) =>
  field === "color" ? "Color" : FIELD_LABELS[field];

export function correctionReport(items: readonly ReferenceItem[]): CorrectionReport {
  const records = correctionRecords(items);
  const points = records.reduce((total, record) => total + record.points.length, 0);
  if (!records.length) return { markdown: "", records: 0, points: 0, providers: [] };
  const byProvider = new Map<string, CorrectionRecord[]>();
  for (const record of records) {
    const name = record.reference.providerLabel;
    byProvider.set(name, [...(byProvider.get(name) ?? []), record]);
  }
  const lines: string[] = [
    "# Possible catalog corrections",
    "",
    "These differences were found by comparing a personal filament inventory with the catalog using SpoolSync. They are not verified: a spool can be a different batch or revision, or the inventory can be wrong. Please check against the product before changing anything.",
  ];
  for (const [provider, list] of byProvider) {
    lines.push("", `## ${provider}`);
    for (const record of list) {
      lines.push("", `### ${title(record.reference)}`);
      const link = record.reference.sourceUrl ?? record.reference.url;
      if (link) lines.push(link);
      lines.push("");
      for (const point of record.points) {
        const mine = point.spools
          .map((entry) =>
            entry.count > 1 ? `${entry.value} (${entry.count} spools)` : entry.value,
          )
          .join(", ");
        lines.push(
          `- **${label(point.field)}**: catalog says ${point.catalog}; my spool says ${mine}`,
        );
      }
    }
  }
  return {
    markdown: `${lines.join("\n")}\n`,
    records: records.length,
    points,
    providers: [...byProvider.keys()],
  };
}
