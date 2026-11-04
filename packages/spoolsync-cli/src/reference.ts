import { formatValue, type RecordEdits } from "@spoolsync/core/core/compare";
import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import {
  REFERENCE_FIELDS,
  ReferenceCatalog,
  acceptedReferences,
  analyzeReference,
  needsChoice,
  parseReferenceFile,
  referenceEditsFromAccepted,
  safeReferenceProposals,
  type ColorCheck,
  type ParsedReferenceFile,
  type ReferenceAnalysis,
  type ReferenceFilament,
  type ReferenceItem,
  type ReferenceProposal,
} from "@spoolsync/core/core/reference";

import type { Options } from "./options";
import type { CliDependencies } from "./runtime";

/** What a reference run decided: nothing here has been written anywhere. */
export interface ReferenceOutcome {
  file: string;
  parsed: ParsedReferenceFile;
  analysis: ReferenceAnalysis;
  /** Safe fills a service can take; added to the plan only with `--reference`. */
  applied: ReferenceProposal[];
  /** Plan input for `applied`. */
  edits: RecordEdits;
}

export interface ReferenceChange {
  spool: string;
  field: string;
  before: unknown;
  after: unknown;
  kind: "fill" | "overwrite";
  confidence: "safe" | "review";
  /** The reference record the value came from. */
  reference: string;
  reason: string;
  /** Whether the spool's service is writable and stores the field. */
  applicable: boolean;
}

/** The `reference` section of a JSON report. */
export interface ReferenceSection {
  provider: string;
  file: string;
  attribution: string;
  license: string | null;
  catalog: { records: number; usable: number; skipped: number };
  counts: {
    spools: number;
    matched: number;
    ambiguous: number;
    suggested: number;
    unmatched: number;
    proposals: number;
    safe: number;
    review: number;
    applicable: number;
    colorMismatches: number;
    colorClose: number;
  };
  /** Changes added to the plan (`--reference`); empty otherwise. */
  applied: ReferenceChange[];
  /** Every proposal, with `--reference-report`. */
  proposals?: ReferenceChange[];
  /** Spools that need a person's choice among several records, with `--reference-report`. */
  ambiguous?: Array<{
    spool: string;
    status: "ambiguous" | "suggested";
    note: string | null;
    candidates: Array<{ id: string; label: string; score: number; confidence: string }>;
  }>;
  /** Color checks that are not a match, with `--reference-report`. */
  colorChecks?: Array<{
    spool: string;
    spoolHex: string;
    referenceHex: string;
    deltaE: number;
    verdict: ColorCheck["verdict"];
    countDiffers: boolean;
  }>;
  warnings: string[];
}

/** The brand is how a record is matched and the price is what a person paid, so neither is touched. */
const CLI_FIELDS = REFERENCE_FIELDS.filter((field) => field !== "vendor" && field !== "price");

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Reads the reference file named by `--reference` or `--reference-report`. Nothing is fetched: the
 * CLI never contacts a reference service, so what it matches against is exactly the file given.
 */
export async function loadReferenceFile(
  options: Options,
  dependencies: Pick<CliDependencies, "readText">,
): Promise<{ file: string; parsed: ParsedReferenceFile } | undefined> {
  const file = options.reference ?? options.referenceReport;
  if (!file) return undefined;
  let text: string;
  try {
    text = await dependencies.readText(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(
        `Could not load reference file "${file}": file not found. Check the path (relative paths are resolved from ${process.cwd()}).`,
      );
    throw new Error(`Could not load reference file "${file}": ${reason(error)}`);
  }
  try {
    return { file, parsed: parseReferenceFile(file, text) };
  } catch (error) {
    throw new Error(`Could not load reference file "${file}": ${reason(error)}`);
  }
}

/**
 * Matches what is loaded against the reference file. With `--reference`, the fills a service can
 * take from confident, unambiguous matches become planned updates; overwrites, partial matches and
 * ambiguous ones are only reported.
 */
export function runReference(
  loadedFile: { file: string; parsed: ParsedReferenceFile },
  loaded: ReadonlyMap<SourceId, LoadResult>,
  options: Pick<Options, "reference">,
): ReferenceOutcome {
  const spools = [...loaded.values()].flatMap((result) => result.spools);
  const catalog = new ReferenceCatalog(loadedFile.parsed.filaments);
  // Overwrites are analysed so a report can show them, but only fills ever reach the plan.
  const analysis = analyzeReference(spools, catalog, {
    policy: { fields: CLI_FIELDS, overwrite: CLI_FIELDS },
  });
  const applied = options.reference ? safeReferenceProposals(analysis.proposals) : [];
  const accepted = acceptedReferences(analysis.proposals, new Set(applied.map((proposal) => proposal.id)));
  return {
    file: loadedFile.file,
    parsed: loadedFile.parsed,
    analysis,
    applied,
    edits: referenceEditsFromAccepted(accepted, spools).edits,
  };
}

const toChange = (proposal: ReferenceProposal): ReferenceChange => ({
  spool: proposal.spoolKey,
  field: proposal.field,
  before: proposal.before,
  after: proposal.after,
  kind: proposal.kind,
  confidence: proposal.confidence,
  reference: proposal.referenceId,
  reason: proposal.reason,
  applicable: proposal.applicable,
});

const label = (reference: ReferenceFilament) =>
  [reference.vendor, reference.material, reference.colorName ?? reference.name]
    .filter(Boolean)
    .join(" ") || reference.id;

export function referenceSection(outcome: ReferenceOutcome, options: Options): ReferenceSection {
  const { summary, items, proposals } = outcome.analysis;
  const report = Boolean(options.referenceReport);
  const open = items.filter(needsChoice);
  return {
    provider: "file",
    file: outcome.file,
    attribution: outcome.parsed.attribution,
    license: outcome.parsed.license,
    catalog: {
      records: outcome.parsed.records,
      usable: outcome.parsed.filaments.length,
      skipped: outcome.parsed.skipped,
    },
    counts: {
      spools: summary.spools,
      matched: summary.matched,
      ambiguous: summary.ambiguous,
      suggested: summary.suggested,
      unmatched: summary.unmatched,
      proposals: summary.proposals,
      safe: summary.safe,
      review: summary.review,
      applicable: summary.applicable,
      colorMismatches: summary.colorMismatches,
      colorClose: summary.colorClose,
    },
    applied: outcome.applied.map(toChange),
    ...(report
      ? {
          proposals: proposals.map(toChange),
          ambiguous: open.map((item) => ({
            spool: item.spoolKey,
            status: item.match.status as "ambiguous" | "suggested",
            note: item.match.note,
            candidates: item.match.candidates.map((candidate) => ({
              id: candidate.reference.id,
              label: label(candidate.reference),
              score: candidate.score,
              confidence: candidate.confidence,
            })),
          })),
          colorChecks: items.flatMap((item: ReferenceItem) =>
            item.color && item.color.verdict !== "match"
              ? [
                  {
                    spool: item.spoolKey,
                    spoolHex: item.color.spoolHex,
                    referenceHex: item.color.referenceHex,
                    deltaE: item.color.deltaE,
                    verdict: item.color.verdict,
                    countDiffers: item.color.countDiffers,
                  },
                ]
              : [],
          ),
        }
      : {}),
    warnings: outcome.parsed.warnings,
  };
}

const show = (proposal: ReferenceProposal, value: ReferenceProposal["before"]) =>
  value === null || value === "" ? "(empty)" : JSON.stringify(formatValue(proposal.field, value));

function line(proposal: ReferenceProposal): string {
  return (
    `  ${proposal.spoolKey} ${proposal.field}: ${show(proposal, proposal.before)} -> ` +
    `${show(proposal, proposal.after)} [${proposal.kind}, ${proposal.confidence}] ${proposal.reason}`
  );
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Plain-text lines for the reference part of a report (file warnings are returned separately). */
export function referenceLines(
  outcome: ReferenceOutcome,
  options: Options,
): { lines: string[]; warnings: string[] } {
  const { summary, items, proposals } = outcome.analysis;
  const lines: string[] = [];
  const applied = new Set(outcome.applied.map((proposal) => proposal.id));
  const where = `Reference (${outcome.file}, ${plural(outcome.parsed.filaments.length, "record")}; ${outcome.parsed.attribution}${outcome.parsed.license ? `; license: ${outcome.parsed.license}` : ""})`;
  const matches = `${summary.matched} of ${plural(summary.spools, "spool")} matched, ${summary.ambiguous} ambiguous, ${summary.suggested} only suggested, ${summary.unmatched} unmatched`;
  lines.push(
    options.reference
      ? `${where}: ${matches}; ${plural(applied.size, "safe fill")} added to the plan, ${proposals.length - applied.size} to review or not applicable.`
      : `${where}: ${matches}; ${plural(proposals.length, "proposal")} (${summary.safe} safe, ${summary.review} to review). Nothing is changed.`,
  );
  const listed = options.referenceReport ? proposals : proposals.filter((p) => applied.has(p.id));
  for (const proposal of listed) lines.push(line(proposal));
  if (options.referenceReport) {
    for (const item of items.filter(needsChoice))
      lines.push(
        `  ${item.spoolKey} ${item.match.status === "ambiguous" ? "fits several records" : "has only a partial match"}: ` +
          `${item.match.candidates
            .slice(0, 4)
            .map((candidate) => `${label(candidate.reference)} (${candidate.score})`)
            .join("; ")}. Choose in the browser under Reference data on the Load page.`,
      );
    for (const item of items)
      if (item.color && item.color.verdict !== "match")
        lines.push(
          `  ${item.spoolKey} color: #${item.color.spoolHex} against reference #${item.color.referenceHex}, ` +
            (item.color.countDiffers
              ? "a different number of colors"
              : `difference ${item.color.deltaE.toFixed(1)} (${item.color.verdict})`),
        );
  } else if (options.reference && proposals.length > applied.size) {
    lines.push("Run with --reference-report to list what was not applied.");
  }
  return {
    lines,
    warnings: outcome.parsed.warnings.map((warning) => `Reference warning: ${warning}`),
  };
}
