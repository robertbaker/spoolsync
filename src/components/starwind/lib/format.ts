/** Date-only strings parse as UTC midnight, so format them in UTC to avoid showing the previous day. */
function defaultTimeZone(date: string | Date): string | undefined {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? "UTC" : undefined;
}

export function formatDate(
  date: string | Date,
  style: "short" | "medium" | "long" | "iso" = "long",
  timeZone?: string,
): string {
  const d = new Date(date);
  if (style === "iso") {
    return d.toISOString();
  }
  const zone = timeZone ?? defaultTimeZone(date);
  const options: Intl.DateTimeFormatOptions = {
    ...(zone ? { timeZone: zone } : {}),
    year: "numeric",
    month: style === "short" || style === "medium" ? "short" : "long",
    day: "numeric",
  };
  return new Intl.DateTimeFormat("en-US", options).format(d);
}

export function formatDisplayDate(date: string | Date): string {
  const timeZone = defaultTimeZone(date);
  return new Intl.DateTimeFormat("en-US", {
    ...(timeZone ? { timeZone } : {}),
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Format an integer amount of minor units (cents) as currency, e.g. 1500 -> "$15.00". */
export function formatCurrencyFromCents(cents: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function getReadingTime(content: string): number {
  if (!content) return 1;
  const wordsPerMinute = 200;
  const text = content.replace(/<[^>]*>?/gm, ""); // rudimentary strip HTML
  const wordCount = text.split(/\s+/).filter((word) => word.length > 0).length;
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

/** Accepts either raw content or an already-computed minute count. */
export function formatReadingTime(contentOrMinutes: string | number): string {
  const minutes =
    typeof contentOrMinutes === "number" ? contentOrMinutes : getReadingTime(contentOrMinutes);
  return `${minutes} min read`;
}
