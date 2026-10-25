import type { CommonSpool } from "../../core/model";
import { toDate, toNumber, toText, uniqueHexes } from "../../core/normalize";
import type { FiladexRecord } from "./types";

/** `"200-220"`, `"210°C"` and `"215"` are all seen in the wild. */
export function parseTemp(value: unknown): { min: number | null; max: number | null } {
  const numbers = (toText(value) ?? "").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (!numbers.length) return { min: null, max: null };
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

export function tempText(min: number | null, max: number | null): string {
  if (min === null && max === null) return "";
  return min === null || max === null || min === max ? String(min ?? max) : `${min}-${max}`;
}

export const round2 = (value: number) => Math.round(value * 100) / 100;

export function mapRecord(record: FiladexRecord, index: number): CommonSpool {
  const id =
    record["id"] != null && record["id"] !== "" ? String(record["id"]) : `row-${index + 1}`;
  const kg = toNumber(record["totalWeight"]);
  const initial = kg !== null && kg > 0 ? round2(kg * 1000) : null;
  const percentage = toNumber(record["remainingPercentage"]);
  const temp = parseTemp(record["printTemp"]);
  return {
    source: "filadex",
    sourceId: id,
    crossIds: { filadexId: id },
    vendor: toText(record["manufacturer"]),
    material: toText(record["material"]),
    name: toText(record["colorName"]),
    colors: uniqueHexes([record["colorCode"]]),
    diameter: toNumber(record["diameter"]),
    density: null,
    nozzleTempMin: temp.min,
    nozzleTempMax: temp.max,
    bedTempMin: null,
    bedTempMax: null,
    upc: toText(record["barcode"]),
    initialWeight: initial,
    remainingWeight: initial === null ? null : round2(initial * ((percentage ?? 100) / 100)),
    emptySpoolWeight: null,
    location: toText(record["storageLocation"]),
    price: toNumber(record["purchasePrice"]),
    purchasedOn: toDate(record["purchaseDate"]),
    lotNr: null,
    comment: null,
    archived: false,
    raw: record,
  };
}
