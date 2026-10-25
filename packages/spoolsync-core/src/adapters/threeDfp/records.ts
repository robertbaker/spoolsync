import type { PlannedChange, PlannedCreate, PlannedUpdate } from "../../core/compare";
import { spoolstockLotNr, toText } from "../../core/normalize";
import type { AdapterRuntime } from "../shared/runtime";
import { field } from "../shared/tabular";

const fields: Record<string, string> = {
  vendor: "brand",
  material: "material",
  name: "color",
  remainingWeight: "remaining_grams",
  emptySpoolWeight: "empty_spool_weight",
  location: "location",
  price: "spool_purchase_price",
  purchasedOn: "spool_purchase_date",
  comment: "notes",
  colors: "rgb",
  nozzleTempMin: "spool_preferred_nozzle_temp",
  bedTempMin: "spool_preferred_bed_temp",
};
const propertyFields: Record<string, string> = {
  price: "purchase_price",
  purchasedOn: "purchase_date",
  nozzleTempMin: "preferred_nozzle_temp",
  bedTempMin: "preferred_bed_temp",
};
const aliases: Record<string, string[]> = {
  vendor: ["vendor", "manufacturer"],
  material: ["type", "filament_type"],
  name: ["name", "filament", "color_name", "colour_name"],
  colors: ["color_hex", "rgba", "hex", "color_hex_code"],
  remainingWeight: ["remaining_weight", "remaining", "weight_remaining"],
  emptySpoolWeight: ["spool_weight"],
  location: ["storage_location"],
};

function setProperty(row: Record<string, unknown>, key: string, value: unknown): void {
  const properties =
    row["spool_properties"] && typeof row["spool_properties"] === "object"
      ? (row["spool_properties"] as Record<string, unknown>)
      : {};
  properties[key] = value;
  row["spool_properties"] = properties;
}

export function updateRecord(
  row: Record<string, unknown>,
  change: PlannedUpdate,
  format: "csv" | "json",
  warnings: string[],
): void {
  for (const item of change.changes) {
    const fieldName = fields[item.field];
    if (!fieldName) continue;
    const value =
      item.field === "colors" && Array.isArray(item.to)
        ? item.to[0]
          ? `#${item.to[0]}`
          : ""
        : item.to;
    for (const alias of aliases[item.field] ?? [])
      if (Object.hasOwn(row, alias)) row[alias] = value;
    if (item.field === "colors") {
      delete row["extra_colors"];
      delete row["colors"];
      if (Array.isArray(item.to) && item.to.length > 1)
        warnings.push(
          `3DFilamentProfiles ${change.spool.sourceId}: only the primary color is exported; this format stores one color per spool.`,
        );
    }
    if (item.field === "comment") {
      const existingNote = toText(field(row, "notes", "comment", "description"));
      const lot = /^Lot:\s*(.+)$/im.exec(existingNote ?? "")?.[1]?.trim();
      row[fieldName] = [lot ? `Lot: ${lot}` : "", toText(value) ?? ""].filter(Boolean).join("\n");
      for (const alias of ["comment", "description"])
        if (Object.hasOwn(row, alias)) row[alias] = row[fieldName];
    } else if (format === "csv") row[fieldName] = value;
    else if (Object.hasOwn(propertyFields, item.field)) {
      // Some JSON exports carry both the flattened CSV field and nested properties.
      // Keep both consistent because loading gives the flattened field precedence.
      if (Object.hasOwn(row, fieldName)) row[fieldName] = value;
      setProperty(row, propertyFields[item.field]!, value);
    } else row[fieldName] = value;
  }
}

export function createRecord(
  change: PlannedCreate,
  format: "csv" | "json",
  warnings: string[],
  runtime: AdapterRuntime,
): Record<string, unknown> {
  if (change.values.colors.length > 1)
    warnings.push(
      `3DFilamentProfiles ${change.values.name ?? change.groupId}: only the primary color is exported; this format stores one color per spool.`,
    );
  const shortCode = runtime.randomUUID().replaceAll("-", "").slice(0, 9);
  const links = { ...change.groupIds, ...change.links };
  const lot = links.spoolstockShortId ? `Lot: ${spoolstockLotNr(links.spoolstockShortId)}` : "";
  const row: Record<string, unknown> = {
    short_code: shortCode,
    spool_url: `https://spooldb.com/s/${shortCode}`,
    brand: change.values.vendor ?? "",
    material: change.values.material ?? "PLA",
    material_type: "",
    color: change.values.name ?? "",
    rgb: change.values.colors[0] ? `#${change.values.colors[0]}` : "",
    remaining_grams: change.values.remainingWeight,
    empty_spool_weight: change.values.emptySpoolWeight ?? "",
    location: change.values.location ?? "",
    notes: [lot, change.values.comment ?? ""].filter(Boolean).join("\n"),
  };
  if (format === "csv")
    Object.assign(row, {
      spool_purchase_date: change.values.purchasedOn ?? "",
      spool_purchase_price: change.values.price ?? "",
      spool_preferred_nozzle_temp: change.values.nozzleTempMin ?? "",
      spool_preferred_bed_temp: change.values.bedTempMin ?? "",
    });
  else
    row["spool_properties"] = {
      purchase_date: change.values.purchasedOn,
      purchase_price: change.values.price,
      last_dried_date: null,
      preferred_nozzle_temp: change.values.nozzleTempMin,
      preferred_bed_temp: change.values.bedTempMin,
    };
  return row;
}

export function setLinks(
  row: Record<string, unknown>,
  change: PlannedChange,
  format: "csv" | "json",
): void {
  const links = change.kind === "create" ? { ...change.groupIds, ...change.links } : change.links;
  if (links.spoolmanId !== undefined) {
    if (format === "csv") row["spool_spoolman_id"] = String(links.spoolmanId);
    else {
      if (Object.hasOwn(row, "spool_spoolman_id"))
        row["spool_spoolman_id"] = String(links.spoolmanId);
      setProperty(row, "spoolman_id", String(links.spoolmanId));
    }
  }
}
