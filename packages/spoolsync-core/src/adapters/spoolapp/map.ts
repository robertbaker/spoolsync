import type { CommonSpool } from "../../core/model";
import {
  toDate,
  toNonNegativeNumber,
  toPositiveNumber,
  toText,
  uniqueHexes,
} from "../../core/normalize";
import type { SpoolAppSpool } from "./schema";

const RETIRED_LIFECYCLES = new Set(["finished", "archived", "empty", "depleted", "retired"]);

export function spoolAppToCommon(spool: SpoolAppSpool): CommonSpool {
  const colors = uniqueHexes(
    spool.isMulticolour && spool.multiHexes?.length ? spool.multiHexes : [spool.colourHex],
  );
  const temperature = toPositiveNumber(spool.nozzleTemp);
  const bedTemperature = toPositiveNumber(spool.bedTemp);
  const lifecycle = toText(spool.lifecycleRaw)?.toLowerCase() ?? "";
  return {
    source: "spoolapp",
    sourceId: spool.id,
    crossIds: { spoolappId: spool.id },
    vendor: toText(spool.brand),
    material: toText(spool.materialType),
    name: toText(spool.colourName),
    colors,
    diameter: toPositiveNumber(spool.diameterMm),
    density: null,
    nozzleTempMin: temperature,
    nozzleTempMax: temperature,
    bedTempMin: bedTemperature,
    bedTempMax: bedTemperature,
    upc: null,
    initialWeight: toPositiveNumber(spool.nominalWeight),
    remainingWeight: toNonNegativeNumber(spool.currentWeight),
    emptySpoolWeight: toNonNegativeNumber(spool.emptySpoolGrams),
    // Storage locations are slot numbers into a separate list that the backup may leave empty.
    location: null,
    price: toNonNegativeNumber(spool.purchasePrice),
    purchasedOn: toDate(spool.purchaseDate),
    lotNr: null,
    comment: toText(spool.notes),
    archived: Boolean(spool.isArchived || spool.isFinished) || RETIRED_LIFECYCLES.has(lifecycle),
    raw: spool,
  };
}
