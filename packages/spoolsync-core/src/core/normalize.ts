/** Small parsers shared by adapters. Every source stores numbers and colours a little differently. */

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
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
  return typeof value === "string" && ["true", "1", "yes"].includes(value.trim().toLowerCase());
}

/** Normalises `#rgb`, `#rrggbb` and `#rrggbbaa` to uppercase `RRGGBB`; anything else is null. */
export function toHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bare = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(bare)) {
    return [...bare]
      .map((c) => c + c)
      .join("")
      .toUpperCase();
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

/** Accepts ISO timestamps or dates and returns `YYYY-MM-DD`. */
export function toDate(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (match?.[1]) {
    const [year, month, day] = match[1].split("-").map(Number) as [number, number, number];
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]!) return null;
    if (text.length > 10 && (!/^[Tt ]/.test(text.slice(10)) || Number.isNaN(Date.parse(text))))
      return null;
    return match[1];
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
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
