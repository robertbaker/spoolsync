import type { CommonSpool, SourceId } from "./model";

/** Builds a common spool with sensible defaults for tests. */
export function makeSpool(
  source: SourceId,
  sourceId: string,
  overrides: Partial<CommonSpool> = {},
): CommonSpool {
  return {
    source,
    sourceId,
    crossIds:
      source === "spoolman"
        ? { spoolmanId: Number(sourceId) }
        : source === "spoolstock"
          ? { spoolstockShortId: sourceId }
          : {},
    vendor: "Prusament",
    material: "PLA",
    name: "Galaxy Black",
    colors: ["1A1A1A"],
    diameter: 1.75,
    density: 1.24,
    nozzleTempMin: null,
    nozzleTempMax: null,
    bedTempMin: null,
    bedTempMax: null,
    upc: null,
    initialWeight: 1000,
    remainingWeight: 640,
    emptySpoolWeight: null,
    location: null,
    price: null,
    purchasedOn: null,
    lotNr: null,
    comment: null,
    archived: false,
    raw: {},
    ...overrides,
  };
}
