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

/** How alike two spools look, with the reasons, for records no cross-id links. */
export function similarity(a: CommonSpool, b: CommonSpool): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  if (a.upc && b.upc) {
    if (normalize(a.upc) === normalize(b.upc)) add(50, "same barcode");
    else add(-20, "different barcodes");
  }
  const textField = (
    field: "vendor" | "material" | "name",
    label: string,
    same: number,
    differ: number,
  ) => {
    const [x, y] = [normalize(a[field]), normalize(b[field])];
    if (!x || !y) return;
    if (x === y) add(same, `same ${label}`);
    else if (differ) add(differ, `different ${label}`);
  };
  textField("vendor", "brand", 15, -30);
  textField("material", "material", 15, -30);
  textField("name", "name", 15, 0);

  const [ca, cb] = [a.colors[0], b.colors[0]];
  if (ca && cb) {
    const distance = deltaE2000(ca, cb);
    if (distance < 3) add(20, "same color");
    else if (distance < 10) add(10, "similar color");
    else if (distance > 25) add(-30, "different color");
  }
  if (
    a.initialWeight !== null &&
    b.initialWeight !== null &&
    Math.abs(a.initialWeight - b.initialWeight) <= 5
  ) {
    add(10, "same spool size");
  }
  if (a.remainingWeight !== null && b.remainingWeight !== null) {
    const larger = Math.max(a.remainingWeight, b.remainingWeight, 1);
    if (Math.abs(a.remainingWeight - b.remainingWeight) / larger <= 0.05)
      add(10, "similar remaining weight");
  }
  if (a.purchasedOn && b.purchasedOn && a.purchasedOn === b.purchasedOn)
    add(10, "same purchase date");
  return { score, reasons };
}

export const defaultMatchingPolicy: MatchingPolicy = {
  similarity,
  suggestionThreshold: SUGGEST_THRESHOLD,
};
