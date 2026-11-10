import type { PlannedCreate, PlannedUpdate, SpoolValues } from "../../core/compare";
import type { ComparableField } from "../../core/model";
import { systemRuntime, type AdapterRuntime } from "../shared/runtime";
import { aspectId, brandId, diameterId, finishLabels, materialId, NO_ASPECT } from "./reference";
import {
  FILAMENT_TYPE,
  CHIP_EPOCH_OFFSET,
  UNSET_PRODUCT_ID,
  type TtagRecord,
  type TigertagRaw,
} from "./schema";

/** Truncates to a UTF-8 byte budget (the chip's colour name slot is 28 bytes). */
export function utf8Slice(value: string, bytes: number): string {
  let byteLen = 0;
  let out = "";
  for (const char of value) {
    const cp = char.codePointAt(0)!;
    const charBytes = cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (byteLen + charBytes > bytes) break;
    byteLen += charBytes;
    out += char;
  }
  return out;
}

const byte = (value: number | null) => Math.max(0, Math.min(255, Math.round(value ?? 0)));
const uint16 = (value: number | null) => Math.max(0, Math.min(65535, Math.round(value ?? 0)));

const COLOR_SLOTS = ["", "2", "3"] as const;

/**
 * Writes a colour in the format the record already uses for it: `#` prefix or not, hex case, and
 * the alpha suffix (the stored alpha is kept when the colour is the same, otherwise
 * `fallbackAlpha`).
 */
function colorLike(existing: unknown, hex: string, fallbackAlpha: string): string {
  const old = typeof existing === "string" ? existing.trim() : "";
  const match = /^(#?)([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(old);
  const rgb = hex.toUpperCase();
  const alpha =
    match?.[3] && match[2]!.toUpperCase() === rgb ? match[3] : match?.[3] ? fallbackAlpha : null;
  const text = rgb + (alpha ?? (match ? "" : fallbackAlpha));
  const cased = match && old === old.toLowerCase() && /[a-f]/.test(old) ? text.toLowerCase() : text;
  return `${match ? match[1] : "#"}${cased}`;
}

const isBag = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** A mono or multi flag follows the colour count; any other kind (e.g. gradient) is left alone. */
function colorKind(type: unknown, count: number): unknown {
  if (count > 1) return type === undefined || type === null || type === "mono" ? "multi" : type;
  return type === "mono" ? type : "mono";
}

/** Colour fields on a catalogue product (and its filament block), only where they already exist. */
function setCatalogColors(target: Record<string, unknown>, list: string[], alpha: string): void {
  const catalog = target["catalogProduct"];
  if (!isBag(catalog)) return;
  const next: Record<string, unknown> = { ...catalog };
  const apply = (holder: Record<string, unknown>) => {
    if ("color" in holder) holder["color"] = colorLike(holder["color"], list[0] ?? "000000", alpha);
    const info = holder["color_info"];
    if (isBag(info)) {
      const sample = Array.isArray(info["colors"]) ? info["colors"][0] : holder["color"];
      holder["color_info"] = {
        ...info,
        ...("colors" in info ? { colors: list.map((hex) => colorLike(sample, hex, alpha)) } : {}),
        ...("type" in info ? { type: colorKind(info["type"], list.length) } : {}),
      };
    }
  };
  apply(next);
  if (isBag(next["filament"])) {
    next["filament"] = { ...next["filament"] };
    apply(next["filament"] as Record<string, unknown>);
  }
  if (isBag(next["RFID_Data"])) {
    const rfid: Record<string, unknown> = { ...next["RFID_Data"] };
    const hex = list[0] ?? "000000";
    if ("color_r" in rfid) rfid["color_r"] = parseInt(hex.slice(0, 2), 16);
    if ("color_g" in rfid) rfid["color_g"] = parseInt(hex.slice(2, 4), 16);
    if ("color_b" in rfid) rfid["color_b"] = parseInt(hex.slice(4, 6), 16);
    next["RFID_Data"] = rfid;
  }
  target["catalogProduct"] = next;
}

function setColors(target: Record<string, unknown>, list: string[]): void {
  for (let index = 0; index < COLOR_SLOTS.length; index++) {
    const suffix = COLOR_SLOTS[index]!;
    const hex = list[index];
    if (!hex) {
      if (suffix && !(`color_r${suffix}` in target)) continue;
      target[`color_r${suffix}`] = 0;
      target[`color_g${suffix}`] = 0;
      target[`color_b${suffix}`] = 0;
    } else {
      target[`color_r${suffix}`] = parseInt(hex.slice(0, 2), 16);
      target[`color_g${suffix}`] = parseInt(hex.slice(2, 4), 16);
      target[`color_b${suffix}`] = parseInt(hex.slice(4, 6), 16);
    }
  }
  if (target["color_a"] === undefined) target["color_a"] = 255;
  const alphaByte = Math.max(0, Math.min(255, Math.round(Number(target["color_a"]) || 0)));
  const alpha = alphaByte.toString(16).padStart(2, "0").toUpperCase();
  // Keep whatever shape the record already used for the display list (array or comma string).
  const shown = target["online_color_list"];
  const sample = Array.isArray(shown)
    ? shown[0]
    : typeof shown === "string"
      ? shown.split(",")[0]
      : undefined;
  const formatted = list.map((hex) => colorLike(sample ?? target["online_color"], hex, alpha));
  target["online_color_list"] = typeof shown === "string" ? formatted.join(",") : formatted;
  if ("online_color" in target)
    target["online_color"] = colorLike(target["online_color"], list[0] ?? "000000", alpha);
  setCatalogColors(target, list, alpha);
  // Studio shows a multi-colour spool from this flag; leave any other kind (e.g. gradient) alone.
  const type = target["online_color_type"];
  if (list.length > 1) {
    if (type === undefined || type === null || type === "mono")
      target["online_color_type"] = "multi";
  } else if (type !== "mono") target["online_color_type"] = "mono";
}

function clearCatalogTemp(
  target: Record<string, unknown>,
  group: "nozzle" | "bed",
  bound: "temp_min" | "temp_max",
): void {
  const catalog = target["catalogProduct"];
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) return;
  const sub = (catalog as Record<string, unknown>)[group];
  if (!sub || typeof sub !== "object" || Array.isArray(sub)) return;
  if (bound in sub) {
    target["catalogProduct"] = {
      ...(catalog as Record<string, unknown>),
      [group]: { ...(sub as Record<string, unknown>), [bound]: null },
    };
  }
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
      if (value == null) clearCatalogTemp(target, "nozzle", "temp_min");
      break;
    case "nozzleTempMax":
      target["data3"] = uint16(value as number | null);
      if (value == null) clearCatalogTemp(target, "nozzle", "temp_max");
      break;
    case "bedTempMin":
      target["data6"] = byte(value as number | null);
      if (value == null) clearCatalogTemp(target, "bed", "temp_min");
      break;
    case "bedTempMax":
      target["data7"] = byte(value as number | null);
      if (value == null) clearCatalogTemp(target, "bed", "temp_max");
      break;
    case "density":
      if (value == null) delete target["density"];
      else target["density"] = value;
      break;
    case "upc": {
      // Reading takes `barcode` first and `sku` second, so write the same way and touch only the
      // key that holds (or will hold) the value; the other one is a distinct identifier.
      const text = (value as string | null) ?? "";
      const barcodeSet = target["barcode"] != null && target["barcode"] !== "";
      if (!text) {
        if (barcodeSet) delete target["barcode"];
        else delete target["sku"];
      } else if (/^\d+$/.test(text)) {
        target["barcode"] = text;
      } else {
        // A non-numeric code is a SKU; a leftover barcode would take precedence over it on reading.
        target["sku"] = text;
        delete target["barcode"];
      }
      break;
    }
    case "finish": {
      const [first, second] = finishLabels(value as string | null);
      target["id_aspect1"] = first ? (aspectId(first) ?? NO_ASPECT) : NO_ASPECT;
      target["id_aspect2"] = second ? (aspectId(second) ?? NO_ASPECT) : NO_ASPECT;
      break;
    }
    case "td":
      if (value != null || "TD" in target) target["TD"] = value ?? null;
      break;
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
    "td",
    "initialWeight",
    "remainingWeight",
    "emptySpoolWeight",
    "comment",
  ] as const) {
    setField(record, field, values[field]);
  }
  // Without a finish the aspect guessed from the name stays.
  if (values.finish) setField(record, "finish", values.finish);
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
