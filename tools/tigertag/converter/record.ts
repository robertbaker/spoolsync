import type { AdapterRuntime } from "@spoolsync/core/adapters/shared/runtime";

import { CliError } from "./errors";
import {
  finiteNonNegative,
  parseHexColor,
  safeOptionalUrl,
  normalizeAspect,
  temp,
} from "./record-values";
import { pickId } from "./references";
import type { ParsedColor, ReferenceRow, SpoolmanSpool, TtagRecord } from "./types";

const UNSET_PRODUCT_ID = 0xffff_ffff;

export function buildRecord(
  spool: SpoolmanSpool,
  refs: { brands: ReferenceRow[]; materials: ReferenceRow[] },
  index: number,
  warnings: string[],
  runtime: AdapterRuntime,
): TtagRecord {
  if (!spool || typeof spool !== "object" || Array.isArray(spool)) {
    throw new CliError(`Spool at array index ${index} must be an object`);
  }
  const spoolId = String(spool.id ?? index + 1);
  const filament = spool.filament;
  if (!filament || typeof filament !== "object")
    throw new CliError(`Spool ${spoolId} has no filament object`);
  const vendorName = typeof filament.vendor === "object" ? filament.vendor?.name : filament.vendor;
  const brandName = String(vendorName ?? "Generic").trim() || "Generic";
  const filamentName =
    String(filament.name ?? filament.material ?? "Filament").trim() || "Filament";
  const materialName = String(filament.material ?? "").trim();
  const baseMaterial = materialName.split(/[-_ ]/)[0];
  const knownBrandId = pickId(refs.brands, brandName, "name", 65535);
  const materialId = pickId(
    refs.materials,
    materialName,
    "label",
    pickId(refs.materials, baseMaterial, "material_type", 65535),
  );
  const palette = String(filament.multi_color_hexes ?? "")
    .split(",")
    .map(parseHexColor)
    .filter((entry): entry is ParsedColor => entry !== null);
  if (palette.length > 3) {
    warnings.push(`Spool ${spoolId}: ${palette.length} colors; only the first 3 are kept`);
    palette.length = 3;
  }
  const color = palette[0] ?? parseHexColor(filament.color_hex ?? filament.color);
  const initial = finiteNonNegative(
    spool.initial_weight ?? filament.weight,
    1000,
    "initial_weight",
    spoolId,
  );
  const used = Number(spool.used_weight);
  const remaining = finiteNonNegative(
    spool.remaining_weight ?? (Number.isFinite(used) && used >= 0 ? initial - used : undefined),
    initial,
    "remaining_weight",
    spoolId,
  );
  if (initial > 0xff_ffff)
    throw new CliError(`Spool ${spoolId}: initial_weight exceeds TigerTag's 24-bit capacity limit`);
  const diameter = finiteNonNegative(filament.diameter, 1.75, "diameter", spoolId);
  const diameterId = diameter < 2.3 ? 56 : 221;
  const chipDiameter = diameterId === 56 ? 1.75 : 2.85;
  if (Math.abs(diameter - chipDiameter) > 0.01) {
    warnings.push(`Spool ${spoolId}: diameter ${diameter} mm recorded as ${chipDiameter} mm`);
  }
  const settings = filament.extra && typeof filament.extra === "object" ? filament.extra : {};
  const nozzleMin = temp(
    filament.nozzle_temp_min ??
      settings.nozzle_temp_min ??
      settings.nozzle_temperature_min ??
      filament.settings_extruder_temp,
    0,
    65535,
  );
  const nozzleMax = temp(
    filament.nozzle_temp_max ??
      settings.nozzle_temp_max ??
      settings.nozzle_temperature_max ??
      filament.settings_extruder_temp,
    0,
    65535,
  );
  const bedMin = temp(
    filament.bed_temp_min ??
      settings.bed_temp_min ??
      settings.bed_temperature_min ??
      filament.settings_bed_temp,
    0,
  );
  const bedMax = temp(
    filament.bed_temp_max ??
      settings.bed_temp_max ??
      settings.bed_temperature_max ??
      filament.settings_bed_temp,
    0,
  );
  const dryTemp = temp(filament.drying_temp ?? settings.drying_temp ?? settings.dry_temp, 0);
  const dryTime = temp(filament.drying_time ?? settings.drying_time ?? settings.dry_time, 0);
  const colorHex = color?.hex ?? "808080";
  const colorList = palette.length > 1 ? palette.map((entry) => entry.hex) : [colorHex];
  const fullName = `${brandName} ${filamentName}`.trim();
  const stampSeconds = Math.max(0, Math.floor(runtime.now() / 1000) - 946684800);
  const record = {
    uid: `TigerData_${runtime.randomUUID().replaceAll("-", "")}`,
    id_type: 142,
    id_brand: knownBrandId,
    brand: brandName,
    id_material: materialId,
    material: materialName || filamentName,
    id_aspect1: normalizeAspect(filament, spool.name),
    id_aspect2: 255,
    id_unit: 21,
    measure: Math.round(initial),
    measure_gr: initial,
    capacity: initial,
    weight_available: Math.min(remaining, initial),
    color_r: color?.r ?? 128,
    color_g: color?.g ?? 128,
    color_b: color?.b ?? 128,
    color_a: color?.a ?? 255,
    color_name: String(spool.name ?? filamentName).slice(0, 28),
    online_color_list: colorList,
    data1: diameterId,
    data2: nozzleMin,
    data3: nozzleMax,
    data4: dryTemp,
    data5: dryTime,
    data6: bedMin,
    data7: bedMax,
    timestamp: stampSeconds,
    id_product: UNSET_PRODUCT_ID,
    name: filamentName,
    series: String(filamentName),
    message: [
      spool.name,
      spool.location ? `Location: ${spool.location}` : "",
      spool.lot_nr ? `Lot: ${spool.lot_nr}` : "",
      spool.comment,
      `Spoolman #${spoolId}`,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500),
    spoolmanId: spool.id ?? null,
    spoolmanFilamentId: filament.id ?? null,
    preserveImportedWeight: true,
  };
  const price = Number(spool.price ?? filament.price);
  if (Number.isFinite(price) && price >= 0) record.price = price;
  const density = Number(filament.density);
  if (Number.isFinite(density) && density > 0) record.density = density;
  const imageUrl = safeOptionalUrl(filament.extra?.image_url ?? filament.extra?.image);
  if (imageUrl) record.url_img = imageUrl;
  const article = String(filament.article_number ?? "").trim();
  if (/^\d+$/.test(article)) record.barcode = article;
  else if (article) record.sku = article;
  const emptyWeight =
    spool.spool_weight ??
    filament.spool_weight ??
    (typeof filament.vendor === "object" ? filament.vendor?.empty_spool_weight : null);
  if (typeof emptyWeight === "number" && Number.isFinite(emptyWeight) && emptyWeight >= 0) {
    record.container_weight = emptyWeight;
  }
  if (palette.length > 1) {
    palette.slice(1).forEach((entry, i) => {
      record[`color_r${i + 2}`] = entry.r;
      record[`color_g${i + 2}`] = entry.g;
      record[`color_b${i + 2}`] = entry.b;
    });
  } else {
    record.online_color_type = "mono";
  }
  if (!record.name) record.name = fullName;
  return record;
}
