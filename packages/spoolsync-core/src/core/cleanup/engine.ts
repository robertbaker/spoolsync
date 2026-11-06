import { SOURCE_FIELDS } from "../comparison/fields";
import { strictValuesEqual, type RecordEdits } from "../comparison/record-edits";
import type { FieldValue } from "../comparison/types";
import { recordKey } from "../matching/keys";
import {
  COMPARABLE_FIELDS,
  SOURCE_IDS,
  isWritableSource,
  type CommonSpool,
  type ComparableField,
} from "../model";
import { CLEANUP_RULES } from "./rules";
import {
  CLEANUP_RULE_IDS,
  type CleanupConfidence,
  type CleanupDraft,
  type CleanupOptions,
  type CleanupProposal,
  type CleanupResult,
  type CleanupRuleId,
  type CleanupStep,
  type CleanupWarning,
} from "./types";
import { buildVendorIndex } from "./vendors";

const NUMERIC_EN_COLLATOR = new Intl.Collator("en", { numeric: true });
const EN_COLLATOR = new Intl.Collator("en");

const byIdentity = (a: CommonSpool, b: CommonSpool) =>
  SOURCE_IDS.indexOf(a.source) - SOURCE_IDS.indexOf(b.source) ||
  NUMERIC_EN_COLLATOR.compare(a.sourceId, b.sourceId) ||
  EN_COLLATOR.compare(a.sourceId, b.sourceId);

function initialDraft(spool: CommonSpool): CleanupDraft {
  const draft: CleanupDraft = {};
  for (const field of COMPARABLE_FIELDS)
    draft[field] = field === "colors" ? [...(spool.colors ?? [])] : spool[field];
  return draft;
}

/** Whether a service can take a cleaned value for a field: writable, and the field is stored. */
export function canApplyCleanup(
  spool: Pick<CommonSpool, "source">,
  field: ComparableField,
): boolean {
  return isWritableSource(spool.source) && SOURCE_FIELDS[spool.source].has(field);
}

interface Recorded {
  rule: CleanupRuleId;
  step: CleanupStep;
}

/**
 * Looks at every spool and proposes cleaner values. It never changes a spool: the result is a list
 * of per-field proposals to accept or reject, and warnings about values that look wrong but have no
 * single fix. The output is deterministic: spools are visited in service order and by id, fields in
 * comparison order, and nothing depends on the clock unless `today` is given.
 *
 * Rules run in a fixed order and each sees what the earlier ones produced, so one field gets at
 * most one proposal whose `before` is the stored value and whose `after` is the end of the chain.
 * Turning a rule off removes its step and everything that depends on it. Empty strings and `null`
 * are never converted into each other, and fields no rule reads (notes' line breaks, unknown source
 * data, cross-service IDs) are never touched.
 */
export function proposeCleanup(
  spools: readonly CommonSpool[],
  options: CleanupOptions = {},
): CleanupResult {
  const enabled = new Set<CleanupRuleId>(options.enabled ?? CLEANUP_RULE_IDS);
  const rules = CLEANUP_RULES.filter((rule) => enabled.has(rule.id));
  const vendorIndex = buildVendorIndex(options.vendorAliases);
  const proposals: CleanupProposal[] = [];
  const warnings: CleanupWarning[] = [];

  for (const spool of [...spools].sort(byIdentity)) {
    const spoolKey = recordKey(spool);
    const draft = initialDraft(spool);
    const recorded = new Map<ComparableField, Recorded[]>();
    const seenWarnings = new Set<string>();

    for (const rule of rules) {
      const result = rule.run({ spool, draft, vendorIndex, today: options.today });
      for (const step of result.steps) {
        draft[step.field] = step.value;
        const list = recorded.get(step.field) ?? [];
        list.push({ rule: rule.id, step });
        recorded.set(step.field, list);
      }
      for (const finding of result.warnings) {
        const id = `${finding.field}|${rule.id}|${finding.message}`;
        if (seenWarnings.has(id)) continue;
        seenWarnings.add(id);
        warnings.push({
          spoolKey,
          source: spool.source,
          sourceId: spool.sourceId,
          field: finding.field,
          rule: rule.id,
          message: finding.message,
        });
      }
    }

    const mine: CleanupProposal[] = [];
    for (const field of COMPARABLE_FIELDS) {
      const steps = recorded.get(field);
      if (!steps) continue;
      const before = spool[field] as FieldValue;
      const after = draft[field] as FieldValue;
      if (strictValuesEqual(before, after)) continue;
      const rulesUsed = [...new Set(steps.map((entry) => entry.rule))];
      const reasons = [...new Set(steps.map((entry) => entry.step.reason))];
      const bundle = steps.find((entry) => entry.step.bundle)?.step.bundle;
      mine.push({
        id: `${spoolKey}#${field}`,
        spoolKey,
        source: spool.source,
        sourceId: spool.sourceId,
        field,
        before: Array.isArray(before) ? [...before] : before,
        after: Array.isArray(after) ? [...after] : after,
        rule: steps[steps.length - 1]!.rule,
        rules: rulesUsed,
        confidence: steps.some((entry) => entry.step.confidence === "review") ? "review" : "safe",
        reason: reasons.join(" "),
        ...(bundle ? { bundle: `${spoolKey}:${bundle}` } : {}),
        applicable: canApplyCleanup(spool, field),
      });
    }
    linkBundles(mine);
    proposals.push(...mine);
  }
  return {
    proposals,
    warnings,
    rules: rules.map((rule) => rule.id),
    spoolsChecked: spools.length,
  };
}

/** Keeps a bundle only when two or more proposals share it, with its most cautious confidence. */
function linkBundles(proposals: CleanupProposal[]): void {
  const groups = new Map<string, CleanupProposal[]>();
  for (const proposal of proposals)
    if (proposal.bundle)
      groups.set(proposal.bundle, [...(groups.get(proposal.bundle) ?? []), proposal]);
  for (const members of groups.values()) {
    if (members.length < 2) {
      for (const member of members) delete member.bundle;
      continue;
    }
    const confidence: CleanupConfidence = members.some((member) => member.confidence === "review")
      ? "review"
      : "safe";
    const applicable = members.every((member) => member.applicable);
    for (const member of members) {
      member.confidence = confidence;
      member.applicable = applicable;
    }
  }
}

/** Adds every proposal that shares a bundle with a chosen one. */
export function expandBundles(
  proposals: readonly CleanupProposal[],
  ids: Iterable<string>,
): Set<string> {
  const chosen = new Set(ids);
  const bundles = new Set(
    proposals.filter((proposal) => chosen.has(proposal.id) && proposal.bundle).map((p) => p.bundle),
  );
  for (const proposal of proposals)
    if (proposal.bundle && bundles.has(proposal.bundle)) chosen.add(proposal.id);
  return chosen;
}

/** Ids of the proposals a service can take and that change nothing but form. */
export function safeProposalIds(proposals: readonly CleanupProposal[]): Set<string> {
  return new Set(
    proposals
      .filter((proposal) => proposal.applicable && proposal.confidence === "safe")
      .map((proposal) => proposal.id),
  );
}

/** What is stored for an accepted proposal: enough to re-apply it, and to notice it went stale. */
export interface AcceptedCleanup {
  spoolKey: string;
  field: ComparableField;
  before: FieldValue;
  after: FieldValue;
}

export function acceptedFrom(
  proposals: readonly CleanupProposal[],
  ids: ReadonlySet<string>,
): AcceptedCleanup[] {
  return proposals
    .filter((proposal) => ids.has(proposal.id) && proposal.applicable)
    .map(({ spoolKey, field, before, after }) => ({ spoolKey, field, before, after }));
}

/** Plan input for accepted cleanups. */
export function toRecordEdits(
  accepted: Iterable<Pick<AcceptedCleanup, "spoolKey" | "field" | "after">>,
): RecordEdits {
  const edits = new Map<string, Partial<Record<ComparableField, FieldValue>>>();
  for (const { spoolKey, field, after } of accepted) {
    const edit = edits.get(spoolKey) ?? {};
    Object.assign(edit, { [field]: Array.isArray(after) ? [...after] : after });
    edits.set(spoolKey, edit);
  }
  return edits;
}

/**
 * Record edits for previously accepted cleanups, dropping any that no longer apply: the spool is
 * gone or was changed since (its value is no longer the one that was cleaned), or the service
 * cannot take the field. `dropped` says how many were left out, so a page can tell the person.
 */
export function recordEditsFromAccepted(
  accepted: readonly AcceptedCleanup[],
  spools: readonly CommonSpool[],
): { edits: RecordEdits; dropped: number } {
  const byKey = new Map(spools.map((spool) => [recordKey(spool), spool] as const));
  const valid: AcceptedCleanup[] = [];
  for (const entry of accepted) {
    const spool = byKey.get(entry.spoolKey);
    if (
      spool &&
      canApplyCleanup(spool, entry.field) &&
      strictValuesEqual(spool[entry.field] as FieldValue, entry.before)
    )
      valid.push(entry);
  }
  return { edits: toRecordEdits(valid), dropped: accepted.length - valid.length };
}

export interface CleanupSummary {
  total: number;
  safe: number;
  review: number;
  /** Proposals a service can take. */
  applicable: number;
  /** Spools with at least one proposal. */
  spools: number;
  /** Proposals each rule took part in (one proposal can involve several rules). */
  byRule: Partial<Record<CleanupRuleId, number>>;
  warnings: number;
}

export function summarizeCleanup(
  result: Pick<CleanupResult, "proposals" | "warnings">,
): CleanupSummary {
  const byRule: Partial<Record<CleanupRuleId, number>> = {};
  for (const proposal of result.proposals)
    for (const rule of proposal.rules) byRule[rule] = (byRule[rule] ?? 0) + 1;
  return {
    total: result.proposals.length,
    safe: result.proposals.filter((p) => p.confidence === "safe").length,
    review: result.proposals.filter((p) => p.confidence === "review").length,
    applicable: result.proposals.filter((p) => p.applicable).length,
    spools: new Set(result.proposals.map((p) => p.spoolKey)).size,
    byRule,
    warnings: result.warnings.length,
  };
}

/**
 * Reads a `--cleanup=` value: rule ids separated by commas, `all`, and `-id` to leave one out.
 * `all,-casing` is every rule except casing; `-casing` alone means the same.
 */
export function parseRuleSelection(
  input: string,
): { ok: true; enabled: CleanupRuleId[] } | { ok: false; error: string } {
  const known = new Set<string>(CLEANUP_RULE_IDS);
  let chosen: Set<CleanupRuleId> | null = null;
  const tokens = input.split(",").map((token) => token.trim().toLowerCase());
  if (tokens.every((token) => !token)) return { ok: false, error: "No cleanup rules were named." };
  for (const token of tokens) {
    if (!token) continue;
    const remove = token.startsWith("-");
    const name = remove ? token.slice(1) : token;
    if (name !== "all" && !known.has(name))
      return {
        ok: false,
        error: `Unknown cleanup rule "${name}". Choose from: all, ${CLEANUP_RULE_IDS.join(", ")}.`,
      };
    const ids = name === "all" ? [...CLEANUP_RULE_IDS] : [name as CleanupRuleId];
    if (remove) {
      chosen ??= new Set(CLEANUP_RULE_IDS);
      for (const id of ids) chosen.delete(id);
    } else {
      chosen ??= new Set();
      for (const id of ids) chosen.add(id);
    }
  }
  const enabled = CLEANUP_RULE_IDS.filter((id) => chosen?.has(id));
  if (!enabled.length) return { ok: false, error: "That leaves no cleanup rules to run." };
  return { ok: true, enabled };
}
