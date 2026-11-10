/** Small parsers shared by adapters. Every source stores numbers and colours a little differently. */

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) return parsed;
  return parseGroupedNumber(trimmed);
}

/**
 * Numbers written with a decimal comma or thousands separators, which `Number` rejects. Only
 * unambiguous layouts are read: `12,99`, `1.234,56`, `1,234.56` and `1,500`. A single comma
 * followed by three digits ("1,500") is thousands, but "0,500" and anything else is left null.
 */
function parseGroupedNumber(text: string): number | null {
  const negative = text.startsWith("-");
  const body = negative ? text.slice(1) : text;
  let normalized: string | null = null;
  if (/^\d+,\d{1,2}$/.test(body)) normalized = body.replace(",", ".");
  else if (/^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(body)) normalized = body.replaceAll(",", "");
  else if (/^[1-9]\d{0,2}(\.\d{3})+,\d{1,2}$/.test(body))
    normalized = body.replaceAll(".", "").replace(",", ".");
  if (normalized === null) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

/** Temperatures and weights of 0 mean "not set" in Spoolstock and Spoolio exports. */
export function toPositiveNumber(value: unknown): number | null {
  const number = toNumber(value);
  return number !== null && number > 0 ? number : null;
}

/** Known quantities such as a coreless spool's tare weight may legitimately be zero. */
export function toNonNegativeNumber(value: unknown): number | null {
  const number = toNumber(value);
  return number !== null && number >= 0 ? number : null;
}

export function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

/** Normalises `#rgb`, `#rrggbb` and `#rrggbbaa` to uppercase `RRGGBB`; anything else is null. */
export function toHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bare = value.trim().replace(/^#/, "");
  if (bare.length === 3 && /^[0-9a-f]{3}$/i.test(bare)) {
    return (bare[0]! + bare[0]! + bare[1]! + bare[1]! + bare[2]! + bare[2]!).toUpperCase();
  }
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(bare)) return bare.slice(0, 6).toUpperCase();
  return null;
}

export function uniqueHexes(values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const hex = toHex(value);
    if (hex && !out.includes(hex)) out.push(hex);
  }
  return out;
}

/**
 * A zone written in free text: Z, GMT/UTC, a US zone abbreviation, or a numeric offset after a
 * time.
 */
const EXPLICIT_ZONE =
  /(?:\dZ|\b(?:GMT|UTC|UT|[ECMP][SD]T)\b|\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*[+-]\d{2}(?::?\d{2})?)(?:\s*\([^)]*\))?\s*$/i;

/** Accepts ISO timestamps or dates and returns `YYYY-MM-DD`. */
export function toDate(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  const isValidYmd = (year: number, month: number, day: number): boolean => {
    if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= days[month - 1]!;
  };
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (!isValidYmd(year, month, day)) return null;
    if (text.length > 10 && (!/^[Tt ]/.test(text.slice(10)) || Number.isNaN(Date.parse(text))))
      return null;
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const ymdSlash = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(text);
  if (ymdSlash) {
    const [year, month, day] = [Number(ymdSlash[1]), Number(ymdSlash[2]), Number(ymdSlash[3])];
    if (!isValidYmd(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const mdySlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (mdySlash) {
    const [month, day, year] = [Number(mdySlash[1]), Number(mdySlash[2]), Number(mdySlash[3])];
    if (!isValidYmd(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (/^\d+$/.test(text)) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  // Text with an explicit zone names one instant, so its UTC date is the same on every host. Text
  // without one is read in the host zone, so its local components are exactly what was written;
  // taking the UTC date there would shift the day by the host offset.
  const zoned = EXPLICIT_ZONE.test(text);
  const year = zoned ? parsed.getUTCFullYear() : parsed.getFullYear();
  if (year < 1000 || year > 9999) return null;
  const month = (zoned ? parsed.getUTCMonth() : parsed.getMonth()) + 1;
  const day = zoned ? parsed.getUTCDate() : parsed.getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const SPOOLSTOCK_LOT_PREFIX = "spoolstock:spool:";

/** The lot number the printstudio importer and Spoolio both use for a Spoolstock spool. */
export function spoolstockLotNr(shortId: string): string {
  return `${SPOOLSTOCK_LOT_PREFIX}${shortId}`;
}

export function shortIdFromLotNr(lotNr: string | null | undefined): string | undefined {
  if (!lotNr?.startsWith(SPOOLSTOCK_LOT_PREFIX)) return undefined;
  return lotNr.slice(SPOOLSTOCK_LOT_PREFIX.length) || undefined;
}
