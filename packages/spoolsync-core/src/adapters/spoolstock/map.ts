import type { CommonSpool } from "../../core/model";
import {
  toBoolean,
  toDate,
  toNumber,
  toPositiveNumber,
  toText,
  uniqueHexes,
} from "../../core/normalize";
import type { SpoolstockRecord } from "./csv";

/** Spoolstock stores colours as a JSON array of `#RRGGBB` strings, occasionally comma-separated. */
function colors(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) return [];
  if (trimmed.charCodeAt(0) === 0x5b /* '[' */ || trimmed.charCodeAt(0) === 0x22 /* '"' */) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return uniqueHexes(Array.isArray(parsed) ? parsed : [parsed]);
    } catch {
      // Fall through to comma split
    }
  }
  return uniqueHexes(trimmed.split(","));
}

/** `filament.features` is a JSON array of labels such as ["Matte"] or ["Metallic","Silk"]. */
function finish(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  let labels: unknown[];
  if (trimmed.charCodeAt(0) === 0x5b /* '[' */ || trimmed.charCodeAt(0) === 0x22 /* '"' */) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      labels = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      labels = trimmed.split(",");
    }
  } else {
    labels = trimmed.split(",");
  }
  let text = "";
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (typeof label === "string") {
      const item = label.trim();
      if (item) text = text ? `${text}, ${item}` : item;
    }
  }
  return text || null;
}

/** The spool's own notes first, then the filament's notes under a heading so they stay distinct. */
function comment(record: SpoolstockRecord): string | null {
  const spoolNotes = toText(record.notes);
  const filamentNotes = toText(record["filament.notes"]);
  if (!filamentNotes) return spoolNotes;
  const labelled = `Filament notes: ${filamentNotes}`;
  return spoolNotes ? `${spoolNotes}\n\n${labelled}` : labelled;
}

/** Recognizes `spoolman-<id>` short IDs in legacy Spoolstock exports to preserve existing matches. */
function spoolmanIdFromShortId(shortId: string): number | undefined {
  const match = /^spoolman-(\d+)$/.exec(shortId);
  return match ? Number(match[1]) : undefined;
}

export function spoolstockToCommon(record: SpoolstockRecord): CommonSpool {
  const shortId = record.short_id.trim();
  const spoolmanId = spoolmanIdFromShortId(shortId);
  const initialWeight = toPositiveNumber(record.size);
  return {
    source: "spoolstock",
    sourceId: shortId,
    crossIds: {
      spoolstockShortId: shortId,
      ...(spoolmanId !== undefined ? { spoolmanId } : {}),
    },
    vendor: toText(record["filament.brand.name"]),
    material: toText(record["filament.material.name"]),
    name: toText(record["filament.name"]),
    colors: colors(record["filament.color_hex_codes"]),
    diameter: toPositiveNumber(record.diameter) ?? toPositiveNumber(record["filament.diameter"]),
    density: toPositiveNumber(record["filament.material.density"]),
    nozzleTempMin: toPositiveNumber(record["filament.material.low_temp"]),
    nozzleTempMax: toPositiveNumber(record["filament.material.high_temp"]),
    bedTempMin: toPositiveNumber(record["filament.material.low_bed_temp"]),
    bedTempMax: toPositiveNumber(record["filament.material.high_bed_temp"]),
    upc: toText(record["filament.upc"]),
    initialWeight,
    remainingWeight: toNumber(record.remaining_weight),
    emptySpoolWeight: toPositiveNumber(record["empty_spool.weight"]),
    location: toText(record.inventory_location),
    price: toNumber(record.price),
    purchasedOn: toDate(record.purchased_on),
    lotNr: null,
    finish: finish(record["filament.features"]),
    td: null,
    comment: comment(record),
    archived: toBoolean(record.depleted),
    raw: record,
  };
}
