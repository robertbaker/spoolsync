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
