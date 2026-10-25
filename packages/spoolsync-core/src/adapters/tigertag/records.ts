import type { PlannedCreate, PlannedUpdate, SpoolValues } from "../../core/compare";
import type { ComparableField } from "../../core/model";
import { systemRuntime, type AdapterRuntime } from "../shared/runtime";
import { brandId, diameterId, materialId } from "./reference";
import {
  FILAMENT_TYPE,
  CHIP_EPOCH_OFFSET,
  UNSET_PRODUCT_ID,
  type TtagRecord,
  type TigertagRaw,
} from "./schema";

/** Truncates to a UTF-8 byte budget (the chip's colour name slot is 28 bytes). */
export function utf8Slice(value: string, bytes: number): string {
  const encoder = new TextEncoder();
  let out = "";
  for (const char of value) {
    if (encoder.encode(out + char).length > bytes) break;
    out += char;
  }
  return out;
}

const byte = (value: number | null) => Math.max(0, Math.min(255, Math.round(value ?? 0)));
const uint16 = (value: number | null) => Math.max(0, Math.min(65535, Math.round(value ?? 0)));

function setColors(target: Record<string, unknown>, list: string[]): void {
  const slots: Array<"" | "2" | "3"> = ["", "2", "3"];
  slots.forEach((suffix, index) => {
    const hex = list[index];
    const channels = hex
      ? [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
      : [0, 0, 0];
    if (!hex && suffix && !(`color_r${suffix}` in target)) return;
    ["color_r", "color_g", "color_b"].forEach(
      (name, i) => (target[`${name}${suffix}`] = channels[i]),
    );
  });
  if (target["color_a"] === undefined) target["color_a"] = 255;
  // Keep whatever shape the record already used for the display list.
  target["online_color_list"] = list;
}

function setField(target: Record<string, unknown>, field: ComparableField, value: unknown): void {
  switch (field) {
    case "vendor":
      target["brand"] = value ?? "";
      target["id_brand"] = brandId(value as string | null);
      break;
    case "material":
      target["material"] = value ?? "";
      target["id_material"] = materialId(value as string | null);
      break;
    case "name":
      target["color_name"] = utf8Slice(String(value ?? ""), 28);
      if (value == null) delete target["name"];
      break;
    case "colors":
      setColors(target, (value as string[]) ?? []);
      break;
    case "diameter":
      target["data1"] = diameterId(value as number | null);
      break;
    case "nozzleTempMin":
      target["data2"] = uint16(value as number | null);
      break;
    case "nozzleTempMax":
      target["data3"] = uint16(value as number | null);
      break;
    case "bedTempMin":
      target["data6"] = byte(value as number | null);
      break;
    case "bedTempMax":
      target["data7"] = byte(value as number | null);
      break;
    case "density":
      if (value == null) delete target["density"];
      else target["density"] = value;
      break;
    case "upc": {
      const text = (value as string | null) ?? "";
      delete target["barcode"];
      delete target["sku"];
      if (/^\d+$/.test(text)) target["barcode"] = text;
      else if (text) target["sku"] = text;
      break;
    }
    case "initialWeight": {
      const grams = Math.max(0, Math.round((value as number | null) ?? 0));
      target["id_unit"] = 21;
      target["measure"] = Math.min(grams, 0xff_ffff);
      target["measure_gr"] = grams;
      target["capacity"] = grams;
      break;
    }
    case "remainingWeight":
      target["weight_available"] = Math.max(0, (value as number | null) ?? 0);
      break;
    case "emptySpoolWeight":
      if (value == null) delete target["container_weight"];
      else target["container_weight"] = value;
      break;
    case "comment":
      if (value == null) delete target["message"];
      else target["message"] = Array.from(String(value)).slice(0, 500).join("");
      break;
    default:
      break;
  }
}

/** Visual finish TigerTag records as its primary aspect, guessed from the name. 255 = none. */
function aspectFor(values: SpoolValues): number {
  const text = `${values.material ?? ""} ${values.name ?? ""}`.toLowerCase();
  const aspects: Array<[string, number]> = [
    ["rainbow", 145],
    ["tricolor", 24],
    ["tri color", 24],
    ["bicolor", 252],
    ["bi color", 252],
    ["glow", 91],
    ["wood", 123],
    ["marble", 232],
    ["carbon", 238],
    ["silk", 92],
    ["glitter", 64],
    ["metal", 226],
    ["neon", 216],
    ["clear", 21],
    ["translucent", 67],
    ["gloss", 129],
    ["matte", 247],
    ["matt", 247],
    ["satin", 134],
    ["pearl", 126],
    ["fiber", 132],
  ];
  return aspects.find(([needle]) => text.includes(needle))?.[1] ?? 255;
}

/** A chipless filament record, as `tools/tigertag/spoolman-to-ttag.ts` builds it. */
function newRecord(values: SpoolValues, runtime: AdapterRuntime): TtagRecord {
  const record: Record<string, unknown> = {
    uid: `TigerData_${runtime.randomUUID().replaceAll("-", "")}`,
    id_type: FILAMENT_TYPE,
    id_aspect1: aspectFor(values),
    id_aspect2: 255,
    data4: 0,
    data5: 0,
    timestamp: Math.max(0, Math.floor(runtime.now() / 1000) - CHIP_EPOCH_OFFSET),
    id_product: UNSET_PRODUCT_ID,
    name: values.name ?? values.material ?? "Filament",
  };
  for (const field of [
    "vendor",
    "material",
    "name",
    "colors",
    "diameter",
    "nozzleTempMin",
    "nozzleTempMax",
    "bedTempMin",
    "bedTempMax",
    "density",
    "upc",
    "initialWeight",
    "remainingWeight",
    "emptySpoolWeight",
    "comment",
  ] as const) {
    setField(record, field, values[field]);
  }
  if (values.remainingWeight === null) record["weight_available"] = record["measure_gr"];
  return record as TtagRecord;
}

/** The records of an updated spool (both, for a twin) with its changes applied. */
export function updatedRecords(change: PlannedUpdate): TtagRecord[] {
  const { records: originals } = change.spool.raw as TigertagRaw;
  return originals.map((original) => {
    const record: Record<string, unknown> = { ...original };
    for (const { field, to } of change.changes) setField(record, field, to);
    if (change.links.spoolmanId !== undefined) record["spoolmanId"] = change.links.spoolmanId;
    return record as TtagRecord;
  });
}

/** A new chipless record for a created spool, linked to its Spoolman spool when there is one. */
export function createdRecord(
  change: PlannedCreate,
  runtime: AdapterRuntime = systemRuntime,
): TtagRecord {
  const record = newRecord(change.values, runtime) as Record<string, unknown>;
  const spoolmanId = change.links.spoolmanId ?? change.groupIds.spoolmanId;
  if (spoolmanId !== undefined) record["spoolmanId"] = spoolmanId;
  return record as TtagRecord;
}
