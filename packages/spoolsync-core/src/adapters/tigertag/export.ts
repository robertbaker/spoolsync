import type { PlannedChange } from "../../core/compare";
import { systemRuntime, type AdapterRuntime } from "../shared/runtime";
import { createdRecord, updatedRecords, utf8Slice } from "./records";
import { diameterFromId, diameterId } from "./reference";
import type { TigertagLoadResult, TtagRecord } from "./schema";

/** Drops SpoolSync's own bookkeeping keys (`__docId`) before a record leaves the app. */
const withoutInternal = (record: TtagRecord): TtagRecord =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith("__"))) as TtagRecord;

export interface TtagExportResult {
  json: string;
  updated: number;
  created: number;
  /** Records in the file (a twin counts twice). */
  records: number;
  /** False when Studio will import the file as new copies rather than update in place. */
  restoresInPlace: boolean;
  warnings: string[];
}

/**
 * A `.ttag` holding only what changed: updated materials (both records of a twin, as Studio
 * requires) and new ones. Studio's Restore rewrites just these documents and leaves the rest of the
 * inventory alone. Chip backups for included records travel with them.
 */
export function exportTtag(
  loaded: TigertagLoadResult,
  changes: PlannedChange[],
  runtime: AdapterRuntime = systemRuntime,
): TtagExportResult {
  const records: TtagRecord[] = [];
  const warnings: string[] = [];
  let updated = 0;
  let created = 0;
  for (const change of changes) {
    if (change.source !== "tigertag") continue;
    const values =
      change.kind === "create"
        ? change.values
        : Object.fromEntries(change.changes.map((item) => [item.field, item.to]));
    const label =
      change.kind === "create" ? (change.values.name ?? change.groupId) : change.spool.sourceId;
    const diameter = values.diameter;
    if (typeof diameter === "number" && diameter !== 1.75 && diameter !== 2.85)
      warnings.push(
        `TigerTag ${label}: diameter ${diameter} mm was exported as ${diameterFromId(diameterId(diameter))} mm; the chip format supports only 1.75 mm and 2.85 mm.`,
      );
    if (typeof values.name === "string" && utf8Slice(values.name, 28) !== values.name)
      warnings.push(
        `TigerTag ${label}: the color name was shortened to the chip format's 28-byte limit.`,
      );
    if (typeof values.comment === "string" && Array.from(values.comment).length > 500)
      warnings.push(`TigerTag ${label}: notes were shortened to the format's 500-character limit.`);
    if (change.kind === "update") {
      for (const record of updatedRecords(change)) {
        const clean = withoutInternal(record) as Record<string, unknown>;
        delete clean["deleted"];
        delete clean["deleted_at"];
        records.push(clean as TtagRecord);
      }
      updated++;
    } else {
      records.push(createdRecord(change, runtime));
      created++;
    }
  }

  const backups = loaded.file.rfidBackups ?? {};
  const rfidBackups = Object.fromEntries(
    records.flatMap((record) => (record.uid in backups ? [[record.uid, backups[record.uid]]] : [])),
  );
  const file = {
    format: "tigertag",
    kind: "ttag",
    version: 1,
    exportedAt: new Date(runtime.now()).toISOString(),
    exportedBy: loaded.file.exportedBy ?? null,
    records,
    ...(Object.keys(rfidBackups).length ? { rfidBackups } : {}),
  };
  return {
    json: `${JSON.stringify(file, null, 2)}\n`,
    updated,
    created,
    records: records.length,
    restoresInPlace: Boolean(loaded.file.exportedBy),
    warnings,
  };
}
