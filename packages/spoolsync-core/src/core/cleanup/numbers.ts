/**
 * Parsers for numbers people type: prices with symbols and either decimal convention, weights with
 * units, diameters, temperatures, colours, dates and barcodes. Each returns `null` instead of
 * guessing when a text has no single reading.
 */

const GROUP_SPACES = /[\s  ']/g;

export interface ParsedDecimal {
  value: number;
  /** `1,299` or `1.299` could be one thousand two hundred ninety-nine or 1.299. */
  ambiguous: boolean;
}

/**
 * Reads a number that may use `,` or `.` as the decimal mark and the other (or a space or
 * apostrophe) for thousands: `24,99`, `24.99`, `1.299,00`, `1,299.00`, `1 299,00`. A single
 * separator followed by exactly three digits is read as a thousands separator, except after a
 * leading zero (`0.750`), and reported as `ambiguous`.
 */
export function parseDecimal(input: string): ParsedDecimal | null {
  let text = input.trim().replace(GROUP_SPACES, "");
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (/^[-−]/.test(text)) {
    negative = !negative;
    text = text.slice(1);
  }
  if (!/^(\d[\d.,]*|[.,]\d+)$/.test(text)) return null;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let ambiguous = false;
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const group = decimal === "." ? "," : ".";
    const parts = text.split(decimal);
    if (parts.length !== 2) return null;
    const integer = parts[0]!;
    if (!isGrouped(integer, group)) return null;
    normalized = `${integer.split(group).join("")}.${parts[1]}`;
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? "." : ",";
    const parts = text.split(separator);
    if (parts.length > 2) {
      if (!isGrouped(text, separator)) return null;
      normalized = parts.join("");
    } else {
      const [integer = "", fraction = ""] = parts;
      if (fraction.length === 3 && integer.length >= 1 && integer.length <= 3 && integer !== "0" && integer !== "") {
        normalized = integer + fraction;
        ambiguous = true;
      } else normalized = `${integer || "0"}.${fraction}`;
    }
  } else normalized = text;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return { value: negative ? -value : value, ambiguous };
}

/** `1.299.000` style: a 1-3 digit head followed by groups of exactly three. */
function isGrouped(text: string, separator: string): boolean {
  const groups = text.split(separator);
  return (
    groups.length > 1 &&
    /^\d{1,3}$/.test(groups[0]!) &&
    groups.slice(1).every((group) => /^\d{3}$/.test(group))
  ) || (groups.length === 1 && /^\d+$/.test(text));
}

const CURRENCY_SYMBOLS: ReadonlyArray<readonly [string, string]> = [
  ["€", "EUR"],
  ["$", "USD"],
  ["£", "GBP"],
  ["¥", "JPY"],
  ["₹", "INR"],
  ["zł", "PLN"],
  ["kč", "CZK"],
  ["kr", "SEK"],
  ["chf", "CHF"],
];
const CURRENCY_CODES = new Set([
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "NZD",
  "JPY",
  "CNY",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "INR",
  "BRL",
  "MXN",
  "RON",
]);

export interface ParsedPrice {
  amount: number;
  /** ISO code when the text named one (symbols `$` and `¥` are read as USD and JPY). */
  currency: string | null;
  ambiguous: boolean;
}

/**
 * Reads `$24,99`, `24.99 USD`, `€ 1.299,00` or `EUR 12`. Text with any other word in it is not a
 * price. The amount is rounded to cents; the currency is reported but SpoolSync stores only the
 * number.
 */
export function parsePrice(input: string): ParsedPrice | null {
  let text = input.replace(/[​-‍﻿]/g, "").trim();
  let currency: string | null = null;
  for (const [symbol, code] of CURRENCY_SYMBOLS) {
    const found = text.toLowerCase().indexOf(symbol);
    if (found >= 0) {
      currency ??= code;
      text = (text.slice(0, found) + " " + text.slice(found + symbol.length)).trim();
    }
  }
  text = text
    .replace(/\b([A-Za-z]{3})\b/g, (word) => {
      const code = word.toUpperCase();
      if (!CURRENCY_CODES.has(code)) return word;
      currency ??= code;
      return " ";
    })
    .trim();
  const parsed = parseDecimal(text);
  if (!parsed) return null;
  return {
    amount: Math.round(parsed.value * 100) / 100,
    currency,
    ambiguous: parsed.ambiguous,
  };
}

export type WeightUnit = "g" | "kg" | "lb" | "oz";
const GRAMS_PER: Record<WeightUnit, number> = { g: 1, kg: 1000, lb: 453.59237, oz: 28.349523125 };

export interface ParsedWeight {
  grams: number;
  /** The unit the text named; `null` when it was a bare number (read as grams). */
  unit: WeightUnit | null;
  ambiguous: boolean;
}

/** Reads `250`, `250 g`, `1kg`, `1,000 g`, `2.2 lb` or `8.8oz` as grams, rounded to 0.1 g. */
export function parseWeight(input: string): ParsedWeight | null {
  const match = /^\s*(.*?)\s*(kilograms?|kgs?|grams?|gr|g|pounds?|lbs?|ounces?|oz)?\s*\.?\s*$/i.exec(
    input.replace(/[​-‍﻿]/g, ""),
  );
  if (!match) return null;
  const parsed = parseDecimal(match[1] ?? "");
  if (!parsed) return null;
  const word = (match[2] ?? "").toLowerCase();
  // "1.299 kg" could be 1.299 kg or 1299 kg; refuse rather than guess for a non-gram unit.
  if (parsed.ambiguous && word && !word.startsWith("g")) return null;
  const unit: WeightUnit | null = !word
    ? null
    : word.startsWith("k")
      ? "kg"
      : word.startsWith("g")
        ? "g"
        : word.startsWith("p") || word.startsWith("l")
          ? "lb"
          : "oz";
  return {
    grams: Math.round(parsed.value * GRAMS_PER[unit ?? "g"] * 10) / 10,
    unit,
    ambiguous: parsed.ambiguous && unit === null,
  };
}

/** Reads `1.75`, `1,75`, `1.75mm`, `1.75 mm` as millimetres. `null` for anything else. */
export function parseDiameter(input: string): number | null {
  const match = /^\s*([\d.,]+)\s*(?:mm|millimet(?:er|re)s?)?\s*$/i.exec(input);
  if (!match) return null;
  const text = match[1]!;
  if ((text.match(/[.,]/g) ?? []).length > 1) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export interface ParsedTemperature {
  celsius: number;
  /** The text said Fahrenheit and the value was converted. */
  converted: boolean;
}

/** Reads `210`, `210°C`, `210 C` or `410°F` (converted) as degrees Celsius, rounded. */
export function parseTemperature(input: string): ParsedTemperature | null {
  const match = /^\s*(-?\d+(?:[.,]\d+)?)\s*(?:°|º|deg(?:rees?)?)?\s*([CF])?\s*$/i.exec(input);
  if (!match) return null;
  const value = Number(match[1]!.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const fahrenheit = match[2]?.toUpperCase() === "F";
  return fahrenheit
    ? { celsius: Math.round(((value - 32) * 5) / 9), converted: true }
    : { celsius: value, converted: false };
}

export interface NormalizedHex {
  hex: string;
  /** The alpha channel that was dropped, uppercase, or `null`. */
  droppedAlpha: string | null;
}

/**
 * Normalizes `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (with or without `#`, or `0x`) to uppercase
 * `RRGGBB`. SpoolSync models an opaque filament colour, so an alpha channel is dropped; callers
 * report it when it was not fully opaque.
 */
export function normalizeHex(input: string): NormalizedHex | null {
  const bare = input.trim().replace(/^#/, "").replace(/^0x/i, "");
  if (!/^[0-9a-f]+$/i.test(bare)) return null;
  let full: string;
  if (bare.length === 3 || bare.length === 4) full = [...bare].map((char) => char + char).join("");
  else if (bare.length === 6 || bare.length === 8) full = bare;
  else return null;
  const upper = full.toUpperCase();
  return { hex: upper.slice(0, 6), droppedAlpha: upper.length === 8 ? upper.slice(6) : null };
}

const isRealDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

export interface NormalizedDate {
  date: string;
  /** Day and month order was guessed (both could be a month). */
  ambiguous: boolean;
}

/**
 * Brings common spellings to `YYYY-MM-DD`: `2024/3/5`, `2024.03.05`, an ISO timestamp, or
 * `05.03.2024` when the day is above 12 so the order is certain. Day-first or month-first dates
 * that could be read both ways return `null` (the caller flags them).
 */
export function normalizeDate(input: string): NormalizedDate | null {
  const text = input.trim();
  let match = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[T ].*)?$/.exec(text);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (!isRealDate(year, month, day)) return null;
    return { date: `${match[1]}-${pad(month)}-${pad(day)}`, ambiguous: false };
  }
  match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  if (match) {
    const [a, b, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (a > 12 && b <= 12 && isRealDate(year, b, a))
      return { date: `${year}-${pad(b)}-${pad(a)}`, ambiguous: false };
    if (b > 12 && a <= 12 && isRealDate(year, a, b))
      return { date: `${year}-${pad(a)}-${pad(b)}`, ambiguous: false };
  }
  return null;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** True for `YYYY-MM-DD` that is a real calendar date. */
export function isIsoDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return Boolean(match && isRealDate(Number(match[1]), Number(match[2]), Number(match[3])));
}

/** Barcodes keep digits only when the text is digits with spaces, hyphens or dots between them. */
export function normalizeBarcode(input: string): string | null {
  if (!/^\d[\d\s.\- ]*\d$/.test(input.trim())) return null;
  const digits = input.replace(/\D/g, "");
  return [8, 12, 13, 14].includes(digits.length) ? digits : null;
}

/** Spreadsheets turn long numeric codes into `4.00638E+12`. */
export const looksLikeScientific = (text: string) => /^\d(?:[.,]\d+)?e\+?\d+$/i.test(text.trim());
