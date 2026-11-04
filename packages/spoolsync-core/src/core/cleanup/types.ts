import type { FieldValue } from "../comparison/types";
import type { CommonSpool, ComparableField, SourceId } from "../model";

/**
 * Every cleanup rule, in the order the engine runs them. A later rule sees the value an earlier one
 * produced, so a vendor typed as ` PRUSAMENT inc ` goes through `whitespace`, `casing`, then
 * `vendor-alias`, and ends as one proposal for the field.
 */
export const CLEANUP_RULE_IDS = [
  "whitespace",
  "casing",
  "vendor-alias",
  "material",
  "material-variant",
  "diameter",
  "color-hex",
  "price",
  "weight",
  "temperature",
  "barcode",
  "date",
] as const;
export type CleanupRuleId = (typeof CLEANUP_RULE_IDS)[number];

/**
 * - `safe`: cosmetic only (case, spacing, punctuation, a format that has one reading). Nothing about
 *   the meaning of the value changes, so the CLI applies these on request.
 * - `review`: a person should look first (an alias, a unit conversion, a value moved between fields,
 *   a guess between two readings). Never applied without an explicit choice.
 */
export type CleanupConfidence = "safe" | "review";

/** One proposed change to one field of one spool. Nothing is ever applied by creating it. */
export interface CleanupProposal {
  /** Stable for the same spool and field: `<source>:<sourceId>#<field>`. */
  id: string;
  /** `source:sourceId`, the same key matching uses. */
  spoolKey: string;
  source: SourceId;
  sourceId: string;
  field: ComparableField;
  before: FieldValue;
  after: FieldValue;
  /** The rule that decided the final value (the last one to change the field). */
  rule: CleanupRuleId;
  /** Every rule that touched the field, in the order they ran. */
  rules: CleanupRuleId[];
  confidence: CleanupConfidence;
  reason: string;
  /**
   * Set when several proposals only make sense together (a finish moved from material to name, or
   * swapped min and max temperatures). Accept or reject the whole bundle; its members share the
   * most cautious confidence among them.
   */
  bundle?: string;
  /**
   * Whether the spool's service can take the change: it must be writable and store the field.
   * Proposals that cannot be applied are still listed so the data problem is visible.
   */
  applicable: boolean;
}

/** A problem the engine noticed but will not fix on its own (a suspicious value, not a format). */
export interface CleanupWarning {
  spoolKey: string;
  source: SourceId;
  sourceId: string;
  field: ComparableField;
  rule: CleanupRuleId;
  message: string;
}

export interface VendorAlias {
  canonical: string;
  aliases: readonly string[];
}

export interface CleanupOptions {
  /** Rules to run. Defaults to all of them. */
  enabled?: readonly CleanupRuleId[];
  /** Extra vendor aliases, checked after (and overriding) the built-in table. */
  vendorAliases?: readonly VendorAlias[];
  /** `YYYY-MM-DD`; with it, purchase dates in the future are flagged. Omitted: not checked. */
  today?: string;
}

export interface CleanupResult {
  proposals: CleanupProposal[];
  warnings: CleanupWarning[];
  /** Rules that were run, in order. */
  rules: CleanupRuleId[];
  spoolsChecked: number;
}

/** Values being cleaned. Number fields may hold text when a source stored a number as a string. */
export type CleanupDraft = Partial<Record<ComparableField, unknown>>;

export interface CleanupStep {
  field: ComparableField;
  value: unknown;
  confidence: CleanupConfidence;
  reason: string;
  /** Short name; the engine scopes it to the spool. */
  bundle?: string;
}

export interface CleanupFinding {
  field: ComparableField;
  message: string;
}

export interface CleanupRuleOutput {
  steps: CleanupStep[];
  warnings: CleanupFinding[];
}

export interface CleanupRuleContext {
  spool: CommonSpool;
  draft: Readonly<CleanupDraft>;
  vendorIndex: ReadonlyMap<string, string>;
  today: string | undefined;
}

export interface CleanupRule {
  id: CleanupRuleId;
  label: string;
  description: string;
  run(context: CleanupRuleContext): CleanupRuleOutput;
}
