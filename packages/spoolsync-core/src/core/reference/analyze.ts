import { canApplyCleanup } from "../cleanup/engine";
import { formatMaterial, parseMaterial } from "../cleanup/materials";
import { normalizeBarcode } from "../cleanup/numbers";
import { plainKey } from "../cleanup/text";
import { strictValuesEqual, type RecordEdits } from "../comparison/record-edits";
import type { FieldValue } from "../comparison/types";
import { recordKey } from "../matching/keys";
import { SOURCE_IDS, type CommonSpool, type ComparableField } from "../model";
import { nameTokens, type ReferenceCatalog } from "./catalog";
import { compareColorLists, nameHexPlausibility } from "./color-check";
import {
  REFERENCE_FIELDS,
  type FieldDiff,
  type ReferenceCandidate,
  type ReferenceField,
  type ReferenceFilament,
  type ReferenceItem,
  type ReferencePolicy,
  type ReferenceProposal,
  type ReferenceSummary,
  DEFAULT_REFERENCE_POLICY,
} from "./types";

/** A choice stored for a spool: the reference id picked, or this to say none of them fit. */
export const NO_REFERENCE = "none";

export interface AnalyzeOptions {
  policy?: ReferencePolicy;
  /** Spool key (`source:id`) to the reference id the person picked, or `NO_REFERENCE`. */
  choices?: ReadonlyMap<string, string>;
}

export interface ReferenceAnalysis {
  items: ReferenceItem[];
  proposals: ReferenceProposal[];
  summary: ReferenceSummary;
}

const TOLERANCE: Partial<Record<ReferenceField, number>> = {
  diameter: 0.02,
  density: 0.01,
  initialWeight: 1,
  emptySpoolWeight: 1,
  price: 0.005,
};

/** Services store 0 for "unknown" in these fields, so 0 counts as a gap, not as a value. */
const ZERO_IS_BLANK: ReadonlySet<ReferenceField> = new Set([
  "diameter",
  "density",
  "nozzleTempMin",
  "nozzleTempMax",
  "bedTempMin",
  "bedTempMax",
  "initialWeight",
  "emptySpoolWeight",
]);

const isBlank = (field: ReferenceField, value: FieldValue): boolean =>
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "number" && value <= 0 && ZERO_IS_BLANK.has(field));

/** The reference's value for a spool field, or `null` when it states none. */
export function referenceValue(reference: ReferenceFilament, field: ReferenceField): FieldValue {
  switch (field) {
    case "vendor":
      return reference.vendor;
    case "material":
      return reference.material;
    case "name":
      return reference.colorName ?? reference.name;
    case "colors":
      return reference.colorHexes.length ? [...reference.colorHexes] : null;
    case "upc":
      return reference.barcode;
    default:
      return reference[field];
  }
}

function sameValue(
  field: ReferenceField,
  spool: FieldValue,
  reference: FieldValue,
  catalog: ReferenceCatalog,
): boolean {
  if (field === "colors")
    return compareColorLists(spool as string[], reference as string[])?.verdict === "match";
  if (typeof spool === "number" && typeof reference === "number")
    return Math.abs(spool - reference) <= (TOLERANCE[field] ?? 0);
  if (typeof spool !== "string" || typeof reference !== "string") return spool === reference;
  switch (field) {
    case "vendor":
      return catalog.vendorIdentity(spool) === catalog.vendorIdentity(reference);
    case "material": {
      const [a, b] = [parseMaterial(spool), parseMaterial(reference)];
      return a && b
        ? formatMaterial(a, false) === formatMaterial(b, false)
        : plainKey(spool) === plainKey(reference);
    }
    case "name": {
      const [a, b] = [nameTokens(spool), nameTokens(reference)];
      return a.size > 0 && a.size === b.size && [...a].every((token) => b.has(token))
        ? true
        : plainKey(spool) === plainKey(reference);
    }
    case "upc":
      return (
        (normalizeBarcode(spool) ?? plainKey(spool)) ===
        (normalizeBarcode(reference) ?? plainKey(reference))
      );
    default:
      return plainKey(spool) === plainKey(reference);
  }
}

/** Compares every field of the policy for which the reference states a value. */
export function diffSpool(
  spool: CommonSpool,
  reference: ReferenceFilament,
  catalog: ReferenceCatalog,
  fields: readonly ReferenceField[] = REFERENCE_FIELDS,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const field of REFERENCE_FIELDS) {
    if (!fields.includes(field)) continue;
    const wanted = referenceValue(reference, field);
    if (wanted === null || wanted === "" || (Array.isArray(wanted) && !wanted.length)) continue;
    const have = (field === "colors" ? [...spool.colors] : spool[field]) as FieldValue;
    const status = isBlank(field, have)
      ? "missing"
      : sameValue(field, have, wanted, catalog)
        ? "same"
        : "differs";
    diffs.push({ field, status, spoolValue: have, referenceValue: wanted });
  }
  return diffs;
}

const describe = (reference: ReferenceFilament): string =>
  [reference.vendor, reference.material, reference.colorName ?? reference.name]
    .filter(Boolean)
    .join(" ") || reference.id;

function proposalsFor(
  spool: CommonSpool,
  candidate: ReferenceCandidate,
  chosen: boolean,
  diffs: readonly FieldDiff[],
  policy: ReferencePolicy,
  colorDeltaE: number | null,
  referenceImplausible: boolean,
): ReferenceProposal[] {
  const key = recordKey(spool);
  const out: ReferenceProposal[] = [];
  for (const diff of diffs) {
    if (diff.status === "same") continue;
    const overwrite = diff.status === "differs";
    if (overwrite && !policy.overwrite.includes(diff.field)) continue;
    const confident = !chosen && candidate.confidence === "high";
    const safe = !overwrite && confident && !(diff.field === "colors" && referenceImplausible);
    const notes = [
      overwrite ? "Differs from the reference" : "Missing in your inventory",
      `matched ${describe(candidate.reference)} (${candidate.reasons.join(", ")})`,
    ];
    if (diff.field === "colors" && colorDeltaE !== null && overwrite)
      notes.push(`color difference ${colorDeltaE.toFixed(1)} (CIEDE2000)`);
    if (diff.field === "colors" && referenceImplausible)
      notes.push("the reference color does not fit its own name");
    out.push({
      id: `${key}#${diff.field}`,
      spoolKey: key,
      source: spool.source,
      sourceId: spool.sourceId,
      field: diff.field,
      before: Array.isArray(diff.spoolValue) ? [...diff.spoolValue] : diff.spoolValue,
      after: Array.isArray(diff.referenceValue) ? [...diff.referenceValue] : diff.referenceValue,
      kind: overwrite ? "overwrite" : "fill",
      confidence: safe ? "safe" : "review",
      reason: `${notes[0]}; ${notes.slice(1).join("; ")}.`,
      providerId: candidate.reference.providerId,
      referenceId: candidate.reference.id,
      applicable: canApplyCleanup(spool, diff.field),
    });
  }
  return out;
}

const NUMERIC_EN_COLLATOR = new Intl.Collator("en", { numeric: true });
const EN_COLLATOR = new Intl.Collator("en");

const byIdentity = (a: CommonSpool, b: CommonSpool) =>
  SOURCE_IDS.indexOf(a.source) - SOURCE_IDS.indexOf(b.source) ||
  NUMERIC_EN_COLLATOR.compare(a.sourceId, b.sourceId) ||
  EN_COLLATOR.compare(a.sourceId, b.sourceId);

/**
 * Matches every spool against the catalog and works out, per spool, what the reference would fill
 * or correct under the policy. Nothing is changed: the result is a list of per-spool findings and
 * per-field proposals to accept or reject. A single clear match is used on its own; ambiguous or
 * partial matches wait for a person's choice, so no spool is ever tied to a reference by guesswork.
 * Output order is by service and id, then comparison field order.
 */
export function analyzeReference(
  spools: readonly CommonSpool[],
  catalog: ReferenceCatalog,
  options: AnalyzeOptions = {},
): ReferenceAnalysis {
  const policy = options.policy ?? DEFAULT_REFERENCE_POLICY;
  const items: ReferenceItem[] = [];
  const proposals: ReferenceProposal[] = [];

  for (const spool of [...spools].sort(byIdentity)) {
    const key = recordKey(spool);
    const match = catalog.match(spool);
    const choice = options.choices?.get(key);
    let selected: ReferenceCandidate | null = null;
    let chosen = false;
    if (choice === NO_REFERENCE) chosen = true;
    else if (choice) {
      selected = match.candidates.find((candidate) => candidate.reference.id === choice) ?? null;
      chosen = selected !== null;
    }
    if (!selected && choice === undefined && match.status === "matched")
      selected = match.candidates[0]!;

    const diffs = selected ? diffSpool(spool, selected.reference, catalog, policy.fields) : [];
    const color = selected ? compareColorLists(spool.colors, selected.reference.colorHexes) : null;
    const spoolNameHex = nameHexPlausibility(spool.name, spool.colors[0]);
    const referenceNameHex = selected
      ? nameHexPlausibility(
          selected.reference.colorName ?? selected.reference.name,
          selected.reference.colorHex,
        )
      : null;
    const mine = selected
      ? proposalsFor(
          spool,
          selected,
          chosen,
          diffs,
          policy,
          color?.deltaE ?? null,
          referenceNameHex?.state === "implausible",
        )
      : [];
    proposals.push(...mine);
    items.push({
      spoolKey: key,
      source: spool.source,
      sourceId: spool.sourceId,
      match,
      selected,
      chosen,
      diffs,
      color,
      spoolNameHex,
      referenceNameHex,
      proposals: mine,
    });
  }
  return { items, proposals, summary: summarizeReference(items) };
}

/**
 * Whether a spool's color needs a look: a mismatch against the reference, or its name and hex
 * disagree.
 */
export const hasColorProblem = (item: ReferenceItem): boolean =>
  item.color?.verdict === "mismatch" || item.spoolNameHex?.state === "implausible";

/** Whether a person still has to pick a reference for the spool. */
export const needsChoice = (item: ReferenceItem): boolean =>
  !item.selected &&
  !item.chosen &&
  (item.match.status === "ambiguous" || item.match.status === "suggested");

export function summarizeReference(items: readonly ReferenceItem[]): ReferenceSummary {
  let matched = 0;
  let ambiguous = 0;
  let suggested = 0;
  let unmatched = 0;
  let withMissing = 0;
  let withDifferences = 0;
  let colorMismatches = 0;
  let colorClose = 0;
  let proposals = 0;
  let safe = 0;
  let review = 0;
  let applicable = 0;

  for (const item of items) {
    if (item.selected !== null) matched++;
    if (item.match.status === "ambiguous") ambiguous++;
    else if (item.match.status === "suggested") suggested++;
    else if (item.match.status === "none") unmatched++;

    let hasMissing = false;
    let hasDiffers = false;
    for (const diff of item.diffs) {
      if (diff.status === "missing") hasMissing = true;
      else if (diff.status === "differs") hasDiffers = true;
    }
    if (hasMissing) withMissing++;
    if (hasDiffers) withDifferences++;

    if (item.color?.verdict === "mismatch") colorMismatches++;
    else if (item.color?.verdict === "close") colorClose++;

    for (const proposal of item.proposals) {
      proposals++;
      if (proposal.confidence === "safe") safe++;
      else if (proposal.confidence === "review") review++;
      if (proposal.applicable) applicable++;
    }
  }

  return {
    spools: items.length,
    matched,
    ambiguous,
    suggested,
    unmatched,
    withMissing,
    withDifferences,
    colorMismatches,
    colorClose,
    proposals,
    safe,
    review,
    applicable,
  };
}

/** Proposals the CLI may add to a plan unasked: fills from a confident match a service can take. */
export function safeReferenceProposals(
  proposals: readonly ReferenceProposal[],
): ReferenceProposal[] {
  return proposals.filter(
    (proposal) => proposal.applicable && proposal.kind === "fill" && proposal.confidence === "safe",
  );
}

/** What is stored for an accepted proposal: enough to re-apply it, and to notice it went stale. */
export interface AcceptedReference {
  spoolKey: string;
  field: ReferenceField;
  before: FieldValue;
  after: FieldValue;
  providerId: string;
  referenceId: string;
}

export function acceptedReferences(
  proposals: readonly ReferenceProposal[],
  ids: ReadonlySet<string>,
): AcceptedReference[] {
  return proposals
    .filter((proposal) => ids.has(proposal.id) && proposal.applicable)
    .map(({ spoolKey, field, before, after, providerId, referenceId }) => ({
      spoolKey,
      field,
      before,
      after,
      providerId,
      referenceId,
    }));
}

/**
 * Record edits for accepted proposals, dropping any that no longer apply: the spool is gone or its
 * value changed since, or its service cannot take the field. `dropped` says how many were left
 * out.
 */
export function referenceEditsFromAccepted(
  accepted: readonly AcceptedReference[],
  spools: readonly CommonSpool[],
): { edits: RecordEdits; dropped: number } {
  const byKey = new Map(spools.map((spool) => [recordKey(spool), spool] as const));
  const edits = new Map<string, Partial<Record<ComparableField, FieldValue>>>();
  let dropped = 0;
  for (const entry of accepted) {
    const spool = byKey.get(entry.spoolKey);
    if (
      !spool ||
      !canApplyCleanup(spool, entry.field) ||
      !strictValuesEqual(
        (entry.field === "colors" ? spool.colors : spool[entry.field]) as FieldValue,
        entry.before,
      )
    ) {
      dropped += 1;
      continue;
    }
    const edit = edits.get(entry.spoolKey) ?? {};
    edit[entry.field] = Array.isArray(entry.after) ? [...entry.after] : entry.after;
    edits.set(entry.spoolKey, edit);
  }
  return { edits, dropped };
}

/**
 * Combines record edits from several sources (accepted cleanups, accepted reference data). Later
 * sets win a field both set, so the caller orders them from weakest to strongest.
 */
export function mergeRecordEdits(...sets: ReadonlyArray<RecordEdits | undefined>): RecordEdits {
  const merged = new Map<string, Partial<Record<ComparableField, FieldValue>>>();
  for (const set of sets)
    for (const [key, edit] of set ?? []) merged.set(key, { ...merged.get(key), ...edit });
  return merged;
}
