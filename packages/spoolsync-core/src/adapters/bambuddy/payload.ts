import type { FieldChange, SpoolValues } from "../../core/compare";
import type { CommonSpool, ComparableField } from "../../core/model";
import { exportWeights } from "../shared/weights";
import { roundPrice } from "./map";
import type { BambuddySpoolPayload } from "./types";

/**
 * Column limits Bambuddy's spool schema (`schemas/spool.py`) enforces. A longer value is refused
 * here, with the spool named, instead of coming back from the server as a bare validation error.
 */
const MAX_LENGTH = {
  material: 50,
  material_number: 64,
  storage_location: 255,
} as const;
/** Bambuddy keeps at most this many gradient stops after the main colour (`MAX_EXTRA_COLOR_STOPS`). */
const MAX_EXTRA_COLORS = 8;
/** Material Bambuddy needs for every spool; SpoolSync's CSV export uses the same fallback. */
export const DEFAULT_MATERIAL = "PLA";

/** Fields this adapter can send; anything else in a change cannot be stored by Bambuddy. */
const WRITABLE_FIELDS: ReadonlySet<ComparableField> = new Set([
  "vendor",
  "material",
  "name",
  "colors",
  "nozzleTempMin",
  "nozzleTempMax",
  "initialWeight",
  "remainingWeight",
  "emptySpoolWeight",
  "location",
  "price",
  "lotNr",
  "finish",
  "comment",
  "archived",
]);

/**
 * Price per kilogram for a price per spool, or null when it cannot be derived. Shared by the CSV
 * and API paths, since Bambuddy only stores `cost_per_kg`.
 */
export function costPerKg(price: number | null, initialWeight: number | null): number | null {
  if (price === 0) return 0;
  return price !== null && initialWeight !== null && initialWeight > 0
    ? roundPrice((price * 1000) / initialWeight)
    : null;
}

const blank = (value: string | null): string | null => (value?.trim() ? value : null);

function whole(label: string, name: string, value: number): number {
  if (!Number.isInteger(value))
    throw new Error(
      `${label}: ${name} must be a whole number for Bambuddy. Resolve the value before writing.`,
    );
  return value;
}

function limited(label: string, key: keyof typeof MAX_LENGTH, value: string | null): string | null {
  if (value !== null && value.length > MAX_LENGTH[key])
    throw new Error(`${label}: ${key} accepts at most ${MAX_LENGTH[key]} characters in Bambuddy.`);
  return value;
}

/**
 * Bambuddy's `rgba` is exactly eight hex characters; keep the stored alpha when the colour is
 * unchanged.
 */
function rgbaFor(color: string, existing: unknown): string {
  const hex = color.toUpperCase();
  return typeof existing === "string" &&
    /^[0-9A-Fa-f]{8}$/.test(existing) &&
    existing.slice(0, 6).toUpperCase() === hex
    ? existing
    : `${hex}FF`;
}

/**
 * Bambuddy stores each extra colour as 6 or 8 hex characters (the server lowercases them). A colour
 * that is already stored keeps its stored token, so its alpha survives; a new one is sent as six
 * uppercase characters.
 */
function extraColorsFor(colors: readonly string[], existing: unknown): string | null {
  if (!colors.length) return null;
  const stored = (
    Array.isArray(existing) ? existing : typeof existing === "string" ? existing.split(",") : []
  )
    .map((token) => String(token).trim().replace(/^#/, ""))
    .filter((token) => /^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(token));
  return colors
    .map(
      (color) =>
        stored.find((token) => token.slice(0, 6).toUpperCase() === color.toUpperCase()) ??
        color.toUpperCase(),
    )
    .join(",");
}

export interface BambuddyWritePlan {
  payload: BambuddySpoolPayload;
  /** The archived state to reach through the archive/restore endpoints; absent when unchanged. */
  archived?: boolean;
  /** Things worth telling the user that do not stop the write. */
  notes: string[];
}

interface Context {
  label: string;
  /** The stored record, so an unchanged colour keeps its alpha. */
  existing?: Record<string, unknown> | undefined;
}

/**
 * Maps SpoolSync values to Bambuddy fields. Creating sends every known value; updating sends only
 * the fields whose group (colours, weights, price) was touched, with `null` clearing a value.
 * Bambuddy-only fields (`effect_type`, `category`, `low_stock_threshold_pct`, tags, K profiles) are
 * never sent, so an update cannot disturb them.
 */
function encode(
  next: SpoolValues,
  touched: (field: ComparableField) => boolean,
  creating: boolean,
  { label, existing }: Context,
): BambuddyWritePlan {
  const payload: BambuddySpoolPayload = {};
  const notes: string[] = [];
  const put = (key: string, value: string | number | null) => {
    if (value !== null || !creating) payload[key] = value;
  };
  const required = (name: string, value: unknown) => {
    if (value === null || value === undefined)
      throw new Error(`${label}: Bambuddy cannot store a spool without ${name}.`);
  };

  if (touched("material")) {
    const material = blank(next.material);
    if (!creating) required("a material", material);
    put("material", limited(label, "material", material));
  }
  if (touched("vendor")) put("brand", blank(next.vendor));
  if (touched("name")) put("color_name", blank(next.name));
  if (touched("finish")) put("subtype", blank(next.finish));
  if (touched("lotNr"))
    put("material_number", limited(label, "material_number", blank(next.lotNr)?.trim() ?? null));
  if (touched("comment")) put("note", blank(next.comment));
  if (touched("location"))
    put("storage_location", limited(label, "storage_location", blank(next.location)));
  for (const [field, key] of [
    ["nozzleTempMin", "nozzle_temp_min"],
    ["nozzleTempMax", "nozzle_temp_max"],
  ] as const)
    if (touched(field)) put(key, next[field] === null ? null : whole(label, key, next[field]));
  if (touched("emptySpoolWeight")) {
    if (!creating) required("an empty spool weight", next.emptySpoolWeight);
    if (next.emptySpoolWeight !== null)
      put("core_weight", whole(label, "empty spool weight", next.emptySpoolWeight));
  }

  if (touched("colors")) {
    if (next.colors.length > MAX_EXTRA_COLORS + 1)
      throw new Error(
        `${label}: Bambuddy accepts at most ${MAX_EXTRA_COLORS} secondary colors. Resolve the colors before writing.`,
      );
    const [first, ...rest] = next.colors;
    put("rgba", first === undefined ? null : rgbaFor(first, existing?.["rgba"]));
    put("extra_colors", extraColorsFor(rest, existing?.["extra_colors"]));
  }

  if (touched("initialWeight") || touched("remainingWeight")) {
    if (creating) {
      // Unknown weights are left to Bambuddy's own defaults (a full 1000 g spool).
      if (next.initialWeight !== null || next.remainingWeight !== null) {
        const weights = exportWeights(next.initialWeight, next.remainingWeight, label);
        payload["label_weight"] = whole(label, "label weight", weights.total);
        payload["weight_used"] = weights.used;
        notes.push(...weights.warnings);
      } else {
        notes.push(`${label}: weights are unknown, so Bambuddy's default 1000 g spool was used.`);
      }
    } else {
      if (touched("initialWeight")) {
        required("an initial weight", next.initialWeight);
        payload["label_weight"] = whole(label, "label weight", next.initialWeight as number);
      }
      if (touched("remainingWeight")) {
        required("a remaining weight", next.remainingWeight);
        required("an initial weight", next.initialWeight);
      }
      if (next.initialWeight !== null && next.remainingWeight !== null) {
        if (
          !Number.isFinite(next.remainingWeight) ||
          next.remainingWeight < 0 ||
          next.remainingWeight > next.initialWeight
        )
          throw new Error(
            `${label}: remaining weight must be between 0 and the initial weight. Resolve the weights before writing.`,
          );
        payload["weight_used"] = roundPrice(next.initialWeight - next.remainingWeight);
      }
    }
  }

  // Bambuddy stores a price per kilogram, so a new label weight moves it to keep the spool price.
  if (touched("price") || touched("initialWeight")) {
    const cost = costPerKg(next.price, next.initialWeight);
    if (cost !== null) put("cost_per_kg", cost);
    else if (next.price === null) {
      if (touched("price")) put("cost_per_kg", null);
    } else {
      const problem = `a positive initial weight is required to calculate Bambuddy's cost per kilogram.`;
      if (!creating) throw new Error(`${label}: price cannot be written: ${problem}`);
      notes.push(`${label}: price was not written: ${problem}`);
    }
  }

  return {
    payload,
    notes,
    ...(touched("archived") ? { archived: next.archived } : {}),
  };
}

/** Request body for a new spool, plus the archived state to apply once it exists. */
export function createPayload(values: SpoolValues, label: string): BambuddyWritePlan {
  const material = blank(values.material);
  const plan = encode({ ...values, material: material ?? DEFAULT_MATERIAL }, () => true, true, {
    label,
  });
  if (!material)
    plan.notes.push(`${label}: material was unknown, so ${DEFAULT_MATERIAL} was used.`);
  if (!values.archived) delete plan.archived;
  return plan;
}

/** Request body for the fields an update moved, using only what Bambuddy can store. */
export function updatePayload(
  spool: CommonSpool,
  changes: readonly FieldChange[],
  label: string,
  existing?: Record<string, unknown>,
): BambuddyWritePlan {
  for (const change of changes)
    if (!WRITABLE_FIELDS.has(change.field))
      throw new Error(`${label}: Bambuddy has no place for ${change.field}.`);
  const next = {
    ...spool,
    ...Object.fromEntries(changes.map((change) => [change.field, change.to])),
  } as SpoolValues;
  const fields = new Set(changes.map((change) => change.field));
  return encode(next, (field) => fields.has(field), false, { label, existing });
}
