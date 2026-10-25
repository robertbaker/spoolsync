import type { PlannedChange } from "../../core/compare";
import { toNumber, toText } from "../../core/normalize";
import { parseTemp, tempText, round2 } from "./map";
import type { FiladexRecord } from "./types";

export type Warn = (message: string) => void;
const hash = (hex: string | undefined) => (hex ? `#${hex}` : "");
export const text = (value: unknown) => (value == null ? "" : String(value));
const COLOR_WARNING = "only the primary color is exported; Filadex stores one color.";

/** Filadex keeps the remainder as a percentage of the total, so both weights are written together. */
function setWeights(
  record: FiladexRecord,
  initial: number | null,
  remaining: number | null,
  label: string,
  warn: Warn,
): void {
  const total = initial ?? remaining;
  if (total === null || total <= 0) return;
  if (initial === null)
    warn(`${label}: initial weight was unknown; remaining weight was used as the total.`);
  if (remaining !== null && remaining > total)
    throw new Error(
      `${label}: remaining weight cannot exceed initial weight. Resolve the weights before exporting.`,
    );
  record["totalWeight"] = String(round2(total / 1000));
  record["remainingPercentage"] = String(
    round2(remaining === null ? 100 : (remaining / total) * 100),
  );
}

/** Applies one planned update to a Filadex record in place. */
export function updateRecord(
  record: FiladexRecord,
  change: Extract<PlannedChange, { kind: "update" }>,
  warn: Warn,
): void {
  const label = `Filadex ${change.spool.sourceId}`;
  let { min, max } = parseTemp(record["printTemp"]);
  let weights: { initial: number | null; remaining: number | null } | undefined;
  for (const { field: name, to } of change.changes) {
    switch (name) {
      case "vendor":
        record["manufacturer"] = toText(to) ?? "";
        break;
      case "material":
        record["material"] = toText(to) ?? "";
        break;
      case "name":
        record["colorName"] = toText(to) ?? "";
        break;
      case "colors":
        record["colorCode"] = hash((to as string[])[0]);
        if ((to as string[]).length > 1) warn(`${label}: ${COLOR_WARNING}`);
        break;
      case "diameter":
        record["diameter"] = text(to);
        break;
      case "nozzleTempMin":
        min = toNumber(to);
        record["printTemp"] = tempText(min, max);
        break;
      case "nozzleTempMax":
        max = toNumber(to);
        record["printTemp"] = tempText(min, max);
        break;
      case "upc":
        record["barcode"] = toText(to) ?? "";
        break;
      case "location":
        record["storageLocation"] = toText(to) ?? "";
        break;
      case "price":
        record["purchasePrice"] = text(to);
        break;
      case "purchasedOn":
        record["purchaseDate"] = toText(to) ?? "";
        break;
      case "initialWeight":
      case "remainingWeight":
        weights ??= {
          initial: change.spool.initialWeight,
          remaining: change.spool.remainingWeight,
        };
        weights[name === "initialWeight" ? "initial" : "remaining"] = toNumber(to);
        break;
      default:
        break;
    }
  }
  if (weights) setWeights(record, weights.initial, weights.remaining, label, warn);
}

/** Builds the Filadex record for a planned creation. `names` holds the names already taken. */
export function createRecord(
  v: Extract<PlannedChange, { kind: "create" }>["values"],
  groupId: string,
  names: Set<string>,
  warn: Warn,
): FiladexRecord {
  const label = `Filadex ${v.name ?? groupId}`;
  // Filadex skips imported rows whose `name` matches an existing one, so keep names distinct.
  const base = [v.vendor, v.material, v.name].filter(Boolean).join(" ") || "Filament";
  let name = base;
  for (let n = 2; names.has(name.toLowerCase()); n++) name = `${base} (${n})`;
  names.add(name.toLowerCase());
  const record: FiladexRecord = {
    name,
    manufacturer: v.vendor ?? "",
    material: v.material ?? "PLA",
    colorName: v.name ?? "",
    colorCode: hash(v.colors[0]),
    diameter: v.diameter == null ? "1.75" : String(v.diameter),
    printTemp: tempText(v.nozzleTempMin, v.nozzleTempMax),
    totalWeight: "1",
    remainingPercentage: "100",
    purchaseDate: v.purchasedOn ?? "",
    purchasePrice: text(v.price),
    status: "",
    spoolType: "",
    dryerCount: 0,
    lastDryingDate: "",
    storageLocation: v.location ?? "",
    barcode: v.upc ?? "",
  };
  if (v.colors.length > 1) warn(`${label}: ${COLOR_WARNING}`);
  setWeights(record, v.initialWeight, v.remainingWeight, label, warn);
  return record;
}
