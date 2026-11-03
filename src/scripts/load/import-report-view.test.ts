import { expect, test } from "bun:test";

import type { LoadResult } from "@spoolsync/core/core/model";
import { buildImportReport } from "@spoolsync/core/workflow";
import { makeSpool } from "@spoolsync/core/core/testing";

import { importReportView, reportSummary } from "./import-report-view";

const result = (warnings: string[]): LoadResult => ({
  source: "spoolhoarder",
  spools: [makeSpool("spoolhoarder", "1"), makeSpool("spoolhoarder", "2", { remainingWeight: null })],
  warnings,
  loadedAt: "now",
});

test("summarises rows read, loaded, skipped and adjusted", () => {
  const report = buildImportReport(
    result([
      "Row 3: marked deleted in Spool Hoarder; skipped.",
      "Spool 2: remaining weight was unknown; the exported spool is treated as full.",
    ]),
  );
  expect(reportSummary(report)).toBe("3 rows read · 2 loaded · 1 skipped · 1 adjusted");
});

test("a clean file says every row was loaded as written", () => {
  const view = importReportView(result([]), "clean.csv");
  expect(view.tagName).toBe("DETAILS");
  expect(view.open).toBe(false);
  expect(view.textContent).toContain("Every row was loaded as written.");
  expect(view.querySelector("table")).toBeNull();
});

test("lists skipped rows with their reason as text, never as markup", () => {
  const view = importReportView(
    result(["Row 5: <img src=x onerror=alert(1)> invalid; skipped."]),
    "<b>file</b>.csv",
  );
  expect(view.querySelector("img")).toBeNull();
  expect(view.querySelector("b")).toBeNull();
  const cells = [...view.querySelectorAll("tbody th, tbody td")].map((cell) => cell.textContent);
  expect(cells[0]).toBe("Row 5");
  expect(cells[1]).toContain("invalid; skipped.");
  expect(view.textContent).toContain("Skipped rows (not loaded)");
  expect(view.querySelector("button")?.textContent).toBe("Download report (CSV)");
});

test("shows only the first rows on screen and says how many are left", () => {
  const warnings = Array.from({ length: 60 }, (_, n) => `Row ${n + 2}: bad value; skipped.`);
  const view = importReportView(result(warnings), "big.csv");
  expect(view.querySelectorAll("tbody tr")).toHaveLength(50);
  expect(view.textContent).toContain("and 10 more in the downloaded report");
});
