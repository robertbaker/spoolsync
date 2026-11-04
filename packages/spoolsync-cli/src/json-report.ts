import type { ApplyLogEntry, SourceId } from "@spoolsync/core/core/model";
import type { InventoryChanges, InventorySummary } from "@spoolsync/core/workflow";

import type { CleanupSection } from "./cleanup";
import type { ReferenceSection } from "./reference";

/**
 * The machine-readable reports behind `--format json` (and its alias `--json`).
 *
 * The schema is versioned: `schemaVersion` changes only when a field is removed, renamed, or
 * changes meaning. New optional fields can appear without a new version, so readers should ignore
 * fields they do not know. The same document is described by `schema/report.schema.json`.
 *
 * Reports are the only thing printed to stdout; warnings, progress, and watch status lines go to
 * stderr. Lists have a fixed order (inventories by source order, pending matches and changes by
 * key), and nothing in a report is a credential: tokens and passwords are never loaded into one.
 */
export const REPORT_SCHEMA_VERSION = 1;

export type OutputFormat = "text" | "json";
export const OUTPUT_FORMATS: readonly OutputFormat[] = ["text", "json"];

/** A suggested pair that still needs a `--confirm` or `--reject` answer. */
export interface PendingMatch {
  /** The two record keys (`source:id`). */
  pair: [string, string];
  /** The value to give `--confirm` or `--reject`. */
  answerWith: string;
  score: number;
  reasons: string[];
}

interface ReportBase {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  /**
   * With `--watch`, what differs from the previous run. Present only when something changed, so
   * runs that print the same thing stay identical (and hidden by `--quiet`).
   */
  changesSinceLastRun?: InventoryChanges;
}

/** Printed when two or more inventories are compared. */
export interface CompareReport extends ReportBase {
  report: "compare";
  inventories: Partial<Record<SourceId, { file?: string; spools: number; warnings: string[] }>>;
  groups: number;
  /** The matcher's suggestions in full; `pendingMatches` is the same list in a stable shape. */
  suggestions: unknown[];
  pendingMatches: PendingMatch[];
  problems: string[];
  unresolved: Array<{ group: string; field: string }>;
  changes: Partial<Record<SourceId, { updates: number; creates: number }>>;
  plannedChanges: Partial<Record<SourceId, unknown[]>>;
  applied?: ApplyLogEntry[];
  written: string[];
  csvExport?: string;
  exportWarnings: Array<{ source: SourceId; message: string }>;
  /** With `--cleanup`: what was proposed and which safe changes joined the plan. */
  cleanup?: CleanupSection;
  /** With `--reference`: what matched, and which safe fills joined the plan. */
  reference?: ReferenceSection;
}

export interface ReorderEntry {
  service: SourceId;
  id: string;
  vendor: string | null;
  material: string | null;
  name: string | null;
  remainingGrams: number | null;
  /** Share of the full weight left, 0 to 1, or `null` when the full weight is unknown. */
  fraction: number | null;
}

/** Printed for `--summary`, `--reorder`, and `--export-csv` with nothing to compare. */
export interface InventoryReport extends ReportBase {
  report: "inventory";
  /** With `--summary`. */
  inventories?: InventorySummary[];
  /** With `--reorder`, emptiest first. */
  reorder?: ReorderEntry[];
  /** Neither `--summary` nor `--reorder`: how many spools were loaded. */
  spools?: number;
  /** With `--cleanup-report` on its own: the proposals and warnings. Nothing is applied. */
  cleanup?: CleanupSection;
  /** With `--reference-report` on its own: matches, proposals and color checks. Nothing is applied. */
  reference?: ReferenceSection;
  csvExport?: string;
  written: string[];
}

export type CliReport = CompareReport | InventoryReport;

/** Whether the arguments ask for JSON, for failures that happen before options are parsed. */
export function requestsJson(args: readonly string[]): boolean {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--json" || arg === "--format=json") return true;
    if (arg === "--format" && args[index + 1] === "json") return true;
  }
  return false;
}
