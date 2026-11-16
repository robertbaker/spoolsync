import type { WeightUnit } from "@spoolsync/core/core/weight-units";
import {
  MAX_STORED_TARES,
  NO_BRAND_KEY,
  brandKey,
  isTareWeight,
  sanitizeTares,
} from "@spoolsync/core/workflow";

import { local, read, write } from "./browser/storage/access";

/** Compatibility entry point; tare calculation rules live in the shared core package. */
export {
  KNOWN_TARES,
  MAX_SCALE_GRAMS,
  MAX_TARE_GRAMS,
  NO_BRAND_KEY,
  brandKey,
  knownTare,
  isTareWeight,
  parseScaleInput,
  resolveTare,
  sanitizeTares,
  weighIn,
  type KnownTare,
  type ResolvedTare,
  type TareOrigin,
  type WeighInResult,
  type WeighInSuccess,
} from "@spoolsync/core/workflow";

export const WEIGH_IN_KEY = "spoolsync:weigh-in";

export function readTares(): Record<string, number> {
  try {
    return sanitizeTares(JSON.parse(read(local, WEIGH_IN_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

/** Remembers an empty-spool weight for a brand. Returns false when invalid or storage refuses it. */
export function saveTare(vendor: string | null | undefined, grams: number): boolean {
  if (!isTareWeight(grams)) return false;
  const key = brandKey(vendor) || NO_BRAND_KEY;
  const { [key]: _replaced, ...others } = readTares();
  const kept = Object.entries(others).slice(-(MAX_STORED_TARES - 1));
  const tares = Object.fromEntries([...kept, [key, Math.round(grams * 10) / 10]]);
  return write(local, WEIGH_IN_KEY, JSON.stringify({ tares: sanitizeTares(tares) }));
}

/** Forgets a brand's saved empty-spool weight. */
export function forgetTare(vendor: string | null | undefined): boolean {
  const tares = readTares();
  delete tares[brandKey(vendor) || NO_BRAND_KEY];
  return write(local, WEIGH_IN_KEY, Object.keys(tares).length ? JSON.stringify({ tares }) : null);
}

export type { WeightUnit };
