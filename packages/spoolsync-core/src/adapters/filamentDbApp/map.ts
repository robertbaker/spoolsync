import type { CommonSpool } from "../../core/model";
import { toNonNegativeNumber, toPositiveNumber, toText, uniqueHexes } from "../../core/normalize";
import { spoolPrice } from "./records";
import type { FilamentDbAppFilament } from "./types";

type Bag = Record<string, unknown>;

const isBag = (value: unknown): value is Bag =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Mongo ids arrive as strings, or as `{ $oid }` in extended JSON. */
export function idOf(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (isBag(value) && typeof value["$oid"] === "string") return value["$oid"];
  return null;
}

/** Dates arrive as ISO strings, or as `{ $date }` in extended JSON. */
function dateOf(value: unknown): string | null {
  const raw = isBag(value) ? value["$date"] : value;
  if (typeof raw !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match ? match[1]! : null;
}

/**
 * A variant's blank values fall through to its parent, as Filament DB itself resolves them. The
 * name, color, spools and ids always belong to the variant.
 */
function inherited(filament: Bag, parent: Bag | undefined, key: string): unknown {
  const own = filament[key];
  if (own !== null && own !== undefined && own !== "") return own;
  return parent?.[key];
}

function temperature(filament: Bag, parent: Bag | undefined, key: string): number | null {
  const own = isBag(filament["temperatures"]) ? filament["temperatures"][key] : undefined;
  const fallback = isBag(parent?.["temperatures"]) ? parent["temperatures"][key] : undefined;
  return toPositiveNumber(own ?? fallback);
}

/**
 * Id of the spool SpoolSync synthesizes for a legacy single-roll filament; the CSV export uses it
 * too.
 */
export const legacySpoolId = (filamentId: string) => `legacy:${filamentId}`;

/**
 * A legacy filament tracks its one roll on the filament itself (`totalWeight`, with no `spools`
 * entries). Templates (filaments with color variants) never hold a roll.
 */
export function isLegacyRoll(filament: FilamentDbAppFilament, isTemplate: boolean): boolean {
  return (
    !isTemplate &&
    Array.isArray(filament["spools"]) &&
    filament["spools"].length === 0 &&
    typeof filament["totalWeight"] === "number" &&
    idOf(filament["_id"]) !== null
  );
}

/**
 * The spool export writes the stored filament name (a variant's is often "Parent - Red"), but
 * SpoolSync names a spool by its color name. A variant's name that starts with its parent's name
 * and a separator loses that prefix; anything else is kept whole. The JSON and CSV loads share this
 * so one variant gets one name in both.
 */
export function spoolName(stored: string | null, parent: string | null): string | null {
  if (!stored || !parent || !stored.toLowerCase().startsWith(parent.toLowerCase())) return stored;
  // The prefix only counts when a separator follows it ("PLA+ Red" is not "PLA" + "+ Red").
  const separator = /^[\s\-–—:|/·]+/.exec(stored.slice(parent.length));
  if (!separator) return stored;
  return stored.slice(parent.length + separator[0].length) || stored;
}

export function mapFilamentSpools(
  filament: FilamentDbAppFilament,
  parent: FilamentDbAppFilament | undefined,
  locations: Record<string, string>,
  isTemplate = false,
): CommonSpool[] {
  if (!Array.isArray(filament["spools"])) return [];
  const vendor = toText(inherited(filament, parent, "vendor"));
  const material = toText(inherited(filament, parent, "type"));
  const name =
    toText(filament["colorName"]) ??
    spoolName(toText(filament["name"]), parent ? toText(parent["name"]) : null);
  const own = Array.isArray(filament["secondaryColors"]) ? filament["secondaryColors"] : [];
  const secondary =
    own.length === 0 && Array.isArray(parent?.["secondaryColors"])
      ? parent["secondaryColors"]
      : own;
  const colors = uniqueHexes([filament["color"], ...secondary]);
  const nozzle = temperature(filament, parent, "nozzle");
  const nozzleMin = temperature(filament, parent, "nozzleRangeMin") ?? nozzle;
  const nozzleMax = temperature(filament, parent, "nozzleRangeMax") ?? nozzle;
  const parentTemps = isBag(parent?.["temperatures"]) ? parent["temperatures"] : null;
  const tare = toNonNegativeNumber(inherited(filament, parent, "spoolWeight"));
  const net = toPositiveNumber(inherited(filament, parent, "netFilamentWeight"));
  const cost = toNonNegativeNumber(inherited(filament, parent, "cost"));
  const td = toNonNegativeNumber(inherited(filament, parent, "transmissionDistance"));

  const spools: CommonSpool[] = [];
  const legacyId = isLegacyRoll(filament, isTemplate)
    ? legacySpoolId(idOf(filament["_id"])!)
    : null;
  const rolls: unknown[] = legacyId
    ? [{ _id: legacyId, totalWeight: filament["totalWeight"], legacyRoll: true }]
    : (filament["spools"] as unknown[]);
  for (const spool of rolls) {
    if (!isBag(spool)) continue;
    const id = idOf(spool["_id"]) ?? toText(spool["instanceId"]);
    if (!id) continue;
    const gross = toNonNegativeNumber(spool["totalWeight"]);
    const locationId = idOf(spool["locationId"]);
    spools.push({
      source: "filamentDbApp",
      sourceId: id,
      crossIds: { filamentDbAppId: id },
      vendor,
      material,
      name,
      colors,
      diameter: toPositiveNumber(inherited(filament, parent, "diameter")),
      density: toPositiveNumber(inherited(filament, parent, "density")),
      nozzleTempMin: nozzleMin,
      nozzleTempMax: nozzleMax,
      bedTempMin: temperature(filament, parent, "bed"),
      bedTempMax: null,
      upc: null,
      initialWeight: net,
      // Filament DB stores the weight on the scale, so the empty spool comes off to leave filament.
      remainingWeight: gross === null ? null : Math.max(0, gross - (tare ?? 0)),
      emptySpoolWeight: tare,
      location: locationId ? (locations[locationId] ?? null) : null,
      price: cost !== null && net !== null ? spoolPrice(cost, net) : null,
      purchasedOn: dateOf(spool["purchaseDate"]),
      lotNr: toText(spool["lotNumber"]),
      // Filament DB has no finish field; Matte and Silk exist only as OpenPrintTag spec tags.
      finish: null,
      td,
      comment: toText(spool["label"]),
      archived: spool["retired"] === true,
      raw: {
        filamentId: idOf(filament["_id"]),
        spool,
        ...(legacyId ? { legacyRoll: true } : {}),
        ...(parentTemps ? { parentTemperatures: parentTemps } : {}),
      },
    });
  }
  return spools;
}

/** The identity of a filament as SpoolSync sees it, with a variant's blanks taken from its parent. */
export function filamentProfile(filament: FilamentDbAppFilament, parent?: FilamentDbAppFilament) {
  const own = Array.isArray(filament["secondaryColors"]) ? filament["secondaryColors"] : [];
  const secondary =
    own.length === 0 && Array.isArray(parent?.["secondaryColors"])
      ? parent["secondaryColors"]
      : own;
  return {
    vendor: toText(inherited(filament, parent, "vendor")),
    material: toText(inherited(filament, parent, "type")),
    names: [toText(filament["colorName"]), toText(filament["name"])].filter(
      (name): name is string => name !== null,
    ),
    colors: uniqueHexes([filament["color"], ...secondary]),
    tare: toNonNegativeNumber(inherited(filament, parent, "spoolWeight")),
  };
}
