import { deltaE2000 } from "../color";
import type { CommonSpool } from "../model";
import type { MatchingPolicy } from "./types";

/** Score at which two unlinked spools are suggested as the same one. */
export const SUGGEST_THRESHOLD = 45;

const normalize = (value: string | null): string =>
  (value ?? "")
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "");

interface NormalizedSpool {
  upc: string;
  vendor: string;
  material: string;
  name: string;
}

const normalizedCache = new WeakMap<CommonSpool, NormalizedSpool>();

function getNormalized(spool: CommonSpool): NormalizedSpool {
  let norm = normalizedCache.get(spool);
  if (!norm) {
    norm = {
      upc: normalize(spool.upc),
      vendor: normalize(spool.vendor),
      material: normalize(spool.material),
      name: normalize(spool.name),
    };
    normalizedCache.set(spool, norm);
  }
  return norm;
}

/**
 * Scores a pair; when `reasons` is given, also records why in the same order as always. Passing
 * `null` skips building the reason text, which keeps the many-pairs comparison allocation-free.
 */
function evaluate(a: CommonSpool, b: CommonSpool, reasons: string[] | null): number {
  let score = 0;
  const na = getNormalized(a);
  const nb = getNormalized(b);

  if (a.upc && b.upc) {
    if (na.upc === nb.upc) {
      score += 50;
      reasons?.push("same barcode");
    } else {
      score -= 20;
      reasons?.push("different barcodes");
    }
  }
  score += textScore(na.vendor, nb.vendor, "brand", 15, -30, reasons);
  score += textScore(na.material, nb.material, "material", 15, -30, reasons);
  score += textScore(na.name, nb.name, "name", 15, 0, reasons);

  const ca = a.colors[0];
  const cb = b.colors[0];
  if (ca && cb) {
    const distance = ca === cb ? 0 : deltaE2000(ca, cb);
    if (distance < 3) {
      score += 20;
      reasons?.push("same color");
    } else if (distance < 10) {
      score += 10;
      reasons?.push("similar color");
    } else if (distance > 25) {
      score -= 30;
      reasons?.push("different color");
    }
  }
  if (
    a.initialWeight !== null &&
    b.initialWeight !== null &&
    Math.abs(a.initialWeight - b.initialWeight) <= 5
  ) {
    score += 10;
    reasons?.push("same spool size");
  }
  if (a.remainingWeight !== null && b.remainingWeight !== null) {
    const larger = Math.max(a.remainingWeight, b.remainingWeight, 1);
    if (Math.abs(a.remainingWeight - b.remainingWeight) / larger <= 0.05) {
      score += 10;
      reasons?.push("similar remaining weight");
    }
  }
  if (a.purchasedOn && b.purchasedOn && a.purchasedOn === b.purchasedOn) {
    score += 10;
    reasons?.push("same purchase date");
  }
  return score;
}

function textScore(
  x: string,
  y: string,
  label: string,
  same: number,
  differ: number,
  reasons: string[] | null,
): number {
  if (!x || !y) return 0;
  if (x === y) {
    reasons?.push(`same ${label}`);
    return same;
  }
  if (differ) {
    reasons?.push(`different ${label}`);
    return differ;
  }
  return 0;
}

/** How alike two spools look, with the reasons, for records no cross-id links. */
export function similarity(a: CommonSpool, b: CommonSpool): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const score = evaluate(a, b, reasons);
  return { score, reasons };
}

/** The score alone, identical to `similarity(a, b).score` but without building the reasons. */
export const similarityScore = (a: CommonSpool, b: CommonSpool): number => evaluate(a, b, null);

/**
 * The most `similarity` could score for this pair: every rule that can add points is assumed to
 * fire, and none that subtract. Never below the real score, so a pair whose bound cannot beat the
 * best so far (or the threshold) can be skipped without changing any result.
 */
export function similarityUpperBound(a: CommonSpool, b: CommonSpool): number {
  const na = getNormalized(a);
  const nb = getNormalized(b);
  let bound = 0;
  if (a.upc && b.upc) bound += 50;
  if (na.vendor && nb.vendor) bound += 15;
  if (na.material && nb.material) bound += 15;
  if (na.name && nb.name) bound += 15;
  if (a.colors[0] && b.colors[0]) bound += 20;
  if (a.initialWeight !== null && b.initialWeight !== null) bound += 10;
  if (a.remainingWeight !== null && b.remainingWeight !== null) bound += 10;
  if (a.purchasedOn && b.purchasedOn) bound += 10;
  return bound;
}

export const defaultMatchingPolicy: MatchingPolicy = {
  similarity,
  score: similarityScore,
  scoreUpperBound: similarityUpperBound,
  suggestionThreshold: SUGGEST_THRESHOLD,
};
