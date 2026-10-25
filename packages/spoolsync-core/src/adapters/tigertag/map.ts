import type { CommonSpool } from "../../core/model";
import {
  toNumber,
  toNonNegativeNumber,
  toPositiveNumber,
  toText,
  uniqueHexes,
} from "../../core/normalize";
import { brandName, diameterFromId, materialLabel } from "./reference";
import { FILAMENT_TYPE, type TtagRecord, type TigertagRaw } from "./schema";

function rgbHex(record: TtagRecord, suffix: "" | "2" | "3"): string | null {
  const channels = ["color_r", "color_g", "color_b"].map((name) => record[`${name}${suffix}`]);
  if (channels.some((value) => typeof value !== "number")) return null;
  const [r, g, b] = channels as number[];
  if (suffix && r === 0 && g === 0 && b === 0) return null; // absent second/third colour
  return [r, g, b]
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value!)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

function colors(record: TtagRecord): string[] {
  const fromBytes = uniqueHexes([rgbHex(record, ""), rgbHex(record, "2"), rgbHex(record, "3")]);
  const list = record["online_color_list"];
  const fromList = uniqueHexes(
    Array.isArray(list) ? list : typeof list === "string" ? list.split(",") : [],
  );
  if (fromList.length > fromBytes.length && fromList[0] === fromBytes[0]) return fromList;
  return fromBytes.length ? fromBytes : fromList;
}

function grams(record: TtagRecord): number | null {
  const measureGr = toPositiveNumber(record["measure_gr"]);
  if (measureGr !== null) return measureGr;
  const measure = toPositiveNumber(record["measure"]);
  if (measure !== null && record["id_unit"] === 21) return measure;
  if (measure !== null && record["id_unit"] === 35) return measure * 1000;
  return toPositiveNumber(record["capacity"]);
}

export function tigertagToCommon(records: TtagRecord[]): CommonSpool {
  const record = records[0]!;
  const spoolmanId = toNumber(record["spoolmanId"]);
  return {
    source: "tigertag",
    sourceId: record.uid,
    crossIds: { tigertagUid: record.uid, ...(spoolmanId !== null ? { spoolmanId } : {}) },
    vendor: toText(record["brand"]) ?? brandName(record["id_brand"]),
    material: toText(record["material"]) ?? materialLabel(record["id_material"]),
    name: toText(record["color_name"]) ?? toText(record["name"]),
    colors: colors(record),
    diameter: diameterFromId(record["data1"]),
    density: toPositiveNumber(record["density"]),
    nozzleTempMin: toPositiveNumber(record["data2"]),
    nozzleTempMax: toPositiveNumber(record["data3"]),
    bedTempMin: toPositiveNumber(record["data6"]),
    bedTempMax: toPositiveNumber(record["data7"]),
    upc: toText(record["barcode"]) ?? toText(record["sku"]),
    initialWeight: grams(record),
    remainingWeight: toNumber(record["weight_available"]),
    emptySpoolWeight: toNonNegativeNumber(record["container_weight"]),
    location: null,
    price: null,
    purchasedOn: null,
    lotNr: null,
    comment: toText(record["message"]),
    archived: false,
    raw: { records } satisfies TigertagRaw,
  };
}

const twinOf = (record: TtagRecord) =>
  typeof record["twin_tag_uid"] === "string"
    ? record["twin_tag_uid"]
    : typeof record["twin_uid"] === "string"
      ? record["twin_uid"]
      : undefined;

/**
 * Pairs twins (`a.twin_tag_uid === b.uid`; `twin_uid` in older cloud documents) so each material is
 * one spool.
 */
function groupTwins(records: TtagRecord[]): TtagRecord[][] {
  const byUid = new Map(records.map((record) => [record.uid, record]));
  const neighbours = new Map<string, Set<string>>();
  for (const record of records) {
    const twin = twinOf(record);
    if (!twin || !byUid.has(twin)) continue;
    for (const [a, b] of [
      [record.uid, twin],
      [twin, record.uid],
    ]) {
      const links = neighbours.get(a!) ?? new Set<string>();
      links.add(b!);
      neighbours.set(a!, links);
    }
  }
  const seen = new Set<string>();
  const groups: TtagRecord[][] = [];
  for (const record of [...records].sort((a, b) => a.uid.localeCompare(b.uid))) {
    if (seen.has(record.uid)) continue;
    const group: TtagRecord[] = [];
    const pending = [record.uid];
    while (pending.length) {
      const uid = pending.pop()!;
      if (seen.has(uid)) continue;
      seen.add(uid);
      group.push(byUid.get(uid)!);
      pending.push(...(neighbours.get(uid) ?? []));
    }
    groups.push(group);
  }
  return groups;
}

/** Filament records that are not deleted, as spools (twins paired), with warnings for the rest. */
export function recordsToSpools(records: TtagRecord[]): {
  spools: CommonSpool[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const uids = new Set<string>();
  for (const record of records) {
    if (uids.has(record.uid))
      throw new Error(
        `Duplicate TigerTag record UID "${record.uid}". Each record must have a unique UID before twin grouping.`,
      );
    uids.add(record.uid);
  }
  const usable = records.filter((record) => {
    if (record["deleted"] === true) return false;
    if (record["id_type"] !== undefined && record["id_type"] !== FILAMENT_TYPE) {
      warnings.push(
        `Record ${record.uid} is not a filament (type ${String(record["id_type"])}); skipped.`,
      );
      return false;
    }
    return true;
  });
  return { spools: groupTwins(usable).map(tigertagToCommon), warnings };
}
