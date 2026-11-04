import type { CleanupRuleId } from "@spoolsync/core/core/cleanup";
import type { ComparableField, SourceId, WritableSourceId } from "@spoolsync/core/core/model";

export type Options = {
  inputs: Map<SourceId, string>;
  empty: WritableSourceId[];
  spoolmanUrl?: string;
  spoolmanToken?: string;
  filamentdbUrl?: string;
  filamentdbToken?: string;
  filamentDbUrl?: string;
  filamentDbToken?: string;
  filadexUrl?: string;
  filadexUser?: string;
  apply: boolean;
  resolves: Array<[ComparableField, SourceId]>;
  createIn: WritableSourceId[];
  confirm: string[];
  reject: string[];
  outputDir?: string;
  /** Write every loaded spool to one CSV file. */
  exportCsv?: string;
  /** Report counts for what is loaded instead of planning changes. */
  summary: boolean;
  /** Print a shopping list of spools that are running low instead of planning changes. */
  reorder: boolean;
  /** Apply safe data-cleanup proposals (see `--cleanup`) to the plan. */
  cleanup: boolean;
  /** Print every cleanup proposal and warning; alone it reports only and plans nothing. */
  cleanupReport: boolean;
  /** Rules named with `--cleanup=<rules>` or `--cleanup-report=<rules>`; all when absent. */
  cleanupRules?: CleanupRuleId[];
  /** Reference file: add confident, unambiguous fills from it to the plan (see `--reference`). */
  reference?: string;
  /** Reference file: list every match, proposal and color check; alone it plans nothing. */
  referenceReport?: string;
  /** Where `--apply` saves the rollback file it makes before writing. */
  rollbackDir?: string;
  /** Write to a service without saving a rollback file first. */
  noRollback: boolean;
  /** Put back what a rollback file recorded (a dry run without `--apply`). */
  restoreRollback?: string;
  /**
   * With `--reference` or `--reference-report`, exit with code 1 when a catalog disagrees with a
   * spool.
   */
  failOnMismatch: boolean;
  /** Save the given options as defaults in the per-user settings file, then stop. */
  saveConfig: boolean;
  /** With --summary or --reorder, the share of full weight at or under which a spool is low. */
  lowThreshold?: number;
  /** Run again whenever an input file changes. */
  watch: boolean;
  /** With --watch, print a run only when its output changed. */
  quiet: boolean;
  json: boolean;
};
