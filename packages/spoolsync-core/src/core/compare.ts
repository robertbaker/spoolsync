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
