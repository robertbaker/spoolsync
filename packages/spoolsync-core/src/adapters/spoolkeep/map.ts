import type { CommonSpool } from "../../core/model";
import { toHex, toPositiveNumber, toText } from "../../core/normalize";
import type { SpoolKeepRecord } from "./schema";

export type SpoolKeepCondition = "new" | "used" | "none";

/** SpoolKeep stores a colour name, or occasionally a hex code, in the same `color` field. */
function colorFields(value: string | null | undefined): { name: string | null; colors: string[] } {
  const text = toText(value);
  const hex = text && /^#?[0-9a-f]{6}$/i.test(text) ? toHex(text) : null;
  return { name: text, colors: hex ? [hex] : [] };
}

/**
 * Maps one stock entry. `index` is 1-based within the entry's expanded spools and `count` is how
 * many spools the entry expands to; a count of 1 keeps the backup's own ID.
 */
export function spoolKeepToCommon(
  record: SpoolKeepRecord,
  condition: SpoolKeepCondition,
  index: number,
  count: number,
): CommonSpool {
  const id = count === 1 ? record.id : `${record.id}:${condition}-${index}`;
  const { name, colors } = colorFields(record.color);
  return {
    source: "spoolkeep",
    sourceId: id,
    crossIds: { spoolkeepId: id },
    vendor: toText(record.brand),
    material: toText(record.exactType) ?? toText(record.family),
    name,
    colors,
    diameter: toPositiveNumber(record.diameter),
    density: null,
    nozzleTempMin: toPositiveNumber(record.nozzleTempMin),
    nozzleTempMax: toPositiveNumber(record.nozzleTempMax),
    bedTempMin: toPositiveNumber(record.bedTempMin),
    bedTempMax: toPositiveNumber(record.bedTempMax),
    upc: toText(record.reference),
    initialWeight: null,
    remainingWeight: null,
    emptySpoolWeight: null,
    location: null,
    price: record.price != null && record.price >= 0 ? record.price : null,
    purchasedOn: null,
    lotNr: null,
    comment: toText(record.note),
    archived: condition === "none",
    raw: record,
  };
}
