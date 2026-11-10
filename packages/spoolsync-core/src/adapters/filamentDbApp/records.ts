import type { PlannedChange } from "../../core/compare";
import { toNonNegativeNumber, toNumber, toText } from "../../core/normalize";

/**
 * Filament DB keeps a product on the filament and each roll as a spool inside it, so a SpoolSync
 * change splits in two. Spool fields belong to one roll; filament fields are shared by every spool
 * of that filament (a color variant is one color, so in practice that is the rolls of one product).
 * Temperatures use dotted keys, which Filament DB merges into the stored `temperatures` object.
 */
export interface FilamentPatch {
  vendor?: string;
  type?: string;
  /** Written as `colorName`, because SpoolSync's name for a spool is the color name. */
  colorName?: string | null;
  color?: string | null;
  secondaryColors?: string[];
  diameter?: number | null;
  density?: number | null;
  /** Per kilogram, as Filament DB stores it. */
  cost?: number | null;
  netFilamentWeight?: number | null;
  spoolWeight?: number | null;
  /** HueForge transmission distance; shared by all of the filament's spools. */
  transmissionDistance?: number | null;
  /** The scale weight of a legacy single-roll filament, which has no spool record. */
  totalWeight?: number | null;
  /** Cleared (null) with a range endpoint so the old single nozzle value cannot reappear. */
  "temperatures.nozzle"?: number | null;
  "temperatures.nozzleRangeMin"?: number | null;
  "temperatures.nozzleRangeMax"?: number | null;
  "temperatures.bed"?: number | null;
}

export interface SpoolPatch {
  /** Grams of filament left; Filament DB adds the spool's empty weight itself. */
  remainingWeight?: number | null;
  purchaseDate?: string | null;
  retired?: boolean;
  locationId?: string | null;
  label?: string;
  lotNumber?: string | null;
}

export interface Patches {
  filament: FilamentPatch;
  spool: SpoolPatch;
}

export interface PatchContext {
  locationIdByName: ReadonlyMap<string, string>;
  /** The spool is a legacy single roll stored on the filament, so only its weight can be written. */
  legacyRoll?: boolean;
  /** Reports a value that cannot be written; the API path throws, the file path warns. */
  problem: (message: string) => void;
  /**
   * Reports an over-long label or lot number, which is left unchanged rather than failing the
   * change. Defaults to `problem`.
   */
  warn?: (message: string) => void;
}

/** Filament DB rejects a spool label or lot number longer than this (`MAX_SPOOL_TEXT_LENGTH`). */
export const MAX_SPOOL_TEXT_LENGTH = 200;

/**
 * Returns the text if Filament DB accepts its length; otherwise reports it and returns `undefined`
 * so the field is left unchanged rather than failing the whole write.
 */
export function withinTextLimit(
  value: string | null,
  field: string,
  problem: (message: string) => void,
): string | null | undefined {
  if (value === null || value.length <= MAX_SPOOL_TEXT_LENGTH) return value;
  problem(
    `Filament DB limits a spool's ${field} to ${MAX_SPOOL_TEXT_LENGTH} characters, so it was left unchanged (or left out of a new spool).`,
  );
  return undefined;
}

const hash = (hex: string) => `#${hex}`;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** SpoolSync prices a spool; Filament DB prices a kilogram of the filament. */
export function costPerKg(price: number, netWeight: number): number {
  return round2((price * 1000) / netWeight);
}

export function spoolPrice(costPerKilogram: number, netWeight: number): number {
  return round2((costPerKilogram * netWeight) / 1000);
}

/** Translates planned field changes into the filament and spool patches that carry them out. */
export function changePatches(
  change: Extract<PlannedChange, { kind: "update" }>,
  context: PatchContext,
): Patches {
  const filament: FilamentPatch = {};
  const spool: SpoolPatch = {};
  const newNet = change.changes.find((c) => c.field === "initialWeight");
  const netWeight = newNet ? toNumber(newNet.to) : change.spool.initialWeight;
  for (const { field, to } of change.changes) {
    switch (field) {
      case "vendor":
        if (toText(to)) filament.vendor = toText(to)!;
        else context.problem("Filament DB requires a brand, so it was left unchanged.");
        break;
      case "material":
        if (toText(to)) filament.type = toText(to)!;
        else context.problem("Filament DB requires a material, so it was left unchanged.");
        break;
      case "name":
        filament.colorName = toText(to);
        break;
      case "colors": {
        const [first, ...rest] = to as string[];
        filament.color = first ? hash(first) : null;
        filament.secondaryColors = rest.slice(0, 5).map(hash);
        if (rest.length > 5)
          context.problem("Filament DB keeps six colors at most, so the extra ones were dropped.");
        break;
      }
      case "diameter": {
        // Filament DB's schema rejects a diameter below 0.01 and has no way to clear it.
        const diameter = toNumber(to);
        if (diameter !== null && diameter >= 0.01) filament.diameter = diameter;
        else
          context.problem(
            "Filament DB requires a diameter of at least 0.01 mm, so it was left unchanged.",
          );
        break;
      }
      case "density": {
        const density = toNumber(to);
        if (density === null || density >= 0) filament.density = density;
        else
          context.problem(
            "Filament DB does not accept a negative density, so it was left unchanged.",
          );
        break;
      }
      case "td": {
        const td = toNumber(to);
        if (td === null || td >= 0) filament.transmissionDistance = td;
        else
          context.problem("Filament DB does not accept a negative TD, so it was left unchanged.");
        break;
      }
      case "lotNr": {
        const lot = withinTextLimit(toText(to), "lot number", context.warn ?? context.problem);
        if (lot !== undefined) spool.lotNumber = lot;
        break;
      }
      case "nozzleTempMin":
      case "nozzleTempMax": {
        const key = field === "nozzleTempMin" ? "nozzleRangeMin" : "nozzleRangeMax";
        const value = toNumber(to);
        filament[`temperatures.${key}`] = value;
        // The load reads nozzleRangeMin ?? nozzle, so a cleared endpoint must clear nozzle too.
        if (value === null) {
          filament["temperatures.nozzle"] = null;
          // Filament DB resolves a variant's blank temperature to its parent's, so it comes back.
          const parentTemps = (
            change.spool.raw as { parentTemperatures?: Record<string, unknown> } | null
          )?.parentTemperatures;
          if (
            parentTemps &&
            (toNumber(parentTemps[key]) !== null || toNumber(parentTemps["nozzle"]) !== null)
          )
            (context.warn ?? context.problem)(
              `The ${field === "nozzleTempMin" ? "minimum" : "maximum"} nozzle temperature is inherited from the template filament in Filament DB, so clearing it on the color variant leaves the template's value in effect. Clear it on the template to remove it.`,
            );
        }
        break;
      }
      case "bedTempMin":
        filament["temperatures.bed"] = toNumber(to);
        break;
      case "initialWeight":
        filament.netFilamentWeight = toNumber(to);
        break;
      case "emptySpoolWeight":
        filament.spoolWeight = toNumber(to);
        break;
      case "price": {
        const price = toNumber(to);
        if (price === null) filament.cost = null;
        else if (netWeight && netWeight > 0) filament.cost = costPerKg(price, netWeight);
        else
          context.problem(
            "Filament DB prices per kilogram, so a spool price needs a net weight; the price was left unchanged.",
          );
        break;
      }
      case "remainingWeight":
        spool.remainingWeight = toNonNegativeNumber(to);
        break;
      case "purchasedOn":
        spool.purchaseDate = toText(to);
        break;
      case "archived":
        spool.retired = Boolean(to);
        break;
      case "comment": {
        // A spool's label is its free-text name, e.g. "Roll 3".
        const label = withinTextLimit(toText(to), "label", context.warn ?? context.problem);
        if (label !== undefined) spool.label = label ?? "";
        break;
      }
      case "location": {
        const name = toText(to);
        if (name === null) spool.locationId = null;
        else {
          const id = context.locationIdByName.get(name.toLowerCase());
          if (id) spool.locationId = id;
          else
            context.problem(
              `Location "${name}" does not exist in Filament DB. Create it there first.`,
            );
        }
        break;
      }
      default:
        break;
    }
  }
  if (newNet && !change.changes.some((c) => c.field === "price") && change.spool.price !== null) {
    if (netWeight && netWeight > 0) filament.cost = costPerKg(change.spool.price, netWeight);
    else
      context.problem(
        "Filament DB prices per kilogram, so a spool price needs a net weight; the price was left unchanged.",
      );
  }
  if (context.legacyRoll) return legacyPatches(change, filament, spool, context);
  return { filament, spool };
}

/**
 * The remaining weight a spool has to be written with. Filament DB stores the scale weight, so a
 * new empty-spool weight would otherwise move what is left. `undefined` leaves the spool's weight
 * alone.
 */
export function remainingToWrite(
  change: Extract<PlannedChange, { kind: "update" }>,
  patches: Patches,
): number | null | undefined {
  if (patches.spool.remainingWeight !== undefined) return patches.spool.remainingWeight;
  return patches.filament.spoolWeight !== undefined ? change.spool.remainingWeight : undefined;
}

/**
 * A legacy roll has no spool record: its remaining weight is the filament's own `totalWeight` (the
 * scale weight, so the empty spool is added back), and any other spool field has no place to go.
 */
function legacyPatches(
  change: Extract<PlannedChange, { kind: "update" }>,
  filament: FilamentPatch,
  spool: SpoolPatch,
  context: PatchContext,
): Patches {
  const { remainingWeight, ...others } = spool;
  if (Object.keys(others).length)
    context.problem(
      "This roll is stored on the filament itself, so only its weight can be written; the other spool fields were left unchanged. Add a spool in Filament DB to keep them.",
    );
  const remaining =
    remainingWeight !== undefined
      ? remainingWeight
      : filament.spoolWeight !== undefined
        ? change.spool.remainingWeight
        : undefined;
  if (remaining !== undefined) {
    const tare =
      filament.spoolWeight !== undefined ? filament.spoolWeight : change.spool.emptySpoolWeight;
    filament.totalWeight = remaining === null ? null : remaining + (tare ?? 0);
  }
  return { filament, spool: {} };
}

/** Applies a filament patch to a filament inside a snapshot. */
export function patchSnapshotFilament(
  filament: Record<string, unknown>,
  patch: FilamentPatch,
): void {
  for (const [key, value] of Object.entries(patch)) {
    if (key.startsWith("temperatures.")) {
      const temperatures =
        filament["temperatures"] && typeof filament["temperatures"] === "object"
          ? (filament["temperatures"] as Record<string, unknown>)
          : {};
      const tempKey = key.slice("temperatures.".length);
      temperatures[tempKey] = value;
      if ((tempKey === "nozzleRangeMin" || tempKey === "nozzleRangeMax") && value === null)
        delete temperatures["nozzle"];
      filament["temperatures"] = temperatures;
    } else filament[key] = value;
  }
}

/** Applies a spool patch to a spool inside a snapshot, where the scale weight is stored. */
export function patchSnapshotSpool(
  spool: Record<string, unknown>,
  patch: SpoolPatch,
  emptySpoolWeight: number | null,
): void {
  if (patch.remainingWeight !== undefined)
    spool["totalWeight"] =
      patch.remainingWeight === null ? null : patch.remainingWeight + (emptySpoolWeight ?? 0);
  if (patch.purchaseDate !== undefined) spool["purchaseDate"] = patch.purchaseDate;
  if (patch.retired !== undefined) spool["retired"] = patch.retired;
  if (patch.locationId !== undefined) spool["locationId"] = patch.locationId;
  if (patch.label !== undefined) spool["label"] = patch.label;
  if (patch.lotNumber !== undefined) spool["lotNumber"] = patch.lotNumber;
}
