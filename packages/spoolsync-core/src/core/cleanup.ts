// Public data-cleanup API. Internal modules import their direct dependencies.
export {
  CLEANUP_RULE_IDS,
  type CleanupConfidence,
  type CleanupOptions,
  type CleanupProposal,
  type CleanupResult,
  type CleanupRule,
  type CleanupRuleId,
  type CleanupWarning,
  type VendorAlias,
} from "./cleanup/types";
export {
  acceptedFrom,
  canApplyCleanup,
  expandBundles,
  parseRuleSelection,
  proposeCleanup,
  recordEditsFromAccepted,
  safeProposalIds,
  summarizeCleanup,
  toRecordEdits,
  type AcceptedCleanup,
  type CleanupSummary,
} from "./cleanup/engine";
export { CLEANUP_RULES, ruleById, PRICE_WARN_ABOVE, STANDARD_DIAMETERS } from "./cleanup/rules";
export { VENDOR_ALIASES, buildVendorIndex, canonicalVendor, vendorKey } from "./cleanup/vendors";
export {
  DEFAULT_CLEANUP_SETTINGS,
  MAX_ACCEPTED_CLEANUPS,
  sanitizeAcceptedCleanups,
  sanitizeCleanupSettings,
  type CleanupSettings,
} from "./cleanup/settings";
export {
  normalizeBarcode,
  normalizeDate,
  normalizeHex,
  parseDecimal,
  parseDiameter,
  parsePrice,
  parseTemperature,
  parseWeight,
} from "./cleanup/numbers";
export { formatMaterial, parseMaterial } from "./cleanup/materials";
export { recase, titleCase } from "./cleanup/text";
