import { local, read, write } from "./browser/storage/access";

const KEY = "spoolsync:display";
const GRAMS_PER_OUNCE = 28.349523125;

export type WeightUnit = "g" | "oz";

export const CURRENCIES = ["", "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export interface DisplaySettings {
  weightUnit: WeightUnit;
  /** ISO 4217 code, or "" to show prices as stored with no symbol. */
  currency: CurrencyCode;
}

export const DISPLAY_CHANGED = "spoolsync:display-changed";
const DEFAULTS: DisplaySettings = { weightUnit: "g", currency: "" };

/** Keeps only valid values so damaged or hand-edited storage cannot break a page. */
export function sanitizeDisplaySettings(raw: unknown): DisplaySettings {
  const result: DisplaySettings = { ...DEFAULTS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  const input = raw as Record<string, unknown>;
  if (input["weightUnit"] === "g" || input["weightUnit"] === "oz") result.weightUnit = input["weightUnit"];
  if (CURRENCIES.includes(input["currency"] as CurrencyCode)) result.currency = input["currency"] as CurrencyCode;
  return result;
}

export function readDisplaySettings(): DisplaySettings {
  try {
    return sanitizeDisplaySettings(JSON.parse(read(local, KEY) ?? "{}"));
  } catch {
    return { ...DEFAULTS };
  }
}

/** Saves a change and tells the page, so tables and charts can re-render. */
export function updateDisplaySettings(patch: Partial<DisplaySettings>): DisplaySettings {
  const next = sanitizeDisplaySettings({ ...readDisplaySettings(), ...patch });
  const isDefault = next.weightUnit === DEFAULTS.weightUnit && next.currency === DEFAULTS.currency;
  write(local, KEY, isDefault ? null : JSON.stringify(next));
  if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DISPLAY_CHANGED, { detail: next }));
  return next;
}

export function gramsToUnit(grams: number, unit: WeightUnit): number {
  return unit === "oz" ? grams / GRAMS_PER_OUNCE : grams;
}

export function unitToGrams(value: number, unit: WeightUnit): number {
  return unit === "oz" ? value * GRAMS_PER_OUNCE : value;
}

/** "250 g" or "8.8 oz"; null, undefined and non-finite values give an en dash. */
export function formatWeight(grams: number | null | undefined, unit: WeightUnit = readDisplaySettings().weightUnit): string {
  if (grams === null || grams === undefined || !Number.isFinite(grams)) return "–";
  const value = gramsToUnit(grams, unit);
  const digits = unit === "oz" ? 1 : 0;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits })} ${unit}`;
}

/** A price in the chosen currency, or a plain number when no currency is set. */
export function formatMoney(
  amount: number,
  currency: CurrencyCode = readDisplaySettings().currency,
  maximumFractionDigits = 2,
): string {
  if (!Number.isFinite(amount)) return "–";
  if (!currency) return amount.toLocaleString(undefined, { maximumFractionDigits });
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits }).format(amount);
  } catch {
    return `${amount.toLocaleString(undefined, { maximumFractionDigits })} ${currency}`;
  }
}
