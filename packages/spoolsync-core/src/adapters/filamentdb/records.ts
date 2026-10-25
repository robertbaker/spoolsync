import type { PlannedChange } from "../../core/compare";
import { toNumber, toText } from "../../core/normalize";
import type { FilamentDbSpool } from "./types";

const hash = (hex: string | undefined) => (hex ? `#${hex}` : "");

export type Warn = (message: string) => void;

/** Applies one planned update to a FilamentDB spool record in place. */
export function updateRecord(
  record: FilamentDbSpool,
  change: Extract<PlannedChange, { kind: "update" }>,
  warn: Warn,
  now = Date.now(),
): void {
  for (const { field, to } of change.changes) {
    switch (field) {
      case "vendor":
        record["brand"] = toText(to) ?? "";
        break;
      case "material":
        record["type"] = toText(to) ?? "";
        break;
      case "name":
        record["color"] = toText(to) ?? "";
        break;
      case "colors":
        record["colorHex"] = hash((to as string[])[0]);
        if ((to as string[]).length > 1)
          warn(
            `FilamentDB ${change.spool.sourceId}: only the primary color is exported; this format stores one color.`,
          );
        break;
      case "diameter":
      case "density":
        record[field] = toNumber(to) ?? 0;
        break;
      case "nozzleTempMin":
        record["temperatureNozzleMin"] = toNumber(to) ?? 0;
        break;
      case "nozzleTempMax":
        record["temperatureNozzleMax"] = toNumber(to) ?? 0;
        break;
      case "bedTempMin":
        record["temperatureBedMin"] = toNumber(to) ?? 0;
        break;
      case "bedTempMax":
        record["temperatureBedMax"] = toNumber(to) ?? 0;
        break;
      case "upc":
        if (to == null) delete record["gtin"];
        else record["gtin"] = toText(to);
        break;
      case "initialWeight":
        record["weightTotal"] = toNumber(to) ?? 0;
        break;
      case "remainingWeight":
        record["weightRemaining"] = toNumber(to) ?? 0;
        break;
      case "emptySpoolWeight":
        record["weightSpool"] = toNumber(to) ?? 0;
        break;
      case "comment":
        if (to == null) delete record["notes"];
        else record["notes"] = toText(to);
        break;
      case "archived":
        record["deleted"] = Boolean(to);
        break;
      default:
        break;
    }
  }
  record["lastUpdated"] = now;
}

/** Builds the FilamentDB spool record for a planned creation. */
export function createRecord(
  v: Extract<PlannedChange, { kind: "create" }>["values"],
  label: string,
  warn: Warn,
  now = Date.now(),
  randomUUID: () => string = () => crypto.randomUUID(),
): FilamentDbSpool {
  if (v.colors.length > 1)
    warn(`${label}: only the primary color is exported; this format stores one color.`);
  if (v.price !== null || v.location !== null || v.purchasedOn !== null)
    warn(`${label}: FilamentDB has no price, location, or purchase date fields.`);
  const initial = v.initialWeight ?? v.remainingWeight ?? 0;
  return {
    serial: randomUUID(),
    brand: v.vendor ?? "",
    type: v.material ?? "PLA",
    color: v.name ?? "",
    ...(v.colors[0] ? { colorHex: hash(v.colors[0]) } : {}),
    weightTotal: initial,
    weightRemaining: v.remainingWeight ?? initial,
    weightSpool: v.emptySpoolWeight ?? 0,
    diameter: v.diameter ?? 1.75,
    density: v.density ?? 1.24,
    temperatureNozzleMin: v.nozzleTempMin ?? 0,
    temperatureNozzleMax: v.nozzleTempMax ?? 0,
    temperatureBedMin: v.bedTempMin ?? 0,
    temperatureBedMax: v.bedTempMax ?? 0,
    ...(v.upc ? { gtin: v.upc } : {}),
    ...(v.comment ? { notes: v.comment } : {}),
    ...(v.archived ? { deleted: true } : {}),
    createdAt: now,
    lastUpdated: now,
  };
}
