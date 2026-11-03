import {
  acceptedFrom,
  proposeCleanup,
  summarizeCleanup,
  toRecordEdits,
  type CleanupProposal,
  type CleanupResult,
  type CleanupSummary,
} from "@spoolsync/core/core/cleanup";
import { formatValue, type RecordEdits } from "@spoolsync/core/core/compare";
import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { duplicatesAfterCleanup } from "@spoolsync/core/workflow";

import type { Options } from "./options";

/** What a cleanup run decided: nothing here has been written anywhere. */
export interface CleanupOutcome {
  result: CleanupResult;
  summary: CleanupSummary;
  /** Safe proposals a service can take; applied to the plan only with `--cleanup`. */
  applied: CleanupProposal[];
  /** Plan input for `applied`. */
  edits: RecordEdits;
  /** Spools that would look like duplicates once `applied` is in place (report only). */
  newDuplicates: string[][];
}

/** The change as a report prints it. */
export interface CleanupChange {
  spool: string;
  field: string;
  before: unknown;
  after: unknown;
  rule: string;
  confidence: "safe" | "review";
  reason: string;
  /** Whether the spool's service can take the change. */
  applicable: boolean;
}

/** The `cleanup` section of a JSON report. */
export interface CleanupSection {
  rules: string[];
  counts: {
    proposals: number;
    safe: number;
    review: number;
    applicable: number;
    warnings: number;
  };
  /** Changes added to the plan (`--cleanup`); empty otherwise. */
  applied: CleanupChange[];
  /** Every proposal, with `--cleanup-report`. */
  proposals?: CleanupChange[];
  warnings: Array<{ spool: string; field: string; rule: string; message: string }>;
  /** Groups of spool keys that become likely duplicates once the applied changes are in place. */
  duplicatesAfterCleanup: string[][];
}

const toChange = (proposal: CleanupProposal): CleanupChange => ({
  spool: proposal.spoolKey,
  field: proposal.field,
  before: proposal.before,
  after: proposal.after,
  rule: proposal.rule,
  confidence: proposal.confidence,
  reason: proposal.reason,
  applicable: proposal.applicable,
});

/**
 * Proposes cleanups for what is loaded. With `--cleanup`, the safe proposals a service can take
 * become planned updates; everything else (review items, warnings, read-only services) is only
 * reported.
 */
export function runCleanup(
  options: Options,
  loaded: ReadonlyMap<SourceId, LoadResult>,
): CleanupOutcome {
  const results = [...loaded.values()];
  const result = proposeCleanup(
    results.flatMap((loadedResult) => loadedResult.spools),
    options.cleanupRules ? { enabled: options.cleanupRules } : {},
  );
  const applied = options.cleanup
    ? result.proposals.filter((proposal) => proposal.applicable && proposal.confidence === "safe")
    : [];
  const accepted = acceptedFrom(result.proposals, new Set(applied.map((p) => p.id)));
  return {
    result,
    summary: summarizeCleanup(result),
    applied,
    edits: toRecordEdits(accepted),
    newDuplicates: duplicatesAfterCleanup(results, accepted).map((group) =>
      group.spools.map((spool) => `${spool.source}:${spool.sourceId}`),
    ),
  };
}

export function cleanupSection(outcome: CleanupOutcome, options: Options): CleanupSection {
  const { summary, result } = outcome;
  return {
    rules: result.rules,
    counts: {
      proposals: summary.total,
      safe: summary.safe,
      review: summary.review,
      applicable: summary.applicable,
      warnings: summary.warnings,
    },
    applied: outcome.applied.map(toChange),
    ...(options.cleanupReport ? { proposals: result.proposals.map(toChange) } : {}),
    warnings: result.warnings.map((warning) => ({
      spool: warning.spoolKey,
      field: warning.field,
      rule: warning.rule,
      message: warning.message,
    })),
    duplicatesAfterCleanup: outcome.newDuplicates,
  };
}

const show = (proposal: CleanupProposal, value: CleanupProposal["before"]) =>
  value === null || value === "" ? "(empty)" : JSON.stringify(formatValue(proposal.field, value));

function line(proposal: CleanupProposal): string {
  return (
    `  ${proposal.spoolKey} ${proposal.field}: ${show(proposal, proposal.before)} -> ` +
    `${show(proposal, proposal.after)} [${proposal.confidence}, ${proposal.rule}] ${proposal.reason}`
  );
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Plain-text lines for the cleanup part of a report (warnings are returned separately). */
export function cleanupLines(
  outcome: CleanupOutcome,
  options: Options,
): { lines: string[]; warnings: string[] } {
  const { summary, result } = outcome;
  const lines: string[] = [];
  const applied = new Set(outcome.applied.map((proposal) => proposal.id));
  const heading = options.cleanup
    ? `Cleanup: ${plural(summary.total, "proposal")}; ${applied.size} safe ${applied.size === 1 ? "change" : "changes"} added to the plan, ${summary.review} to review, ${summary.total - summary.applicable} not applicable to their service.`
    : `Cleanup: ${plural(summary.total, "proposal")} (${summary.safe} safe, ${summary.review} to review, ${summary.total - summary.applicable} not applicable to their service). Nothing is changed.`;
  lines.push(heading);
  const listed = options.cleanupReport
    ? result.proposals
    : result.proposals.filter((proposal) => applied.has(proposal.id));
  for (const proposal of listed) lines.push(line(proposal));
  if (options.cleanup && !options.cleanupReport && summary.total > applied.size)
    lines.push(
      "Run with --cleanup-report to list the proposals that were not applied, or --cleanup=<rules> to choose rules.",
    );
  for (const group of outcome.newDuplicates)
    lines.push(`Possible duplicates after cleanup: ${group.join(", ")}`);
  return {
    lines,
    warnings: result.warnings.map(
      (warning) => `Cleanup warning (${warning.spoolKey} ${warning.field}): ${warning.message}`,
    ),
  };
}
