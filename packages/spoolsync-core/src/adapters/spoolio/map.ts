import type { CommonSpool } from "../../core/model";
import {
  shortIdFromLotNr,
  toDate,
  toNumber,
  toPositiveNumber,
  toNonNegativeNumber,
  toText,
  uniqueHexes,
} from "../../core/normalize";
import { MATERIAL_TYPES, materialNote, notesText, spoolstockLinkNote } from "./material-notes";
import type { SpoolioFilament } from "./schema";

export function spoolioToCommon(filament: SpoolioFilament): CommonSpool {
  const originalMaterial = materialNote(filament.notes);
  const batchLink = shortIdFromLotNr(filament.batchNumber);
  const shortId = batchLink ?? spoolstockLinkNote(filament.notes);
  return {
    source: "spoolio",
    sourceId: filament.id,
    crossIds: {
      spoolioId: filament.id,
      ...(filament.spoolmanId != null ? { spoolmanId: filament.spoolmanId } : {}),
      ...(shortId ? { spoolstockShortId: shortId } : {}),
    },
    vendor: toText(filament.brand),
    material:
      originalMaterial && MATERIAL_TYPES[originalMaterial] === filament.type
        ? originalMaterial
        : toText(filament.type),
    name: toText(filament.colorName),
    colors: uniqueHexes([filament.colorHex, ...(filament.extraColors ?? [])]),
    diameter: toPositiveNumber(filament.diameter),
    density: null,
    // Spoolio stores 0 for "not set".
    nozzleTempMin: toPositiveNumber(filament.nozzleTempMin),
    nozzleTempMax: toPositiveNumber(filament.nozzleTempMax),
    bedTempMin: toPositiveNumber(filament.bedTempMin),
    bedTempMax: toPositiveNumber(filament.bedTempMax),
    upc: null,
    initialWeight: toPositiveNumber(filament.weightTotal),
    remainingWeight: toNumber(filament.weightRemaining),
    emptySpoolWeight: toNonNegativeNumber(filament.spoolWeight),
    location: null,
    price: toNumber(filament.price),
    purchasedOn: toDate(filament.purchaseDate),
    lotNr: batchLink ? null : toText(filament.batchNumber),
    finish: toText(filament.finish),
    td: null,
    comment: notesText(filament.notes),
    archived: false,
    raw: filament,
  };
}
