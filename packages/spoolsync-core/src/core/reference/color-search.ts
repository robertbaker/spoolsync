import { normalizeHex } from "../cleanup/numbers";
import { deltaE2000Lab, hexToLab } from "../color";
import { classifyDeltaE } from "./color-check";
import type { ColorVerdict, ReferenceFilament } from "./types";

export interface NearestColor {
  reference: ReferenceFilament;
  /** CIEDE2000, rounded to 0.01. About 2 is a just-noticeable step. */
  deltaE: number;
  verdict: ColorVerdict;
}

export interface NearestColorOptions {
  /** How many to return, closest first (default 8). */
  limit?: number;
  /** Only filaments of this material; spelling and case do not matter (`PET-G` finds `PETG`). */
  material?: string | null;
  /** Only filaments from this brand (case-insensitive, exact). */
  vendor?: string | null;
  /** Skip a record, for example the one a spool is already tied to. */
  excludeId?: string | null;
  /** Leave out anything farther than this distance. */
  maxDeltaE?: number;
}

const compact = (text: string | null | undefined) =>
  (text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

interface Row {
  reference: ReferenceFilament;
  lab: [number, number, number];
  material: string;
  vendor: string;
}

/**
 * Finds the catalog colors closest to a given one. It answers "what is a good stand-in for this
 * color?" and "which catalog record looks most like this spool?" for a spool with no match by name.
 * Multi-color filaments are not indexed: one distance cannot describe them. The Lab values are
 * worked out once, so a search over a large catalog stays quick.
 */
export class ColorIndex {
  private readonly rows: Row[] = [];

  constructor(filaments: readonly ReferenceFilament[]) {
    for (const reference of filaments) {
      if (reference.colorHexes.length > 1) continue;
      const hex = reference.colorHex ? normalizeHex(reference.colorHex)?.hex : null;
      if (!hex) continue;
      this.rows.push({
        reference,
        lab: hexToLab(hex),
        material: compact(reference.material),
        vendor: (reference.vendor ?? "").trim().toLowerCase(),
      });
    }
  }

  /** How many single-color records can be searched. */
  get size(): number {
    return this.rows.length;
  }

  /** The closest colors to `hex` (`RRGGBB`, with or without `#`); an invalid color finds nothing. */
  nearest(hex: string, options: NearestColorOptions = {}): NearestColor[] {
    const target = normalizeHex(hex)?.hex;
    if (!target) return [];
    const { limit = 8, excludeId = null, maxDeltaE = Number.POSITIVE_INFINITY } = options;
    if (limit <= 0) return [];
    const material = options.material ? compact(options.material) : null;
    const vendor = options.vendor ? options.vendor.trim().toLowerCase() : null;
    const lab = hexToLab(target);
    const best: Array<{ row: Row; distance: number }> = [];
    for (const row of this.rows) {
      if (material !== null && row.material !== material) continue;
      if (vendor !== null && row.vendor !== vendor) continue;
      if (excludeId !== null && row.reference.id === excludeId) continue;
      const distance = deltaE2000Lab(lab, row.lab);
      if (distance > maxDeltaE) continue;
      if (best.length === limit && distance > best[best.length - 1]!.distance) continue;
      // Keep the shortlist ordered by distance, ties by id so the order never changes between runs.
      let at = best.length;
      while (
        at > 0 &&
        (best[at - 1]!.distance > distance ||
          (best[at - 1]!.distance === distance &&
            best[at - 1]!.row.reference.id > row.reference.id))
      )
        at--;
      best.splice(at, 0, { row, distance });
      if (best.length > limit) best.pop();
    }
    return best.map(({ row, distance }) => {
      const deltaE = Math.round(distance * 100) / 100;
      return { reference: row.reference, deltaE, verdict: classifyDeltaE(deltaE) };
    });
  }
}
