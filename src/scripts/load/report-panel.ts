import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { uniqueSpools } from "@spoolsync/core/workflow";

import { loadMatchDecisions } from "~/lib/browser/storage";
import {
  buildInventoryReport,
  reportCsv,
  reportFilename,
  reportMarkdown,
  reportNotes,
  summaryLines,
  type InventoryReport,
  type ReportFormat,
  type ReportRow,
} from "~/lib/inventory-report";
import { currentLowStockRule } from "~/lib/low-stock";
import { DISPLAY_CHANGED, formatMoney, formatWeight, readDisplaySettings } from "~/lib/units";

import { h, showToast } from "../dom";
import { download } from "../sync/presentation";

const BUTTON =
  "rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";

/** Standalone styles for the downloaded HTML file, which has none of the site's CSS. */
const DOWNLOAD_STYLE = `body{font:14px/1.5 system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}
h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:1.5rem}table{border-collapse:collapse;width:100%}
th,td{border-bottom:1px solid #ddd;padding:.3rem .5rem;text-align:left}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
dl{display:grid;grid-template-columns:max-content 1fr;gap:.2rem 1rem}dt{color:#555}dd{margin:0;font-weight:600}.notes{color:#555;font-size:.85rem}`;

function currentFormat(): ReportFormat {
  const unit = readDisplaySettings().weightUnit;
  return {
    unit,
    weight: (grams) => formatWeight(grams, unit),
    money: (amount) => formatMoney(amount),
  };
}

function groupTable(caption: string, firstColumn: string, rows: readonly ReportRow[], format: ReportFormat) {
  const header = (text: string, numeric = false) =>
    h("th", { scope: "col", class: numeric ? "num" : "" }, text);
  return h(
    "table",
    {},
    h("caption", { class: "sr-only" }, caption),
    h("thead", {}, h("tr", {}, header(firstColumn), header("Spools", true), header("Left", true), header("Spent", true))),
    h(
      "tbody",
      {},
      ...rows.map((row) =>
        h(
          "tr",
          {},
          h("th", { scope: "row" }, row.label),
          h("td", { class: "num" }, String(row.spools)),
          h("td", { class: "num" }, format.weight(row.remainingGrams)),
          h("td", { class: "num" }, row.spend === null ? "–" : format.money(row.spend)),
        ),
      ),
    ),
  );
}

/** The report as a document fragment of plain elements; text is always set as text. */
export function reportElement(
  report: InventoryReport,
  format: ReportFormat,
  id: string,
): HTMLElement {
  return h(
    "section",
    { id, class: "report-sheet", "aria-label": "Inventory report" },
    h("h1", {}, "SpoolSync inventory report"),
    h("p", { class: "notes" }, `Generated ${report.generatedAt.slice(0, 10)} from ${report.services.join(", ") || "no services"}.`),
    h("h2", {}, "Summary"),
    h(
      "dl",
      {},
      ...summaryLines(report, format).flatMap(([name, value]) => [h("dt", {}, name), h("dd", {}, value)]),
    ),
    h("h2", {}, "By material"),
    groupTable("Remaining filament by material", "Material", report.byMaterial, format),
    h("h2", {}, "By brand"),
    groupTable("Remaining filament by brand", "Brand", report.byBrand, format),
    h("h2", {}, "Running low"),
    report.low.length
      ? h(
          "table",
          {},
          h("caption", { class: "sr-only" }, "Spools running low"),
          h(
            "thead",
            {},
            h(
              "tr",
              {},
              h("th", { scope: "col" }, "Spool"),
              h("th", { scope: "col" }, "Brand"),
              h("th", { scope: "col", class: "num" }, "Left"),
              h("th", { scope: "col", class: "num" }, "Percent"),
              h("th", { scope: "col" }, "Location"),
            ),
          ),
          h(
            "tbody",
            {},
            ...report.low.map((row) =>
              h(
                "tr",
                {},
                h("th", { scope: "row" }, row.label),
                h("td", {}, row.brand),
                h("td", { class: "num" }, format.weight(row.remainingGrams)),
                h("td", { class: "num" }, row.percent === null ? "–" : `${row.percent}%`),
                h("td", {}, row.location ?? ""),
              ),
            ),
          ),
        )
      : h("p", {}, "Nothing is running low."),
    h("ul", { class: "notes" }, ...reportNotes(report).map((note) => h("li", {}, note))),
  );
}

/** A complete HTML document for the download; the content is serialized from escaped DOM text. */
export function reportDocument(sheet: HTMLElement): string {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SpoolSync inventory report</title><style>${DOWNLOAD_STYLE}</style></head><body>${sheet.outerHTML}</body></html>\n`;
}

/**
 * The Inventory report: a button above the spool table opens a dialog with the report, which can
 * be printed or downloaded as HTML, Markdown or CSV. Nothing leaves the browser.
 */
export function wireInventoryReport(results: ReadonlyMap<SourceId, LoadResult>): { update(): void } {
  const trigger = h(
    "button",
    {
      type: "button",
      id: "open-inventory-report",
      class:
        "inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary",
      hidden: "",
    },
    "Inventory report",
  );
  const anchor = document.getElementById("download-combined");
  if (anchor) anchor.after(trigger);
  else document.getElementById("loaded-heading")?.after(trigger);

  let dialog: HTMLDialogElement | undefined;
  let preview: HTMLElement;
  let archivedBox: HTMLInputElement;
  let buttons: HTMLButtonElement[] = [];
  let opener: HTMLElement | null = null;

  const build = (): InventoryReport =>
    buildInventoryReport(
      uniqueSpools([...results.values()], loadMatchDecisions()),
      currentLowStockRule(),
      new Date(),
      { includeArchived: archivedBox.checked },
    );

  function refresh(): void {
    if (!dialog) return;
    try {
      const report = build();
      preview.replaceChildren(reportElement(report, currentFormat(), "inventory-report-preview"));
      for (const button of buttons) button.disabled = report.spools === 0 && report.archived === 0;
    } catch {
      preview.replaceChildren(
        h("p", { class: "text-sm text-error-text", role: "alert" }, "Could not build the report."),
      );
      for (const button of buttons) button.disabled = true;
    }
  }

  function save(extension: "html" | "md" | "csv"): void {
    try {
      const report = build();
      const format = currentFormat();
      const name = reportFilename(report, extension);
      if (extension === "md") download(name, reportMarkdown(report, format), "text/markdown");
      else if (extension === "csv")
        // A byte-order mark makes Excel read the file as UTF-8, so accented names survive.
        download(name, `\uFEFF${reportCsv(report, format)}`, "text/csv");
      else download(name, reportDocument(reportElement(report, format, "inventory-report")), "text/html");
    } catch {
      showToast("Could not create the report file", "error");
    }
  }

  function print(): void {
    let sheet: HTMLElement;
    try {
      sheet = reportElement(build(), currentFormat(), "inventory-report-sheet");
    } catch {
      showToast("Could not prepare the report for printing", "error");
      return;
    }
    document.getElementById("inventory-report-sheet")?.remove();
    document.body.append(sheet);
    document.body.classList.add("printing-report");
    const finish = () => {
      document.body.classList.remove("printing-report");
      sheet.remove();
    };
    window.addEventListener("afterprint", finish, { once: true });
    try {
      window.print();
    } catch {
      finish();
      showToast("Could not open the print dialog", "error");
    }
  }

  function ensure(): HTMLDialogElement {
    if (dialog) return dialog;
    preview = h("div", { class: "report-preview", tabindex: "0", role: "region", "aria-label": "Report preview" });
    archivedBox = h("input", { type: "checkbox", id: "report-archived", class: "size-4" });
    archivedBox.addEventListener("change", refresh);
    const action = (label: string, run: () => void) => {
      const button = h("button", { type: "button", class: BUTTON }, label);
      button.addEventListener("click", run);
      buttons.push(button);
      return button;
    };
    buttons = [];
    const close = h("button", { type: "button", class: BUTTON }, "Close");
    dialog = h(
      "dialog",
      {
        id: "inventory-report-dialog",
        closedby: "any",
        "aria-labelledby": "inventory-report-title",
        class: "m-auto w-[calc(100%-2rem)] max-w-3xl p-0",
      },
      h(
        "div",
        { class: "p-5 sm:p-6" },
        h("h2", { id: "inventory-report-title", class: "text-xl font-bold tracking-tight", tabindex: "-1" }, "Inventory report"),
        h(
          "p",
          { class: "mt-1 text-sm text-muted-foreground" },
          "Totals by material and brand, what is running low, and what your spools cost. Linked spools count once. Weights follow your display units.",
        ),
        h(
          "div",
          { class: "mt-3 flex flex-wrap items-center gap-2" },
          action("Print", print),
          action("Download HTML", () => save("html")),
          action("Download Markdown", () => save("md")),
          action("Download CSV", () => save("csv")),
        ),
        h(
          "label",
          { class: "mt-3 flex items-center gap-2 text-sm", for: "report-archived" },
          archivedBox,
          "Include archived spools",
        ),
        preview,
        h("div", { class: "mt-4 flex justify-end" }, close),
      ),
    );
    close.addEventListener("click", () => dialog?.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog?.close();
    });
    dialog.addEventListener("close", () => {
      const target = opener;
      opener = null;
      if (target?.isConnected) target.focus();
    });
    document.body.append(dialog);
    return dialog;
  }

  function open(): void {
    const element = ensure();
    if (element.open) return;
    const active = document.activeElement;
    opener = active instanceof HTMLElement && active !== document.body ? active : trigger;
    refresh();
    element.showModal();
    element.querySelector<HTMLElement>("#inventory-report-title")?.focus();
  }

  trigger.addEventListener("click", open);
  document.addEventListener(DISPLAY_CHANGED, () => {
    if (dialog?.open) refresh();
  });

  return {
    update() {
      trigger.hidden = results.size === 0;
      if (results.size === 0 && dialog?.open) dialog.close();
    },
  };
}
