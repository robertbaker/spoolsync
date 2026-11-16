/** Compatibility entry point; inventory reporting is framework independent and lives in core. */
export {
  NO_BRAND,
  NO_MATERIAL,
  buildInventoryReport,
  reportCsv,
  reportDate,
  reportFilename,
  reportMarkdown,
  reportNotes,
  summaryLines,
  type InventoryReport,
  type LowRow,
  type ReportFormat,
  type ReportOptions,
  type ReportRow,
} from "@spoolsync/core/workflow";
