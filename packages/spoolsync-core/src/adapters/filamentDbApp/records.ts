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
}

export interface Patches {
  filament: FilamentPatch;
  spool: SpoolPatch;
}

export interface PatchContext {
  locationIdByName: ReadonlyMap<string, string>;
  /** Reports a value that cannot be written; the API path throws, the file path warns. */
  problem: (message: string) => void;
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
      case "diameter":
        filament.diameter = toNumber(to);
        break;
      case "density":
        filament.density = toNumber(to);
        break;
      case "nozzleTempMin":
        filament["temperatures.nozzleRangeMin"] = toNumber(to);
        break;
      case "nozzleTempMax":
        filament["temperatures.nozzleRangeMax"] = toNumber(to);
        break;
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
      case "comment":
        // A spool's label is its free-text name, e.g. "Roll 3".
        spool.label = toText(to) ?? "";
        break;
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
  return { filament, spool };
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
      temperatures[key.slice("temperatures.".length)] = value;
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
}
