import { SOURCE_LABELS, type LoadResult } from "@spoolsync/core/core/model";
import {
  buildImportReport,
  importReportCsv,
  isCleanImport,
  type ImportReport,
  type ImportReportEntry,
} from "@spoolsync/core/workflow";

import { h } from "../dom";
import { download } from "../sync/presentation";
import { plural } from "./presentation";

/** Rows shown on screen; the downloaded CSV always has every one. */
const VISIBLE_ROWS = 50;

export function reportSummary(report: ImportReport): string {
  const parts = [`${plural(report.rowsRead, "row")} read`, `${report.spoolsLoaded} loaded`];
  if (report.skipped.length) parts.push(`${report.skipped.length} skipped`);
  if (report.changed.length) parts.push(`${report.changed.length} adjusted`);
  return parts.join(" · ");
}

function table(caption: string, entries: readonly ImportReportEntry[]): HTMLElement {
  const shown = entries.slice(0, VISIBLE_ROWS);
  const more = entries.length - shown.length;
  return h(
    "div",
    { class: "mt-3" },
    h("p", { class: "font-medium" }, caption),
    h(
      "div",
      { class: "mt-1 max-h-60 overflow-auto" },
      h(
        "table",
        { class: "w-full text-left" },
        h("caption", { class: "sr-only" }, caption),
        h(
          "thead",
          { class: "text-muted-foreground" },
          h(
            "tr",
            {},
            h("th", { scope: "col", class: "py-1 pr-3 font-medium" }, "Where"),
            h("th", { scope: "col", class: "py-1 font-medium" }, "Why"),
          ),
        ),
        h(
          "tbody",
          {},
          ...shown.map((entry) =>
            h(
              "tr",
              { class: "border-t align-top" },
              h(
                "th",
                { scope: "row", class: "py-1 pr-3 font-medium whitespace-nowrap" },
                entry.location,
              ),
              h("td", { class: "py-1" }, entry.reason),
            ),
          ),
        ),
      ),
    ),
    more > 0
      ? h("p", { class: "pt-1 text-muted-foreground" }, `and ${more} more in the downloaded report`)
      : null,
  );
}

/**
 * A collapsed report of what happened to every row of a file: how many were read, which were
 * skipped or adjusted and why, and notes about the file. Built from the importer's own warnings, so
 * it always agrees with what was loaded. The download is a CSV safe to open in a spreadsheet.
 */
export function importReportView(result: LoadResult, fileName: string): HTMLDetailsElement {
  return renderImportReport(buildImportReport(result, fileName), fileName);
}

/**
 * The same collapsed report for a report that was already built, such as the dry run of a column
 * mapping. `lead` replaces the first sentence when the file was not read as a service in the usual
 * way, and `summaryLabel` the closed disclosure's title.
 */
export function renderImportReport(
  report: ImportReport,
  fileName: string,
  options: { lead?: string; summaryLabel?: string } = {},
): HTMLDetailsElement {
  const clean = isCleanImport(report);
  const downloadButton = h(
    "button",
    {
      type: "button",
      class:
        "mt-3 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
    },
    "Download report (CSV)",
  );
  downloadButton.addEventListener("click", () =>
    download(
      `spoolsync-import-report-${report.source}-${new Date().toISOString().slice(0, 10)}.csv`,
      `﻿${importReportCsv(report)}`,
      "text/csv",
    ),
  );
  return h(
    "details",
    {
      class: "import-report mt-2 w-full rounded-lg border bg-muted/20 text-xs",
      "data-import-report": report.source,
    },
    h(
      "summary",
      {
        class:
          "cursor-pointer p-2 font-medium focus-visible:outline-2 focus-visible:outline-primary",
      },
      `${options.summaryLabel ?? "Import report"} · ${reportSummary(report)}`,
    ),
    h(
      "div",
      { class: "px-3 pb-3" },
      h(
        "p",
        {},
        options.lead ?? `${fileName} was read as ${SOURCE_LABELS[report.source]}. `,
        // A caller that supplies its own lead (the column mapper's dry run) says what happened itself.
        options.lead
          ? ""
          : clean
            ? "Every row was loaded as written."
            : "Rows not listed here were loaded as written.",
        report.unknownWeight
          ? ` ${plural(report.unknownWeight, "spool")} ${options.lead ? "would load" : "loaded"} without a remaining weight.`
          : "",
      ),
      report.skipped.length
        ? table(
            options.lead ? "Skipped rows (would not load)" : "Skipped rows (not loaded)",
            report.skipped,
          )
        : null,
      report.changed.length ? table("Values adjusted on import", report.changed) : null,
      report.warnings.length
        ? h(
            "div",
            { class: "mt-3" },
            h("p", { class: "font-medium" }, "Notes about the file"),
            h(
              "ul",
              { class: "mt-1 list-disc pl-5" },
              ...report.warnings.map((text) => h("li", {}, text)),
            ),
          )
        : null,
      downloadButton,
    ),
  );
}
