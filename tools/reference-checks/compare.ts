import { valuesEqual } from "../../packages/spoolsync-core/src/core/compare";
import { COMPARABLE_FIELDS, type CommonSpool } from "../../packages/spoolsync-core/src/core/model";

export function stable(value: unknown, omitNull = false): unknown {
  if (Array.isArray(value)) return value.map((item) => stable(item, omitNull));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => !omitNull || item != null)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item, omitNull)]),
    );
  return value;
}

function recordMetadata(spool: CommonSpool): unknown {
  if (spool.source !== "tigertag") return spool.raw;
  const raw = spool.raw as { records: Array<Record<string, unknown>> };
  // Restored TigerTag records deliberately omit deletion markers and internal cloud IDs.
  return {
    ...raw,
    records: raw.records.map((record) =>
      Object.fromEntries(
        Object.entries(record).filter(
          ([key]) => !key.startsWith("__") && key !== "deleted" && key !== "deleted_at",
        ),
      ),
    ),
  };
}

export function compare(
  before: CommonSpool[],
  after: CommonSpool[],
  label: string,
  raw = false,
  identities = true,
): void {
  if (before.length !== after.length)
    throw new Error(`${label}: spool count changed from ${before.length} to ${after.length}`);
  const byId = new Map(after.map((spool) => [spool.sourceId, spool]));
  for (const [index, spool] of before.entries()) {
    const other = identities ? byId.get(spool.sourceId) : after[index];
    if (!other) throw new Error(`${label}: a spool ID was lost`);
    for (const field of COMPARABLE_FIELDS) {
      if (!valuesEqual(field, spool[field], other[field]))
        throw new Error(`${label}: ${field} changed during the round trip`);
    }
    const keys = new Set([...Object.keys(spool.crossIds), ...Object.keys(other.crossIds)]);
    for (const key of identities ? keys : []) {
      const link = key as keyof typeof spool.crossIds;
      if (spool.crossIds[link] !== other.crossIds[link])
        throw new Error(`${label}: ${key} link changed during the round trip`);
    }
    if (
      raw &&
      JSON.stringify(stable(recordMetadata(spool))) !==
        JSON.stringify(stable(recordMetadata(other)))
    )
      throw new Error(`${label}: original record metadata changed during an unchanged export`);
  }
}
