import type { CommonSpool } from "../../core/model";
import {
  toBoolean,
  toNonNegativeNumber,
  toPositiveNumber,
  toText,
  uniqueHexes,
} from "../../core/normalize";
import type { FilamentDbSpool } from "./types";

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
    comment: toText(spool["notes"]),
    archived: toBoolean(spool["deleted"]),
    raw: spool,
  };
}
