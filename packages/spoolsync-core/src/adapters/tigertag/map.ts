import type { CommonSpool } from "../../core/model";
import {
  toNumber,
  toNonNegativeNumber,
  toPositiveNumber,
  toText,
  uniqueHexes,
} from "../../core/normalize";
import { aspectLabel, brandName, diameterFromId, materialLabel } from "./reference";
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

export function grams(record: TtagRecord): number | null {
  const measureGr = toPositiveNumber(record["measure_gr"]);
  if (measureGr !== null) return measureGr;
  const measure = toPositiveNumber(record["measure"]);
  if (measure !== null && record["id_unit"] === 21) return measure;
  if (measure !== null && record["id_unit"] === 35) return measure * 1000;
  return toPositiveNumber(record["capacity"]);
}

const objectOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** The linked catalogue product, when Studio has synced one onto the record. */
const catalogOf = (record: TtagRecord) => objectOf(record["catalogProduct"]);

/** Chip temperature bytes are 0 when unset; the catalogue product then carries the range. */
function temperature(
  record: TtagRecord,
  key: string,
  group: "nozzle" | "bed",
  bound: "temp_min" | "temp_max",
): number | null {
  return (
    toPositiveNumber(record[key]) ?? toPositiveNumber(objectOf(catalogOf(record)[group])[bound])
  );
}

/** Aspect labels (finish), e.g. "Matte" or "Matte, Silk". */
function finishOf(record: TtagRecord): string | null {
  const catalog = objectOf(catalogOf(record)["filament"]);
  const labels = (["id_aspect1", "id_aspect2"] as const).flatMap((idKey, index) => {
    const label = aspectLabel(record[idKey]);
    if (label !== undefined) return label ? [label] : [];
    // An aspect id this app does not know: use the catalogue's own label for that slot.
    return [toText(catalog[index ? "aspect2" : "aspect1"])].filter((text) => text !== null);
  });
  return labels.length ? labels.join(", ") : null;
}

export function tigertagToCommon(records: TtagRecord[]): CommonSpool {
  const record = records[0]!;
  const spoolmanId = toNumber(record["spoolmanId"]);
  return {
    source: "tigertag",
    sourceId: record.uid,
    crossIds: {
      tigertagUid: record.uid,
      ...(spoolmanId !== null ? { spoolmanId } : {}),
    },
    vendor: toText(record["brand"]) ?? brandName(record["id_brand"]),
    material: toText(record["material"]) ?? materialLabel(record["id_material"]),
    name: toText(record["color_name"]) ?? toText(record["name"]),
    colors: colors(record),
    diameter: diameterFromId(record["data1"]),
    density: toPositiveNumber(record["density"]),
    nozzleTempMin: temperature(record, "data2", "nozzle", "temp_min"),
    nozzleTempMax: temperature(record, "data3", "nozzle", "temp_max"),
    bedTempMin: temperature(record, "data6", "bed", "temp_min"),
    bedTempMax: temperature(record, "data7", "bed", "temp_max"),
    upc: toText(record["barcode"]) ?? toText(record["sku"]),
    initialWeight: grams(record),
    remainingWeight: toNumber(record["weight_available"]),
    emptySpoolWeight: toNonNegativeNumber(record["container_weight"]),
    location: null,
    price: null,
    purchasedOn: null,
    lotNr: null,
    finish: finishOf(record),
    td: toPositiveNumber(record["TD"]),
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
  for (const record of records.toSorted((a, b) => a.uid.localeCompare(b.uid))) {
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
    // Only `deleted: true` is known to mean deleted. Every export and the Studio fixtures carry
    // `deleted_at: null`, and nothing documents a non-null value, so `deleted_at` is ignored here
    // (and dropped on write, see export.ts) rather than guessed at.
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
