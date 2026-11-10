import type { PlannedChange, PlannedCreate, PlannedUpdate } from "../../core/compare";
import { shortIdFromLotNr, spoolstockLotNr, toText } from "../../core/normalize";
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
  finish: "material_type",
  td: "td_value",
  colors: "rgb",
  nozzleTempMin: "spool_preferred_nozzle_temp",
  nozzleTempMax: "spool_preferred_nozzle_temp",
  bedTempMin: "spool_preferred_bed_temp",
  bedTempMax: "spool_preferred_bed_temp",
};
const propertyFields: Record<string, string> = {
  price: "purchase_price",
  purchasedOn: "purchase_date",
  nozzleTempMin: "preferred_nozzle_temp",
  nozzleTempMax: "preferred_nozzle_temp",
  bedTempMin: "preferred_bed_temp",
  bedTempMax: "preferred_bed_temp",
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
  const changed = new Map(change.changes.map((item) => [item.field, item.to]));
  for (const item of change.changes) {
    const fieldName = fields[item.field];
    if (!fieldName) continue;
    const rawValue =
      (item.field === "nozzleTempMin" || item.field === "nozzleTempMax") &&
      changed.has("nozzleTempMin") &&
      changed.has("nozzleTempMax")
        ? (changed.get("nozzleTempMin") ?? changed.get("nozzleTempMax"))
        : (item.field === "bedTempMin" || item.field === "bedTempMax") &&
            changed.has("bedTempMin") &&
            changed.has("bedTempMax")
          ? (changed.get("bedTempMin") ?? changed.get("bedTempMax"))
          : item.to;
    const value =
      item.field === "colors" && Array.isArray(rawValue)
        ? rawValue[0]
          ? `#${rawValue[0]}`
          : ""
        : rawValue;
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

const NOTE_KEYS = ["notes", "comment", "description"] as const;

/** Picks a short code that no existing row uses, so a new spool never overwrites another by ID. */
function uniqueShortCode(runtime: AdapterRuntime, taken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = runtime.randomUUID().replaceAll("-", "").slice(0, 9);
    if (!taken.has(code)) return code;
  }
  throw new Error("Could not generate a unique 3DFilamentProfiles short code. Try again.");
}

export function createRecord(
  change: PlannedCreate,
  format: "csv" | "json",
  warnings: string[],
  runtime: AdapterRuntime,
  takenShortCodes: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  if (change.values.colors.length > 1)
    warnings.push(
      `3DFilamentProfiles ${change.values.name ?? change.groupId}: only the primary color is exported; this format stores one color per spool.`,
    );
  const shortCode = uniqueShortCode(runtime, takenShortCodes);
  const links = { ...change.groupIds, ...change.links };
  const lotValue =
    change.values.lotNr ??
    (links.spoolstockShortId ? spoolstockLotNr(links.spoolstockShortId) : null);
  const lot = lotValue ? `Lot: ${lotValue}` : "";
  const nozzleTemp = change.values.nozzleTempMin ?? change.values.nozzleTempMax;
  const bedTemp = change.values.bedTempMin ?? change.values.bedTempMax;
  const row: Record<string, unknown> = {
    short_code: shortCode,
    spool_url: `https://spooldb.com/s/${shortCode}`,
    brand: change.values.vendor ?? "",
    material: change.values.material ?? "PLA",
    material_type: change.values.finish ?? "",
    td_value: change.values.td ?? (format === "csv" ? "" : null),
    color: change.values.name ?? "",
    rgb: change.values.colors[0] ? `#${change.values.colors[0]}` : "",
    remaining_grams: change.values.remainingWeight,
    empty_spool_weight: change.values.emptySpoolWeight ?? (format === "csv" ? "" : null),
    location: change.values.location ?? "",
    // filament_id points at the shared 3DFilamentProfiles catalog, which SpoolSync cannot derive.
    updated_at: new Date(runtime.now()).toISOString().replace("Z", "+00:00"),
    notes: [lot, change.values.comment ?? ""].filter(Boolean).join("\n"),
  };
  if (format === "csv")
    Object.assign(row, {
      spool_purchase_date: change.values.purchasedOn ?? "",
      spool_purchase_price: change.values.price ?? "",
      spool_preferred_nozzle_temp: nozzleTemp ?? "",
      spool_preferred_bed_temp: bedTemp ?? "",
    });
  else
    // Real exports omit the preferred temperatures when they are unset.
    row["spool_properties"] = {
      purchase_date: change.values.purchasedOn,
      purchase_price: change.values.price,
      last_dried_date: null,
      ...(nozzleTemp == null ? {} : { preferred_nozzle_temp: nozzleTemp }),
      ...(bedTemp == null ? {} : { preferred_bed_temp: bedTemp }),
    };
  return row;
}

/** Records a Spoolstock link as a `Lot:` line in the notes, keeping every other note line. */
function setSpoolstockLink(
  row: Record<string, unknown>,
  shortId: string,
  spoolId: string,
  warnings: string[],
): void {
  const key = NOTE_KEYS.find((name) => Object.hasOwn(row, name)) ?? "notes";
  const lines = (toText(row[key]) ?? "").split(/\r?\n/);
  const index = lines.findIndex((line) => /^Lot:\s*\S/i.test(line));
  const link = `Lot: ${spoolstockLotNr(shortId)}`;
  if (index === -1) lines.unshift(link);
  else {
    const existing = /^Lot:\s*(.+)$/i.exec(lines[index]!)?.[1]?.trim();
    const current = shortIdFromLotNr(existing);
    if (current === shortId) return;
    if (!current) {
      warnings.push(
        `3DFilamentProfiles ${spoolId}: kept the existing lot number, so the Spoolstock link was not stored in its notes.`,
      );
      return;
    }
    lines[index] = link;
  }
  const notes = lines.join("\n");
  row[key] = notes;
  for (const alias of NOTE_KEYS) if (alias !== key && Object.hasOwn(row, alias)) row[alias] = notes;
}

export function setLinks(
  row: Record<string, unknown>,
  change: PlannedChange,
  format: "csv" | "json",
  warnings: string[] = [],
): void {
  const links = change.kind === "create" ? { ...change.groupIds, ...change.links } : change.links;
  if (change.kind === "update" && links.spoolstockShortId)
    setSpoolstockLink(row, links.spoolstockShortId, change.spool.sourceId, warnings);
  if (links.spoolmanId !== undefined) {
    if (format === "csv") row["spool_spoolman_id"] = String(links.spoolmanId);
    else {
      if (Object.hasOwn(row, "spool_spoolman_id"))
        row["spool_spoolman_id"] = String(links.spoolmanId);
      setProperty(row, "spoolman_id", String(links.spoolmanId));
    }
  }
}
