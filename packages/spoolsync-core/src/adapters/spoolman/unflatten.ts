const NUMERIC = new Set([
  "id",
  "price",
  "remaining_weight",
  "initial_weight",
  "spool_weight",
  "used_weight",
  "density",
  "diameter",
  "weight",
  "settings_extruder_temp",
  "settings_bed_temp",
  "empty_spool_weight",
]);

/** Spoolman's CSV export prefixes text that a spreadsheet would run as a formula with a quote. */
const FORMULA_ESCAPE = /^'[=+\-@\t\r]/;

function coerce(key: string, value: unknown, spreadsheetEscapes: boolean): unknown {
  if (value === "" || value === undefined) return null;
  if (spreadsheetEscapes && typeof value === "string" && FORMULA_ESCAPE.test(value))
    value = value.slice(1);
  const leaf = key.split(".").at(-1)!;
  if (
    typeof value === "string" &&
    (NUMERIC.has(leaf) || leaf === "filament_id" || leaf === "vendor_id")
  ) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (leaf === "archived" && typeof value === "string") return value.toLowerCase() === "true";
  return value;
}

function mergeColumn(
  node: Record<string, unknown>,
  key: string,
  value: unknown,
  column: string,
): void {
  if (Object.hasOwn(node, key)) {
    const current = node[key];
    if (
      current &&
      value &&
      typeof current === "object" &&
      typeof value === "object" &&
      !Array.isArray(current) &&
      !Array.isArray(value)
    ) {
      for (const [child, item] of Object.entries(value))
        mergeColumn(current as Record<string, unknown>, child, item, column);
      return;
    }
    if (JSON.stringify(current) !== JSON.stringify(value))
      throw new Error(`Conflicting Spoolman export columns at ${column}.`);
    return;
  }
  Object.defineProperty(node, key, {
    value: structuredClone(value),
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** Turns dotted export columns into nested objects without changing the input row. */
export function unflatten(
  row: Record<string, unknown>,
  spreadsheetEscapes = false,
): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  for (const [key, raw] of Object.entries(row)) {
    const parts = key.split(".");
    const extraAt = parts.indexOf("extra");
    let node = out;
    const path = extraAt >= 0 ? [...parts.slice(0, extraAt), "extra"] : parts.slice(0, -1);
    for (const part of path) {
      if (["__proto__", "constructor", "prototype"].includes(part))
        throw new Error(`Unsupported Spoolman export column: ${key}.`);
      node[part] ??= Object.create(null);
      if (typeof node[part] !== "object" || Array.isArray(node[part]))
        throw new Error(`Conflicting Spoolman export columns at ${part}.`);
      node = node[part] as Record<string, unknown>;
    }
    if (extraAt >= 0) {
      const extraKey = parts.slice(extraAt + 1).join(".");
      if (raw !== null && raw !== undefined && raw !== "") {
        if (extraKey) mergeColumn(node, extraKey, String(raw), key);
        else {
          if (typeof raw !== "object" || Array.isArray(raw))
            throw new Error(`Spoolman extra fields must be a map at ${key}.`);
          for (const [name, value] of Object.entries(raw))
            if (value !== null && value !== undefined && value !== "")
              mergeColumn(node, name, String(value), key);
        }
      }
    } else {
      const leaf = parts.at(-1)!;
      const value = coerce(key, raw, spreadsheetEscapes);
      mergeColumn(node, leaf, value, key);
    }
  }
  const spool = out as Record<string, unknown> & { filament?: Record<string, unknown> };
  if (
    spool["remaining_weight"] == null &&
    typeof spool["initial_weight"] === "number" &&
    typeof spool["used_weight"] === "number"
  ) {
    spool["remaining_weight"] = Math.max(0, spool["initial_weight"] - spool["used_weight"]);
  }
  if (
    spool.filament &&
    spool.filament["vendor"] &&
    (spool.filament["vendor"] as Record<string, unknown>)["id"] == null
  ) {
    spool.filament["vendor"] = null;
  }
  return out;
}
