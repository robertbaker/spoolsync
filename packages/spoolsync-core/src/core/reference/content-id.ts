/** Stable short hash of a record's identity, for ids when the source has none. */
export function contentId(parts: ReadonlyArray<string | number | null>): string {
  let hash = 0x811c9dc5;
  const input = parts.map((part) => (part === null ? "" : String(part).toLowerCase())).join("|");
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}
