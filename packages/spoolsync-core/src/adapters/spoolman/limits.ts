/** Spoolman stores these text columns as `VARCHAR(64)` and refuses longer values. */
export const SPOOLMAN_MAX_TEXT = 64;

export type LimitWarn = (text: string) => void;

/**
 * Cuts a value to Spoolman's 64-character column limit (by code point, as Spoolman counts) and says
 * so, instead of letting the server refuse the whole write.
 */
export function limitText(label: string, value: string, warn?: LimitWarn): string;
export function limitText(
  label: string,
  value: string | null | undefined,
  warn?: LimitWarn,
): string | null;
export function limitText(
  label: string,
  value: string | null | undefined,
  warn?: LimitWarn,
): string | null {
  if (value == null) return null;
  if (value.length <= SPOOLMAN_MAX_TEXT) return value;
  const characters = Array.from(value);
  if (characters.length <= SPOOLMAN_MAX_TEXT) return value;
  warn?.(`${label} was shortened to ${SPOOLMAN_MAX_TEXT} characters, the most Spoolman accepts`);
  return characters.slice(0, SPOOLMAN_MAX_TEXT).join("");
}
