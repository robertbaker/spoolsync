/**
 * Generate a unique ID for component instances. Uses crypto.randomUUID when available, falls back
 * to Math.random.
 */
export function generateId(prefix?: string): string {
  const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).substring(2, 11);
  return prefix ? `${prefix}-${id}` : id;
}
