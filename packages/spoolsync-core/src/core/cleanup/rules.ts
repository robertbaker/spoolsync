import type { ComparableField } from "../model";
import { formatMaterial, nameMentions, parseMaterial, sameMaterialLetters } from "./materials";
import {
  isIsoDate,
  looksLikeScientific,
  normalizeBarcode,
  normalizeDate,
  normalizeHex,
  parseDiameter,
  parsePrice,
  parseTemperature,
  parseWeight,
} from "./numbers";
import { cleanInline, cleanMultiline, plainKey, recase } from "./text";
import type {
  CleanupConfidence,
  CleanupFinding,
  CleanupRule,
  CleanupRuleId,
  CleanupRuleOutput,
  CleanupStep,
} from "./types";
import { canonicalVendor } from "./vendors";

/** Standard filament diameters in millimetres. */
export const STANDARD_DIAMETERS: readonly number[] = [1.75, 2.85, 3];
/** A single spool above this price is flagged as implausible (a total, cents, or a typo). */
export const PRICE_WARN_ABOVE = 500;
/** Net weights below this many grams look like kilograms; above the upper bound, like a typo. */
export const WEIGHT_LOOKS_LIKE_KG_BELOW = 10;
export const WEIGHT_WARN_ABOVE = 10_000;

const NOISE = 1e-6;

const output = (): CleanupRuleOutput => ({ steps: [], warnings: [] });
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const quote = (value: string) => `"${value.length > 40 ? `${value.slice(0, 37)}...` : value}"`;

function step(
  out: CleanupRuleOutput,
  field: ComparableField,
  value: unknown,
  confidence: CleanupConfidence,
  reason: string,
  bundle?: string,
): void {
  const entry: CleanupStep = { field, value, confidence, reason };
  if (bundle) entry.bundle = bundle;
  out.steps.push(entry);
}

const warn = (out: CleanupRuleOutput, field: ComparableField, message: string): void => {
  out.warnings.push({ field, message } satisfies CleanupFinding);
};

const TEXT_FIELDS = ["vendor", "material", "name", "upc", "location", "comment"] as const;

const whitespace: CleanupRule = {
  id: "whitespace",
  label: "Trim whitespace",
  description:
    "Removes leading and trailing spaces, repeated spaces, non-breaking spaces and invisible characters. Notes keep their line breaks.",
  run({ draft }) {
    const out = output();
    for (const field of TEXT_FIELDS) {
      const value = text(draft[field]);
      // An empty string is a value some services keep; only visible text is cleaned.
      if (value === null || value === "") continue;
      const cleaned = field === "comment" ? cleanMultiline(value) : cleanInline(value);
      if (cleaned === value) continue;
      if (cleaned === "")
        step(out, field, null, "review", "Only whitespace; treated as no value.");
      else
        step(
          out,
          field,
          cleaned,
          "safe",
          "Removed extra, non-breaking or invisible whitespace.",
        );
    }
    return out;
  },
};

const casing: CleanupRule = {
  id: "casing",
  label: "Fix capitalization",
  description:
    "Title-cases brand and color names written entirely in lowercase or capitals, keeping brand spellings (eSUN) and material words (PLA+, PETG-CF). Mixed-case text is left alone.",
  run({ draft }) {
    const out = output();
    for (const field of ["vendor", "name"] as const) {
      const value = text(draft[field]);
      if (!value) continue;
      const result = recase(value);
      if (!result) continue;
      step(
        out,
        field,
        result.text,
        result.uncertain ? "review" : "safe",
        result.uncertain
          ? "Capitalized; short capital words were kept in case they are acronyms."
          : "Capitalized like a name.",
      );
    }
    return out;
  },
};

const vendorAlias: CleanupRule = {
  id: "vendor-alias",
  label: "Standard brand names",
  description:
    "Replaces known spellings of a brand (Prusament Inc, E-Sun, Bambulab) with one canonical name. Extend the table to teach it your own.",
  run({ draft, vendorIndex }) {
    const out = output();
    const value = text(draft.vendor);
    if (!value) return out;
    const canonical = canonicalVendor(value, vendorIndex);
    if (!canonical || canonical === value) return out;
    const cosmetic = plainKey(canonical) === plainKey(value);
    step(
      out,
      "vendor",
      canonical,
      cosmetic ? "safe" : "review",
      cosmetic ? `Spelled as ${canonical}.` : `${quote(value)} is a known spelling of ${canonical}.`,
    );
    return out;
  },
};

const material: CleanupRule = {
  id: "material",
  label: "Standard material names",
  description:
    "Writes materials one way: PLA+, PETG-CF, ABS-GF, PA12, TPU 95A. Nylon and polyamide become PA. Unknown or blended materials are not touched.",
  run({ draft }) {
    const out = output();
    const value = text(draft.material);
    if (!value) return out;
    const parsed = parseMaterial(value);
    if (!parsed) return out;
    const canonical = formatMaterial(parsed, true);
    if (canonical === value) return out;
    const cosmetic = !parsed.synonym && sameMaterialLetters(canonical, value);
    step(
      out,
      "material",
      canonical,
      cosmetic ? "safe" : "review",
      cosmetic ? `Written as ${canonical}.` : `${quote(value)} is usually written ${canonical}.`,
    );
    return out;
  },
};

const materialVariant: CleanupRule = {
  id: "material-variant",
  label: "Move finishes to the name",
  description:
    "Takes a finish such as Silk, Matte or Marble out of the material and puts it at the start of the name, so the material is only the plastic. Needs a name; nothing moves without one.",
  run({ draft }) {
    const out = output();
    const value = text(draft.material);
    const name = text(draft.name)?.trim();
    if (!value || !name) return out;
    const parsed = parseMaterial(value);
    if (!parsed?.variants.length) return out;
    const missing = parsed.variants.filter((variant) => !nameMentions(name, variant));
    const bundle = missing.length ? "material-variant" : undefined;
    step(
      out,
      "material",
      formatMaterial(parsed, false),
      "review",
      missing.length
        ? `Moves ${parsed.variants.join(" ")} from the material to the name.`
        : `${parsed.variants.join(" ")} is already in the name.`,
      bundle,
    );
    if (missing.length)
      step(
        out,
        "name",
        `${missing.join(" ")} ${name}`,
        "review",
        `Adds ${missing.join(" ")} from the material.`,
        bundle,
      );
    return out;
  },
};

const diameter: CleanupRule = {
  id: "diameter",
  label: "Filament diameter",
  description:
    "Reads 1,75 or 1.75mm as 1.75, fixes 175 or 1750 (hundredths and thousandths of a mm) and rounds values very close to 1.75, 2.85 or 3. Other sizes are flagged.",
  run({ draft }) {
    const out = output();
    const original = draft.diameter;
    let value: number;
    let confidence: CleanupConfidence = "safe";
    const reasons: string[] = [];
    if (typeof original === "string") {
      if (!original.trim()) return out;
      const parsed = parseDiameter(original);
      if (parsed === null) {
        warn(out, "diameter", `Diameter ${quote(original)} is not a number.`);
        return out;
      }
      value = parsed;
      reasons.push(`Read ${quote(original)} as ${parsed} mm.`);
    } else if (isNumber(original)) value = original;
    else return out;

    if (value >= 100 && value <= 300) {
      value /= 100;
      confidence = "review";
      reasons.push("Looks like hundredths of a millimetre.");
    } else if (value >= 1000 && value <= 3500) {
      value /= 1000;
      confidence = "review";
      reasons.push("Looks like micrometres.");
    }
    const near = STANDARD_DIAMETERS.reduce((best, size) =>
      Math.abs(size - value) < Math.abs(best - value) ? size : best,
    );
    const gap = Math.abs(near - value);
    if (gap > 0 && gap <= 0.05 + 1e-9) {
      if (gap > 0.0005) {
        confidence = "review";
        reasons.push(`Close to the standard ${near} mm.`);
      } else reasons.push("Rounded.");
      value = near;
    } else if (gap > 0.0005) {
      warn(
        out,
        "diameter",
        value <= 0
          ? `Diameter ${value} mm is not possible.`
          : `Diameter ${Math.round(value * 1000) / 1000} mm is not a standard size (1.75, 2.85 or 3).`,
      );
    }
    if (value !== original) step(out, "diameter", value, confidence, reasons.join(" "));
    return out;
  },
};

const colorHex: CleanupRule = {
  id: "color-hex",
  label: "Color codes",
  description:
    "Writes colors as uppercase RRGGBB: removes #, expands 3-digit codes and drops an alpha channel (SpoolSync colors are opaque). Repeated colors are removed.",
  run({ draft }) {
    const out = output();
    const original = draft.colors;
    let list: unknown[];
    if (Array.isArray(original)) list = original;
    else if (typeof original === "string") list = original.split(/[\s,;]+/).filter(Boolean);
    else return out;
    if (list.some((item) => typeof item !== "string")) {
      warn(out, "colors", "A color entry is not text, so colors were left unchanged.");
      return out;
    }
    const colors: string[] = [];
    let changed = typeof original === "string";
    let confidence: CleanupConfidence = changed ? "review" : "safe";
    const reasons: string[] = [];
    for (const item of list as string[]) {
      const normalized = normalizeHex(item);
      if (!normalized) {
        warn(out, "colors", `Color ${quote(item)} is not a hex code.`);
        if (colors.includes(item)) changed = true;
        else colors.push(item);
        continue;
      }
      if (normalized.hex !== item) changed = true;
      if (normalized.droppedAlpha && normalized.droppedAlpha !== "FF") {
        confidence = "review";
        reasons.push(`Dropped transparency (${normalized.droppedAlpha}) from ${quote(item)}.`);
      }
      if (colors.includes(normalized.hex)) {
        changed = true;
        reasons.push(`Removed repeated color ${normalized.hex}.`);
      } else colors.push(normalized.hex);
    }
    if (changed)
      step(
        out,
        "colors",
        colors,
        confidence,
        reasons.length ? reasons.join(" ") : "Written as uppercase RRGGBB.",
      );
    return out;
  },
};

const price: CleanupRule = {
  id: "price",
  label: "Prices",
  description:
    "Reads prices written with symbols or either decimal convention ($24,99, 24.99 USD, € 1.299,00) as a plain number. Zero, negative and very high prices are flagged, never changed.",
  run({ draft }) {
    const out = output();
    const original = draft.price;
    let value: number;
    let confidence: CleanupConfidence = "safe";
    let reason = "";
    if (typeof original === "string") {
      if (!original.trim()) return out;
      const parsed = parsePrice(original);
      if (!parsed) {
        warn(out, "price", `Price ${quote(original)} is not a number.`);
        return out;
      }
      value = parsed.amount;
      if (parsed.ambiguous) confidence = "review";
      reason = `Read ${quote(original)} as ${value}${
        parsed.currency ? ` (${parsed.currency}; only the amount is stored)` : ""
      }${parsed.ambiguous ? ". The separator could mean thousands or decimals" : ""}.`;
    } else if (isNumber(original)) {
      value = original;
      const cents = Math.round(original * 100) / 100;
      if (cents !== original) {
        value = cents;
        if (Math.abs(cents - original) > NOISE) confidence = "review";
        reason = `Rounded to ${cents}.`;
      }
    } else {
      if (typeof original === "number") warn(out, "price", "Price is not a finite number.");
      return out;
    }
    if (value !== original) step(out, "price", value, confidence, reason);
    if (value < 0) warn(out, "price", `Price ${value} is negative.`);
    else if (value === 0) warn(out, "price", "Price is 0; set it or leave it blank.");
    else if (value > PRICE_WARN_ABOVE)
      warn(
        out,
        "price",
        `Price ${value} is unusually high for one spool; check it is not a total or in cents.`,
      );
    return out;
  },
};

const WEIGHT_FIELDS = ["initialWeight", "remainingWeight", "emptySpoolWeight"] as const;

const weight: CleanupRule = {
  id: "weight",
  label: "Weights",
  description:
    "Reads weights written with units (1kg, 250 g) as grams and removes rounding noise. Negative weights, more left than the full weight, and values that look like kilograms are flagged, not changed.",
  run({ draft }) {
    const out = output();
    const final: Partial<Record<(typeof WEIGHT_FIELDS)[number], number>> = {};
    for (const field of WEIGHT_FIELDS) {
      const original = draft[field];
      let value: number;
      if (typeof original === "string") {
        if (!original.trim()) continue;
        const parsed = parseWeight(original);
        if (!parsed) {
          warn(out, field, `Weight ${quote(original)} is not a number with a weight unit.`);
          continue;
        }
        value = parsed.grams;
        const plain = (parsed.unit === null || parsed.unit === "g") && !parsed.ambiguous;
        step(
          out,
          field,
          value,
          plain ? "safe" : "review",
          `Read ${quote(original)} as ${value} g${
            parsed.unit && parsed.unit !== "g" ? ` (converted from ${parsed.unit})` : ""
          }.`,
        );
      } else if (isNumber(original)) {
        value = original;
        const rounded = Math.round(original * 10) / 10;
        if (rounded !== original && Math.abs(rounded - original) < NOISE) {
          value = rounded;
          step(out, field, rounded, "safe", "Removed rounding noise.");
        }
      } else continue;
      final[field] = value;
    }
    for (const field of WEIGHT_FIELDS) {
      const value = final[field];
      if (value === undefined) continue;
      if (value < 0) warn(out, field, `Weight ${value} g is negative.`);
      else if (value > WEIGHT_WARN_ABOVE)
        warn(out, field, `Weight ${value} g is over 10 kg; check the unit.`);
    }
    const full = final.initialWeight;
    if (full !== undefined && full > 0 && full < WEIGHT_LOOKS_LIKE_KG_BELOW)
      warn(
        out,
        "initialWeight",
        `Net weight ${full} g looks like kilograms. Weights are stored in grams.`,
      );
    const left = final.remainingWeight;
    if (full !== undefined && left !== undefined && left > full + 0.5)
      warn(out, "remainingWeight", `Remaining ${left} g is more than the full weight ${full} g.`);
    const empty = final.emptySpoolWeight;
    if (full !== undefined && empty !== undefined && full > 0 && empty > full)
      warn(out, "emptySpoolWeight", `Empty spool ${empty} g is heavier than the filament ${full} g.`);
    return out;
  },
};

const NOZZLE_RANGE = [100, 500] as const;
const BED_RANGE = [0, 200] as const;
const TEMPERATURE_PAIRS = [
  ["nozzleTempMin", "nozzleTempMax", "nozzle", NOZZLE_RANGE],
  ["bedTempMin", "bedTempMax", "bed", BED_RANGE],
] as const;

const temperature: CleanupRule = {
  id: "temperature",
  label: "Temperatures",
  description:
    "Reads 210°C or 210 C as 210 and swaps a minimum that is above its maximum (for you to confirm). Temperatures outside a plausible range are flagged.",
  run({ draft }) {
    const out = output();
    const final = new Map<ComparableField, number>();
    for (const [low, high] of TEMPERATURE_PAIRS)
      for (const field of [low, high]) {
        const original = draft[field];
        let value: number;
        if (typeof original === "string") {
          if (!original.trim()) continue;
          const parsed = parseTemperature(original);
          if (!parsed) {
            warn(out, field, `Temperature ${quote(original)} is not a number.`);
            continue;
          }
          value = parsed.celsius;
          step(
            out,
            field,
            value,
            parsed.converted ? "review" : "safe",
            `Read ${quote(original)} as ${value} °C${parsed.converted ? " (converted from Fahrenheit)" : ""}.`,
          );
        } else if (isNumber(original)) {
          value = original;
          const rounded = Math.round(original);
          if (rounded !== original && Math.abs(rounded - original) < NOISE) {
            value = rounded;
            step(out, field, rounded, "safe", "Removed rounding noise.");
          }
        } else continue;
        final.set(field, value);
      }
    for (const [low, high, label, [min, max]] of TEMPERATURE_PAIRS) {
      for (const field of [low, high]) {
        const value = final.get(field);
        if (value !== undefined && (value < min || value > max))
          warn(out, field, `${value} °C is outside the usual ${label} range (${min}-${max} °C).`);
      }
      const a = final.get(low);
      const b = final.get(high);
      if (a !== undefined && b !== undefined && a > b) {
        const bundle = `${label}-temp-order`;
        const reason = `Minimum ${a} °C is above maximum ${b} °C; swapped.`;
        step(out, low, b, "review", reason, bundle);
        step(out, high, a, "review", reason, bundle);
      }
    }
    return out;
  },
};

const barcode: CleanupRule = {
  id: "barcode",
  label: "Barcodes",
  description:
    "Removes spaces, hyphens and dots inside numeric barcodes (EAN/UPC). Codes a spreadsheet turned into 4.00638E+12 are flagged.",
  run({ draft }) {
    const out = output();
    const value = text(draft.upc)?.trim();
    if (!value) return out;
    if (looksLikeScientific(value)) {
      warn(out, "upc", `Barcode ${quote(value)} looks damaged by a spreadsheet (scientific notation).`);
      return out;
    }
    const digits = normalizeBarcode(value);
    if (digits && digits !== draft.upc)
      step(out, "upc", digits, "safe", "Removed spaces and punctuation from the barcode.");
    return out;
  },
};

const date: CleanupRule = {
  id: "date",
  label: "Purchase dates",
  description:
    "Writes purchase dates as YYYY-MM-DD (2024/3/5, an ISO timestamp, or 25.03.2024 when the order is clear). Unclear dates and dates in the future are flagged.",
  run({ draft, today }) {
    const out = output();
    const original = text(draft.purchasedOn)?.trim();
    if (!original) return out;
    let value = original;
    if (!isIsoDate(original)) {
      const parsed = normalizeDate(original);
      if (!parsed) {
        warn(out, "purchasedOn", `Purchase date ${quote(original)} is not a clear date.`);
        return out;
      }
      value = parsed.date;
      step(
        out,
        "purchasedOn",
        value,
        /^\d{4}/.test(original) ? "safe" : "review",
        `Read ${quote(original)} as ${value}.`,
      );
    } else if (original !== draft.purchasedOn) {
      step(out, "purchasedOn", original, "safe", "Removed surrounding whitespace.");
    }
    if (today && value > today) warn(out, "purchasedOn", `Purchase date ${value} is in the future.`);
    return out;
  },
};

const RULES: Record<CleanupRuleId, CleanupRule> = {
  whitespace,
  casing,
  "vendor-alias": vendorAlias,
  material,
  "material-variant": materialVariant,
  diameter,
  "color-hex": colorHex,
  price,
  weight,
  temperature,
  barcode,
  date,
};

/** All rules in run order. */
export const CLEANUP_RULES: readonly CleanupRule[] = [
  whitespace,
  casing,
  vendorAlias,
  material,
  materialVariant,
  diameter,
  colorHex,
  price,
  weight,
  temperature,
  barcode,
  date,
];

export function ruleById(id: CleanupRuleId): CleanupRule {
  return RULES[id];
}
