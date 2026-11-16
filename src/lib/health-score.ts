/** Compatibility entry point; inventory scoring lives in the shared core package. */
export {
  HEALTH_FACTOR_IDS,
  HEALTH_WEIGHTS,
  computeHealthScore,
  countCleanupSpools,
  countMissingPrice,
  gradeFor,
  missingPriceKeys,
  type HealthFactor,
  type HealthFactorId,
  type HealthGrade,
  type HealthInputs,
  type HealthScore,
} from "@spoolsync/core/workflow";
