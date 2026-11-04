import { normalizeBarcode } from "../cleanup/numbers";
import { formatMaterial, parseMaterial, type ParsedMaterial } from "../cleanup/materials";
import { cleanInline, plainKey } from "../cleanup/text";
import { buildVendorIndex, canonicalVendor, vendorKey } from "../cleanup/vendors";
import type { VendorAlias } from "../cleanup/types";
import { compareColorLists } from "./color-check";
import type {
  MatchableSpool,
  ReferenceCandidate,
  ReferenceConfidence,
  ReferenceFilament,
  ReferenceMatch,
} from "./types";

/** A candidate at or above this is worth showing a person. */
export const SUGGEST_MIN = 50;
/** A single candidate at or above this is used without asking. */
export const MATCH_MIN = 75;
/** Candidates within this many points of the best one count as rivals: the person must choose. */
export const AMBIGUOUS_GAP = 8;
/** Most candidates kept per spool. */
export const MAX_CANDIDATES = 8;

/** What the matcher reads from a spool. Diameter and size only break ties between pack variants. */
export type CatalogQuery = MatchableSpool & {
  diameter?: number | null;
  initialWeight?: number | null;
};

export interface CatalogOptions {
  /** Extra vendor spellings, in the same form as the cleanup rules use. */
  vendorAliases?: readonly VendorAlias[];
}

interface Indexed {
  reference: ReferenceFilament;
  vendorId: string;
  material: ParsedMaterial | null;
  materialKey: string;
  /** Name sets to compare a spool's name against, best-first. */
  nameSets: Array<ReadonlySet<string>>;
}

const SYNONYMS: Readonly<Record<string, string>> = { grey: "gray", colour: "color", colours: "colors" };
const FILLER = new Set([
  "filament",
  "color",
  "colors",
  "series",
  "spool",
  "refill",
  "mm",
  "kg",
  "g",
  "the",
  "and",
  "175",
  "285",
  "1000",
  "750",
  "500",
  "250",
]);

/** Name words with case, accents and punctuation removed; `+` is kept as a word ("plus"). */
export function nameTokens(text: string, omit: ReadonlySet<string> = new Set()): Set<string> {
  const tokens = new Set<string>();
  const words = cleanInline(text)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  for (const word of words) {
    const token = SYNONYMS[word] ?? word;
    if (!FILLER.has(token) && !omit.has(token)) tokens.add(token);
  }
  return tokens;
}

/** Sørensen-Dice on two token sets: 1 for the same words in any order, 0 for none in common. */
export function tokenSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

const materialCore = (parsed: ParsedMaterial) => formatMaterial(parsed, false);

function confidenceFor(score: number): ReferenceConfidence {
  return score >= 85 ? "high" : score >= 65 ? "medium" : "low";
}

const byScoreThenId = (a: ReferenceCandidate, b: ReferenceCandidate) =>
  b.score - a.score ||
  (a.reference.id < b.reference.id ? -1 : a.reference.id > b.reference.id ? 1 : 0);

/**
 * An indexed reference catalog. Records are held in a fixed order (vendor, material, color name,
 * name, id) so indexing and matching give the same answer however the source ordered them, and
 * matching never changes a spool: it returns a ranked list with the reasons for each score.
 */
export class ReferenceCatalog {
  readonly entries: readonly ReferenceFilament[];
  private readonly vendorIndex: ReadonlyMap<string, string>;
  private readonly indexed: Indexed[];
  private readonly byVendor = new Map<string, Indexed[]>();
  private readonly byBarcode = new Map<string, Indexed[]>();
  private readonly byId = new Map<string, ReferenceFilament>();

  constructor(filaments: readonly ReferenceFilament[], options: CatalogOptions = {}) {
    this.vendorIndex = buildVendorIndex(options.vendorAliases);
    const text = (value: string | null) => value ?? "";
    this.entries = [...filaments].sort(
      (a, b) =>
        text(a.vendor).localeCompare(text(b.vendor), "en") ||
        text(a.material).localeCompare(text(b.material), "en") ||
        text(a.colorName).localeCompare(text(b.colorName), "en") ||
        text(a.name).localeCompare(text(b.name), "en") ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    this.indexed = this.entries.map((reference) => this.index(reference));
    for (const item of this.indexed) {
      this.byId.set(item.reference.id, item.reference);
      if (item.vendorId) {
        const list = this.byVendor.get(item.vendorId) ?? [];
        list.push(item);
        this.byVendor.set(item.vendorId, list);
      }
      if (item.reference.barcode) {
        const list = this.byBarcode.get(item.reference.barcode) ?? [];
        list.push(item);
        this.byBarcode.set(item.reference.barcode, list);
      }
    }
  }

  get size(): number {
    return this.entries.length;
  }

  get(id: string): ReferenceFilament | undefined {
    return this.byId.get(id);
  }

  /** Number of distinct brands, by identity (aliases of one brand count once). */
  get vendors(): number {
    return this.byVendor.size;
  }

  /** A brand's identity: its canonical spelling, then case, accents, punctuation and legal suffix removed. */
  vendorIdentity(vendor: string | null): string {
    if (!vendor) return "";
    const clean = cleanInline(vendor);
    return vendorKey(canonicalVendor(clean, this.vendorIndex) ?? clean);
  }

  private index(reference: ReferenceFilament): Indexed {
    const material = reference.material ? parseMaterial(reference.material) : null;
    const omit = this.omitTokens(reference.vendor, reference.material);
    const sets: Array<ReadonlySet<string>> = [];
    if (reference.colorName) sets.push(nameTokens(reference.colorName, omit));
    if (reference.name && reference.colorName)
      sets.push(nameTokens(`${reference.name} ${reference.colorName}`, omit));
    if (reference.name) sets.push(nameTokens(reference.name, omit));
    return {
      reference,
      vendorId: this.vendorIdentity(reference.vendor),
      material,
      materialKey: plainKey(reference.material ?? ""),
      nameSets: sets.filter((set) => set.size > 0),
    };
  }

  /** Words that identify the brand and polymer rather than the product. */
  private omitTokens(vendor: string | null, material: string | null): Set<string> {
    const omit = new Set<string>();
    for (const word of [...nameTokens(vendor ?? ""), ...nameTokens(material ?? "")]) omit.add(word);
    return omit;
  }

  /** Ranked candidates for one spool and what to do with them. */
  match(spool: CatalogQuery): ReferenceMatch {
    const vendorId = this.vendorIdentity(spool.vendor);
    const barcode = spool.upc ? normalizeBarcode(spool.upc) : null;
    const pool = new Map<string, { item: Indexed; vendorExact: boolean }>();
    if (vendorId) {
      for (const item of this.byVendor.get(vendorId) ?? [])
        pool.set(item.reference.id, { item, vendorExact: true });
      // A brand written with extra words ("Prusament PLA") still reaches its records.
      for (const [id, items] of this.byVendor) {
        if (id === vendorId) continue;
        const [short, long] = id.length < vendorId.length ? [id, vendorId] : [vendorId, id];
        if (short.length >= 5 && long.startsWith(short))
          for (const item of items)
            if (!pool.has(item.reference.id)) pool.set(item.reference.id, { item, vendorExact: false });
      }
    }
    if (barcode)
      for (const item of this.byBarcode.get(barcode) ?? [])
        if (!pool.has(item.reference.id)) pool.set(item.reference.id, { item, vendorExact: false });

    if (!pool.size) {
      return {
        status: "none",
        candidates: [],
        note: !vendorId && !barcode
          ? "The spool has no brand or barcode to look up."
          : "No reference filament from this brand.",
      };
    }

    const spoolMaterial = spool.material ? parseMaterial(spool.material) : null;
    const spoolMaterialKey = plainKey(spool.material ?? "");
    const omit = this.omitTokens(spool.vendor, spool.material);
    const spoolTokens = spool.name ? nameTokens(spool.name, omit) : new Set<string>();

    const scored: ReferenceCandidate[] = [];
    for (const { item, vendorExact } of pool.values()) {
      const { reference } = item;
      let score = 0;
      const reasons: string[] = [];
      const barcodeMatch = Boolean(barcode && reference.barcode === barcode);
      if (barcodeMatch) {
        score += 60;
        reasons.push("same barcode");
      } else if (barcode && reference.barcode) {
        score -= 25;
        reasons.push("different barcode");
      }
      if (vendorExact) {
        score += 30;
        reasons.push("same brand");
      } else if (item.vendorId && vendorId && (item.vendorId.startsWith(vendorId) || vendorId.startsWith(item.vendorId))) {
        score += 18;
        reasons.push("similar brand name");
      }

      if (reference.material && (spool.material ?? "").trim()) {
        if (spoolMaterial && item.material) {
          if (materialCore(spoolMaterial) === materialCore(item.material)) {
            score += 20;
            reasons.push(`same material (${materialCore(item.material)})`);
          } else if (spoolMaterial.base === item.material.base) {
            score += 6;
            reasons.push(
              `different variant (${materialCore(spoolMaterial)} against ${materialCore(item.material)})`,
            );
          } else if (!barcodeMatch) continue;
          else reasons.push("different material");
        } else if (spoolMaterialKey === item.materialKey) {
          score += 20;
          reasons.push("same material");
        } else {
          score -= 5;
          reasons.push("material could not be compared");
        }
      } else {
        score += reference.material ? 5 : 3;
        reasons.push("material not stated on one side");
      }

      let similarity: number | null = null;
      if (spoolTokens.size && item.nameSets.length)
        similarity = Math.max(...item.nameSets.map((set) => tokenSimilarity(spoolTokens, set)));
      if (similarity !== null) {
        score += Math.round(similarity * 35);
        reasons.push(
          similarity >= 0.99
            ? "same name"
            : similarity > 0
              ? `name overlaps ${Math.round(similarity * 100)}%`
              : "different name",
        );
      } else reasons.push("no name to compare");

      if (spool.colors.length && reference.colorHexes.length) {
        const color = compareColorLists(spool.colors, reference.colorHexes);
        if (color) {
          if (color.verdict === "match") {
            score += 8;
            reasons.push("same color");
          } else if (color.verdict === "close") {
            score += 4;
            reasons.push("similar color");
          } else if (color.deltaE > 25) {
            score -= 10;
            reasons.push("different color");
          }
        }
      }
      if (spool.diameter != null && reference.diameter !== null) {
        if (Math.abs(spool.diameter - reference.diameter) <= 0.02) {
          score += 4;
          reasons.push("same diameter");
        } else {
          score -= 15;
          reasons.push(`different diameter (${spool.diameter} against ${reference.diameter} mm)`);
        }
      }
      if (spool.initialWeight != null && reference.initialWeight !== null) {
        if (Math.abs(spool.initialWeight - reference.initialWeight) <= 5) {
          score += 3;
          reasons.push("same spool size");
        } else {
          score -= 6;
          reasons.push("different spool size");
        }
      }
      score = Math.max(0, Math.min(100, score));
      if (score < SUGGEST_MIN) continue;
      scored.push({ reference, score, confidence: confidenceFor(score), reasons });
    }

    scored.sort(byScoreThenId);
    const candidates = scored.slice(0, MAX_CANDIDATES);
    if (!candidates.length)
      return { status: "none", candidates, note: "Nothing from this brand resembles the spool." };

    const best = candidates[0]!;
    const rivals = candidates.filter((candidate) => candidate.score >= best.score - AMBIGUOUS_GAP);
    if (rivals.length > 1)
      return {
        status: "ambiguous",
        candidates,
        note: `${rivals.length} reference filaments fit about equally well; choose one.`,
      };
    if (best.score >= MATCH_MIN && best.confidence !== "low")
      return { status: "matched", candidates, note: null };
    return {
      status: "suggested",
      candidates,
      note: "Only a partial match; confirm it before using it.",
    };
  }
}
