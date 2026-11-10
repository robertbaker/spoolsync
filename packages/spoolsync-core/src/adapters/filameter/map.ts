import type { CommonSpool } from "../../core/model";
import { toNumber, toText, uniqueHexes } from "../../core/normalize";
import { cssColorHex } from "./colors";
import type { FilameterDoc } from "./types";

/** `color` is a CSS value upstream: a picker hex, or a keyword such as "red" from a CSV import. */
function filameterColors(value: unknown): string[] {
  const hexes = uniqueHexes([value]);
  if (hexes.length) return hexes;
  const named = cssColorHex(value);
  return named ? [named] : [];
}

export function isFilament(doc: unknown): doc is FilameterDoc {
  return !!doc && typeof doc === "object" && !Array.isArray(doc) && "filament" in doc;
}

export function mapDoc(doc: FilameterDoc, index: number): CommonSpool {
  const id = toText(doc._id) ?? `row-${index + 1}`;
  const rawTotal = toNumber(doc.total_weight);
  const total = rawTotal !== null && rawTotal >= 0 ? rawTotal : null;
  const rawUsed = toNumber(doc.used_weight);
  const used = rawUsed === null ? null : Math.max(0, rawUsed);
  return {
    source: "filameter",
    sourceId: id,
    crossIds: { filameterId: id },
    vendor: toText(doc.brand),
    material: toText(doc.material),
    name: toText(doc.filament),
    colors: filameterColors(doc.color),
    diameter: null,
    density: null,
    nozzleTempMin: null,
    nozzleTempMax: null,
    bedTempMin: null,
    bedTempMax: null,
    upc: null,
    initialWeight: total,
    remainingWeight: total == null ? null : Math.max(0, total - (used ?? 0)),
    emptySpoolWeight: null,
    location: toText(doc.location),
    price: toNumber(doc.price),
    purchasedOn: null,
    lotNr: null,
    finish: null,
    td: null,
    comment: toText(doc.comments),
    archived: false,
    raw: doc,
  };
}
