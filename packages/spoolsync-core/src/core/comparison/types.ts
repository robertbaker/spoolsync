import type { CommonSpool, ComparableField, CrossIds, SourceId, WritableSourceId } from "../model";

export type FieldValue = CommonSpool[ComparableField];

export interface FieldOption {
  value: FieldValue;
  sources: SourceId[];
}

export interface FieldComparison {
  field: ComparableField;
  /** Fill: only some sources have a value and they agree. conflict: sources disagree. */
  kind: "fill" | "conflict";
  options: FieldOption[];
  /** Sources in the group that store this field but have no value. */
  blank: SourceId[];
}

/** What the user decided for one group. */
export interface GroupResolution {
  /** The value to use for each field the user resolved. Fields left out are not changed. */
  values: Partial<Record<ComparableField, FieldValue>>;
  /** Loaded services that lack this spool and should get it. */
  createIn: WritableSourceId[];
}

export type SpoolValues = { [K in ComparableField]: CommonSpool[K] };

export interface FieldChange {
  field: ComparableField;
  from: FieldValue;
  to: FieldValue;
}

export interface PlannedUpdate {
  kind: "update";
  source: WritableSourceId;
  groupId: string;
  spool: CommonSpool;
  changes: FieldChange[];
  /** Cross-ids from the rest of the group to stamp on this record ({@link LINKABLE_IDS}). */
  links: CrossIds;
}

export interface PlannedCreate {
  kind: "create";
  source: WritableSourceId;
  groupId: string;
  values: SpoolValues;
  links: CrossIds;
  /**
   * Every id the group's existing records have, e.g. to name a new Spoolstock row after its
   * Spoolman spool.
   */
  groupIds: CrossIds;
}

export type PlannedChange = PlannedUpdate | PlannedCreate;
