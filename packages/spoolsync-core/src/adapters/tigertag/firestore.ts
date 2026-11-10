export type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | Record<string, unknown>;

/** Firestore's typed JSON to plain values. Timestamps become epoch ms, as `.ttag` files store them. */
export function decodeValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value["booleanValue"];
  if ("integerValue" in value) return Number(value["integerValue"]);
  if ("doubleValue" in value) return Number(value["doubleValue"]);
  if ("stringValue" in value) return value["stringValue"];
  if ("timestampValue" in value) return Date.parse(String(value["timestampValue"]));
  if ("arrayValue" in value)
    return ((value["arrayValue"] as { values?: FirestoreValue[] }).values ?? []).map(decodeValue);
  if ("mapValue" in value)
    return decodeFields(
      (value["mapValue"] as { fields?: Record<string, FirestoreValue> }).fields ?? {},
    );
  if ("referenceValue" in value) return value["referenceValue"];
  if ("geoPointValue" in value) return value["geoPointValue"];
  return null;
}

export function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]),
  );
}

export function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number")
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeValue(v)])),
      },
    };
  }
  return { stringValue: String(value) };
}

/** Deep equality independent of object key order. */
export function structuralEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => structuralEqual(item, b[index]))
    );
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && structuralEqual(left[key], right[key]))
  );
}

/**
 * Encodes `value`, reusing the typed `original` wherever it still decodes to the same value, so
 * timestamps, references, geo points and integers beyond 2^53 survive a write untouched. A number
 * written over a timestamp stays a timestamp.
 */
export function encodeLike(value: unknown, original?: FirestoreValue): FirestoreValue {
  if (!original) return encodeValue(value);
  if (structuralEqual(decodeValue(original), value)) return original;
  if (
    "timestampValue" in original &&
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= 8.64e15
  )
    return { timestampValue: new Date(value).toISOString() };
  if (
    "mapValue" in original &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const before =
      (original["mapValue"] as { fields?: Record<string, FirestoreValue> }).fields ?? {};
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, encodeLike(v, before[k])]),
        ),
      },
    };
  }
  if ("arrayValue" in original && Array.isArray(value)) {
    const before = (original["arrayValue"] as { values?: FirestoreValue[] }).values ?? [];
    return { arrayValue: { values: value.map((item, index) => encodeLike(item, before[index])) } };
  }
  return encodeValue(value);
}
