import type { FieldChange, SpoolValues } from "../../core/compare";
import type { ComparableField } from "../../core/model";
import type { PrintStudioLot, PrintStudioLotPayload } from "./types";

/** Fields PrintStudio can store on a lot; anything else in a change has no place there. */
export const WRITABLE_FIELDS: ReadonlySet<ComparableField> = new Set([
  "vendor",
  "material",
  "name",
  "colors",
  "remainingWeight",
]);

/** PrintStudio shows at most this many colours on a spool (`spoolAppearanceSchema`). */
const MAX_COLORS = 8;

const roundPrice = (value: number) => Math.round(value * 100000) / 100000;

const blank = (value: string | null): string | null => (value?.trim() ? value.trim() : null);

/**
 * Lot codes are lower-case slugs (`/^[a-z0-9][a-z0-9_-]*$/`), the way PrintStudio's own import
 * names them.
 */
export function lotCode(material: string | null): string {
  const slug = (material ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "filament";
}

export const lotLabel = (vendor: string | null, material: string | null, name: string | null) =>
  [vendor, material, name].filter(Boolean).join(" ");

const hashed = (colors: readonly string[], label: string): string[] => {
  if (colors.length > MAX_COLORS)
    throw new Error(
      `${label}: PrintStudio accepts at most ${MAX_COLORS} colors. Resolve the colors before writing.`,
    );
  return colors.map((color) => `#${color.toUpperCase()}`);
};

/** Appearance for `colors`, keeping a stored lot's pattern, effects and extras. */
function appearanceFor(
  colors: readonly string[],
  existing: unknown,
  label: string,
  notes: string[],
): Record<string, unknown> | undefined {
  if (!colors.length) return undefined;
  const kept =
    existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {};
  const storedPattern = typeof kept["pattern"] === "string" ? kept["pattern"] : "solid";
  let pattern = "solid";
  if (colors.length > 1) {
    pattern = storedPattern === "solid" ? "gradient" : storedPattern;
    if (storedPattern === "solid")
      notes.push(`${label}: several colors were stored as a gradient pattern.`);
  }
  return { ...kept, colors: hashed(colors, label), pattern };
}

export interface PrintStudioCreatePlan {
  payload: PrintStudioLotPayload;
  notes: string[];
}

/** Request body for a new local lot; PrintStudio assigns the id and marks it `local`. */
export function createPayload(values: SpoolValues, label: string): PrintStudioCreatePlan {
  const notes: string[] = [];
  const vendor = blank(values.vendor);
  const material = blank(values.material);
  const name = blank(values.name);
  const quantity = values.remainingWeight ?? values.initialWeight;
  if (quantity === null) notes.push(`${label}: weight is unknown, so the lot starts at 0 g.`);
  else if (values.remainingWeight === null)
    notes.push(`${label}: remaining weight was unknown; the initial weight was used.`);
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0))
    throw new Error(`${label}: weights must be non-negative numbers.`);
  let unitCost = 0;
  if (values.price !== null) {
    if (values.initialWeight !== null && values.initialWeight > 0)
      unitCost = roundPrice(values.price / values.initialWeight);
    else
      notes.push(
        `${label}: price was not written: a positive initial weight is required to calculate PrintStudio's cost per gram.`,
      );
  }
  const appearance = appearanceFor(values.colors, undefined, label, notes);
  return {
    payload: {
      code: lotCode(material),
      family: "filament",
      label: lotLabel(vendor, material, name) || "Filament",
      ...(vendor ? { brand: vendor } : {}),
      ...(material ? { material } : {}),
      ...(name ? { colorName: name } : {}),
      quantityOnHand: quantity ?? 0,
      unit: "g",
      unitCostUsd: unitCost,
      reorderPoint: 0,
      ...(appearance ? { appearance } : {}),
    },
    notes,
  };
}

export interface PrintStudioUpdatePlan {
  /** Body for `PUT /api/materials/{id}`, or absent when no detail moved. */
  put?: PrintStudioLotPayload;
  /** Details PrintStudio can only clear through `PATCH /details` (a PUT keeps what it omits). */
  clear: Array<"brand" | "material">;
  /** The new quantity on hand, applied as a stock adjustment. */
  quantity?: number;
  notes: string[];
}

/** Plans the writes an update needs for a stored local lot. */
export function updatePlan(
  lot: PrintStudioLot,
  changes: readonly FieldChange[],
  label: string,
): PrintStudioUpdatePlan {
  for (const change of changes)
    if (!WRITABLE_FIELDS.has(change.field))
      throw new Error(`${label}: PrintStudio has no place for ${change.field}.`);
  const notes: string[] = [];
  const to = <F extends ComparableField>(field: F) =>
    changes.find((change) => change.field === field)?.to;
  const touched = (field: ComparableField) => changes.some((change) => change.field === field);
  const text = (key: string) => (typeof lot[key] === "string" ? (lot[key] as string) : null);
  const plan: PrintStudioUpdatePlan = { clear: [], notes };

  if (touched("remainingWeight")) {
    const value = to("remainingWeight");
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      throw new Error(`${label}: remaining weight must be a non-negative number of grams.`);
    plan.quantity = value;
  }

  const detail = touched("vendor") || touched("material") || touched("name") || touched("colors");
  if (!detail) return plan;

  const vendor = touched("vendor") ? blank(to("vendor") as string | null) : text("brand");
  const material = touched("material") ? blank(to("material") as string | null) : text("material");
  const name = touched("name") ? blank(to("name") as string | null) : text("colorName");
  if (touched("name") && name === null)
    throw new Error(
      `${label}: PrintStudio cannot clear a color name. Resolve the name before writing.`,
    );
  if (touched("vendor") && vendor === null && text("brand") !== null) plan.clear.push("brand");
  if (touched("material") && material === null && text("material") !== null)
    plan.clear.push("material");

  let appearance = lot["appearance"];
  if (touched("colors")) {
    const colors = to("colors") as string[];
    if (!colors.length && lot["appearance"])
      throw new Error(
        `${label}: PrintStudio cannot clear a spool's colors here. Resolve the colors before writing.`,
      );
    appearance = appearanceFor(colors, lot["appearance"], label, notes) ?? appearance;
  }
  plan.put = {
    code: lot["code"],
    family: lot["family"],
    label: lotLabel(vendor, material, name) || (text("label") ?? "Filament"),
    ...(vendor ? { brand: vendor } : {}),
    ...(material ? { material } : {}),
    ...(name ? { colorName: name } : {}),
    unit: lot["unit"],
    unitCostUsd: lot["unitCostUsd"],
    reorderPoint: lot["reorderPoint"],
    ...(appearance ? { appearance } : {}),
  };
  return plan;
}
