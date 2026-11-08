import { deltaE2000Lab, hexToLab } from "../color";
import type { CommonSpool } from "../model";
import type { MatchingPolicy } from "./types";

/** Score at which two unlinked spools are suggested as the same one. */
export const SUGGEST_THRESHOLD = 45;

/** The most a colour comparison can add, which is what the upper bound assumes for it. */
const MAX_COLOR_POINTS = 20;

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
  /** First colour in CIELAB; held per spool so large palettes never miss a shared cache. */
  lab: ReturnType<typeof hexToLab> | null;
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
      lab: spool.colors[0] ? hexToLab(spool.colors[0]) : null,
    };
    normalizedCache.set(spool, norm);
  }
  return norm;
}

/**
 * Scores a pair; when `reasons` is given, also records why in the same order as always. Passing
 * `null` skips building the reason text, which keeps the many-pairs comparison allocation-free. The
 * three parts run left to right, and that order is the order of the reasons.
 */
function evaluate(a: CommonSpool, b: CommonSpool, reasons: string[] | null): number {
  const na = getNormalized(a);
  const nb = getNormalized(b);
  return (
    identityScore(a, b, na, nb, reasons) +
    colorScore(a, b, na, nb, reasons) +
    stockScore(a, b, reasons)
  );
}

/** Barcode, brand, material and name. */
function identityScore(
  a: CommonSpool,
  b: CommonSpool,
  na: NormalizedSpool,
  nb: NormalizedSpool,
  reasons: string[] | null,
): number {
  let score = 0;
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
  return score;
}

/** The first colour of each spool. By far the slowest part of a score. */
function colorScore(
  a: CommonSpool,
  b: CommonSpool,
  na: NormalizedSpool,
  nb: NormalizedSpool,
  reasons: string[] | null,
): number {
  if (!na.lab || !nb.lab) return 0;
  const distance = a.colors[0] === b.colors[0] ? 0 : deltaE2000Lab(na.lab, nb.lab);
  if (distance < 3) {
    reasons?.push("same color");
    return MAX_COLOR_POINTS;
  }
  if (distance < 10) {
    reasons?.push("similar color");
    return 10;
  }
  if (distance > 25) {
    reasons?.push("different color");
    return -30;
  }
  return 0;
}

/** Spool size, remaining weight and purchase date. */
function stockScore(a: CommonSpool, b: CommonSpool, reasons: string[] | null): number {
  let score = 0;
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
 * The most `similarity` could score for this pair: the real score, except that the colours are
 * assumed to match. Never below the real score, so a pair whose bound cannot beat the best so far
 * (or the threshold) can be skipped, without its colour distance and without changing any result.
 */
export function similarityUpperBound(a: CommonSpool, b: CommonSpool): number {
  const na = getNormalized(a);
  const nb = getNormalized(b);
  return (
    identityScore(a, b, na, nb, null) +
    stockScore(a, b, null) +
    (na.lab && nb.lab ? MAX_COLOR_POINTS : 0)
  );
}

export const defaultMatchingPolicy: MatchingPolicy = {
  similarity,
  score: similarityScore,
  scoreUpperBound: similarityUpperBound,
  suggestionThreshold: SUGGEST_THRESHOLD,
};
