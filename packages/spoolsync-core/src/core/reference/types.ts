import type { FieldValue } from "../comparison/types";
import type { CommonSpool, ComparableField, SourceId } from "../model";

/**
 * A filament as a reference database describes it, whatever the database. Providers and the file
 * reader normalize their own records into this shape; nothing else in SpoolSync knows a provider's
 * wire format. Every value is `null` (or empty) when the source did not say, never a guess.
 */
export interface ReferenceFilament {
  /** Stable within one provider; the key a person's choice is stored under. */
  id: string;
  /** Provider that produced the record (`file`, `openfilamentdatabase`, `filamentcolors`, ...). */
  providerId: string;
  /** Short provider name for display, such as "Reference file". */
  providerLabel: string;
  vendor: string | null;
  /** Product line, for example "Galaxy" or "PLA Pro". Often absent. */
  name: string | null;
  /** Canonical material such as `PLA`, `PETG-CF`; the source's spelling when it is not understood. */
  material: string | null;
  colorName: string | null;
  /** Uppercase `RRGGBB` without `#`, or `null`. */
  colorHex: string | null;
  /** All colors of a multi-color filament in order; `[colorHex]` for a single color, else empty. */
  colorHexes: string[];
  /** Millimetres. */
  diameter: number | null;
  /** g/cm3. */
  density: number | null;
  nozzleTempMin: number | null;
  nozzleTempMax: number | null;
  bedTempMin: number | null;
  bedTempMax: number | null;
  /** Net filament weight in grams. */
  initialWeight: number | null;
  /** Weight of the empty spool in grams. */
  emptySpoolWeight: number | null;
  /** List price, amount only (SpoolSync stores no currency). */
  price: number | null;
  /** Barcode or article number, digits only. */
  barcode: string | null;
  /** Page for the product, `https:` only. */
  url: string | null;
  /** The credit line that must stay with the record. */
  attribution: string;
  license: string | null;
}

/** Spool fields a reference record can fill or correct. */
export const REFERENCE_FIELDS = [
  "vendor",
  "material",
  "name",
  "colors",
  "diameter",
  "density",
  "nozzleTempMin",
  "nozzleTempMax",
  "bedTempMin",
  "bedTempMax",
  "upc",
  "initialWeight",
  "emptySpoolWeight",
  "price",
] as const satisfies readonly ComparableField[];
export type ReferenceField = (typeof REFERENCE_FIELDS)[number];

/**
 * Fields on by default. The vendor is how a record was matched, and the price is what a person
 * paid, not a list price, so both are opt-in.
 */
export const DEFAULT_REFERENCE_FIELDS: readonly ReferenceField[] = REFERENCE_FIELDS.filter(
  (field) => field !== "vendor" && field !== "price",
);

/** What to do with a field that has a value on both sides and they differ. */
export interface ReferencePolicy {
  /** Fields the reference may touch at all. */
  fields: readonly ReferenceField[];
  /** The subset that may replace an existing value. Empty means fill-missing only. */
  overwrite: readonly ReferenceField[];
}

export const DEFAULT_REFERENCE_POLICY: ReferencePolicy = {
  fields: DEFAULT_REFERENCE_FIELDS,
  overwrite: [],
};

/** The parts of a spool the matcher reads. */
export type MatchableSpool = Pick<CommonSpool, "vendor" | "material" | "name" | "colors" | "upc">;

export type ReferenceConfidence = "high" | "medium" | "low";

export interface ReferenceCandidate {
  reference: ReferenceFilament;
  /** 0 to 100. */
  score: number;
  confidence: ReferenceConfidence;
  reasons: string[];
}

/**
 * - `matched`: one candidate clearly ahead of the rest.
 * - `ambiguous`: several candidates are about as good; a person has to choose.
 * - `suggested`: a single plausible candidate that is not certain enough to use unasked.
 * - `none`: nothing in the catalog resembles the spool.
 */
export type ReferenceMatchStatus = "matched" | "ambiguous" | "suggested" | "none";

export interface ReferenceMatch {
  status: ReferenceMatchStatus;
  /** Best first, ties broken by reference id, so the order never changes between runs. */
  candidates: ReferenceCandidate[];
  /** Why there is no match, or what makes it uncertain. */
  note: string | null;
}

export type FieldDiffStatus = "missing" | "differs" | "same";

export interface FieldDiff {
  field: ReferenceField;
  status: FieldDiffStatus;
  spoolValue: FieldValue;
  referenceValue: FieldValue;
}

export type ColorVerdict = "match" | "close" | "mismatch";

export interface ColorCheck {
  spoolHex: string;
  referenceHex: string;
  /** CIEDE2000, rounded to 0.01. For several colors, the worst pair. */
  deltaE: number;
  verdict: ColorVerdict;
  /** The number of colors differs, so no single distance describes it. */
  countDiffers: boolean;
}

export type Plausibility = "plausible" | "implausible" | "unknown";

export interface NameHexCheck {
  state: Plausibility;
  /** The families the name points to (`Red`), empty when the name says no color. */
  nameFamilies: string[];
  hexFamily: string;
}

/** A proposed change to one field of one spool; same shape as a cleanup proposal where it overlaps. */
export interface ReferenceProposal {
  /** `<source>:<sourceId>#<field>`, the same id format cleanup proposals use. */
  id: string;
  spoolKey: string;
  source: SourceId;
  sourceId: string;
  field: ReferenceField;
  before: FieldValue;
  after: FieldValue;
  /** `fill` supplies a missing value; `overwrite` replaces one the spool already has. */
  kind: "fill" | "overwrite";
  /** `safe` only for filling a gap from a confident, unambiguous match. */
  confidence: "safe" | "review";
  reason: string;
  providerId: string;
  referenceId: string;
  /** Whether the spool's service is writable and stores the field. */
  applicable: boolean;
}

export interface ReferenceItem {
  spoolKey: string;
  source: SourceId;
  sourceId: string;
  match: ReferenceMatch;
  /** The reference in use: the match, or the candidate a person picked. `null` when undecided. */
  selected: ReferenceCandidate | null;
  /** Whether `selected` came from a person's choice rather than the matcher. */
  chosen: boolean;
  /** Fields compared against `selected`, for every field in the policy the reference states. */
  diffs: FieldDiff[];
  color: ColorCheck | null;
  /** Whether the spool's own name and color disagree. */
  spoolNameHex: NameHexCheck | null;
  /** Whether the reference's own name and color disagree. */
  referenceNameHex: NameHexCheck | null;
  proposals: ReferenceProposal[];
}

export interface ReferenceSummary {
  spools: number;
  matched: number;
  ambiguous: number;
  suggested: number;
  unmatched: number;
  /** Spools with at least one missing field the reference can fill. */
  withMissing: number;
  withDifferences: number;
  colorMismatches: number;
  colorClose: number;
  proposals: number;
  safe: number;
  review: number;
  applicable: number;
}
