import type { ComparableField, SourceId, WritableSourceId } from "@spoolsync/core/core/model";

export type Options = {
  inputs: Map<SourceId, string>;
  empty: WritableSourceId[];
  spoolmanUrl?: string;
  spoolmanToken?: string;
  filamentdbUrl?: string;
  filamentdbToken?: string;
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
  json: boolean;
};
