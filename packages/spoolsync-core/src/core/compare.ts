// Public comparison and planning API. Internal modules import their direct dependencies.
export type {
  FieldValue,
  FieldOption,
  FieldComparison,
  GroupResolution,
  SpoolValues,
  FieldChange,
  PlannedUpdate,
  PlannedCreate,
  PlannedChange,
} from "./comparison/types";
export { FIELD_LABELS, SOURCE_FIELDS } from "./comparison/fields";
export { isBlank, valuesEqual, formatValue } from "./comparison/values";
export { compareGroup, defaultResolution, openConflicts, mergedValues } from "./comparison/groups";
export { LINKABLE_IDS, buildPlan } from "./comparison/plan";
export {
  BULK_EDIT_KEYS,
  BULK_EDIT_LIMITS,
  MAX_EDIT_GRAMS,
  addTagToNote,
  describeBulkEdit,
  editReachesGroup,
  isEmptyEdit,
  mergeBulkEdit,
  normalizeTag,
  sanitizeBulkEdit,
  servicesSupporting,
  withoutBulkEditKeys,
  type BulkEdit,
  type BulkEditKey,
} from "./comparison/edits";
export { PAIR_FIELDS, comparePair, type PairRow, type PairStatus } from "./comparison/pair";
export { changeParts, omitExcluded, type ChangePart } from "./comparison/exclusions";
