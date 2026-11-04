import type { CommonSpool } from "../../core/model";
import {
  toBoolean,
  toNonNegativeNumber,
  toPositiveNumber,
  toText,
  uniqueHexes,
} from "../../core/normalize";
import { readFinish } from "./finish";
import type { FilamentDbSpool } from "./types";

/**
 * `series` (a product line such as "PolyLite") is kept in the raw record but not folded into the
 * name: `color` is already the color name, and a series prefix would stop names matching other
 * services.
 */
export function mapSpool(spool: FilamentDbSpool): CommonSpool {
  const serial = String(spool["serial"]);
  return {
    source: "filamentdb",
    sourceId: serial,
    crossIds: { filamentdbSerial: serial },
    vendor: toText(spool["brand"]),
    material: toText(spool["type"]),
    name: toText(spool["color"]),
    colors: uniqueHexes([spool["colorHex"]]),
    diameter: toPositiveNumber(spool["diameter"]),
    density: toPositiveNumber(spool["density"]),
    nozzleTempMin: toPositiveNumber(spool["temperatureNozzleMin"]),
    nozzleTempMax: toPositiveNumber(spool["temperatureNozzleMax"]),
    bedTempMin: toPositiveNumber(spool["temperatureBedMin"]),
    bedTempMax: toPositiveNumber(spool["temperatureBedMax"]),
    upc: toText(spool["gtin"]),
    initialWeight: toPositiveNumber(spool["weightTotal"]),
    remainingWeight: toNonNegativeNumber(spool["weightRemaining"]),
    emptySpoolWeight: toNonNegativeNumber(spool["weightSpool"]),
    location: null,
    price: null,
    purchasedOn: null,
    lotNr: toText(spool["batchNumber"]),
    finish: readFinish(spool["finish"]),
    td: toNonNegativeNumber(spool["transmissionDistance"]),
    comment: toText(spool["notes"]),
    archived: toBoolean(spool["deleted"]),
    raw: spool,
  };
}
