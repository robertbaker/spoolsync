import { t, type MessageKey } from "~/lib/i18n";
import type { SourceTable } from "~/lib/import-mapper/convert";
import {
  MAP_FIELDS,
  WEIGHT_UNITS,
  headerSignature,
  isMapField,
  isWeightUnit,
  mappingForHeaders,
  suggestMapping,
  validateMapping,
  type ColumnMapping,
  type MapField,
  type MapWeightUnit,
  type MappingProblem,
} from "~/lib/import-mapper/fields";
import {
  forgetColumnMapping,
  readSavedMapping,
  saveColumnMapping,
} from "~/lib/import-mapper/store";

import { h, showToast } from "../dom";
import { download } from "../sync/presentation";
import { renderImportReport } from "./import-report-view";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const BUTTON =
  "rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";

/** Files the mapper can read: delimited text and JSON. Spreadsheets and archives are not offered. */
export const isMappableFile = (name: string): boolean => /\.(csv|tsv|txt|json)$/i.test(name.trim());

const fieldLabel = (field: MapField) => t(`map.field.${field}` as MessageKey);

/** The problem text for one validation result, in the page language. */
export function describeProblem(problem: MappingProblem): string {
  switch (problem.kind) {
    case "identity":
      return t("map.err.identity");
    case "missing":
      return t("map.err.missing", { header: problem.header ?? "" });
    case "duplicate":
      return t("map.err.duplicate", {
        header: problem.header ?? "",
        first: fieldLabel(problem.fields![0]),
        second: fieldLabel(problem.fields![1]),
      });
  }
}

/** `my sheet.csv` becomes `my_sheet-spoolman.csv`; anything unsafe in a filename is replaced. */
export function convertedFilename(sourceName: string): string {
  const base = sourceName
    .replace(/\.[^.]*$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 60);
  return `${base || "inventory"}-spoolman.csv`;
}

/**
 * The generic import column mapper. A file SpoolSync does not recognise is read here as a table;
 * the person matches its columns to SpoolSync fields, sees a dry run, and downloads a Spoolman
 * format CSV to drop on the page. The converted file is the only output: nothing is loaded, stored
 * as an inventory, or sent anywhere by this dialog.
 */
export async function openColumnMapper(file: File, opener: HTMLElement | null): Promise<void> {
  // Loaded on demand: the parser and converter are only needed when a file is not recognised.
  const { parseSourceTable, convertToSpoolmanCsv, sampleValues } =
    await import("~/lib/import-mapper/convert");
  const { dryRunConversion } = await import("~/lib/import-mapper/report");
  let table: SourceTable;
  try {
    if (file.size > MAX_FILE_BYTES) throw new Error("The file is larger than 20 MB.");
    table = parseSourceTable(await file.text());
  } catch (error) {
    showToast(
      t("map.readError", { message: error instanceof Error ? error.message : String(error) }),
      "error",
      6000,
    );
    return;
  }

  const signature = headerSignature(table.headers);
  const saved = readSavedMapping(signature);
  const savedMapping = saved ? mappingForHeaders(saved.mapping, table.headers) : {};
  const restored = Object.keys(savedMapping).length > 0;
  const mapping: ColumnMapping = restored
    ? savedMapping
    : suggestMapping(table.headers, table.rows);
  let unit: MapWeightUnit = saved?.unit ?? "g";

  const title = h(
    "h2",
    { id: "mapper-title", class: "text-xl font-bold tracking-tight", tabindex: "-1" },
    t("map.title"),
  );
  const messages = h("div", {
    id: "mapper-messages",
    class: "mt-3 text-sm",
    "aria-live": "polite",
  });
  const dry = h("div", { id: "mapper-dry-run", class: "mt-3", "aria-live": "polite" });
  const downloadButton = h(
    "button",
    { type: "button", class: PRIMARY, id: "mapper-download" },
    t("map.download"),
  );
  const cancel = h("button", { type: "button", class: BUTTON }, t("map.cancel"));
  const remember = h("input", { type: "checkbox", id: "mapper-remember", class: "size-4" });
  remember.checked = true;

  const selects = new Map<string, HTMLSelectElement>();
  const headerRows = table.headers.map((header, index) => {
    const select = h(
      "select",
      { id: `mapper-field-${index}`, class: "field-input mt-0 w-full py-1.5 text-sm" },
      h("option", { value: "" }, t("map.ignore")),
      ...MAP_FIELDS.map((field) => h("option", { value: field }, fieldLabel(field))),
    );
    select.value = MAP_FIELDS.find((field) => mapping[field] === header) ?? "";
    select.addEventListener("change", () => {
      for (const field of MAP_FIELDS) if (mapping[field] === header) delete mapping[field];
      if (isMapField(select.value)) {
        // A field takes one column, so the column that had it goes back to "ignore".
        const previous = mapping[select.value];
        if (previous !== undefined) {
          const other = selects.get(previous);
          if (other) other.value = "";
        }
        mapping[select.value] = header;
      }
      schedule();
    });
    selects.set(header, select);
    const samples = sampleValues(table, header);
    return h(
      "tr",
      { class: "border-t align-top" },
      h(
        "th",
        { scope: "row", class: "py-2 pr-3 text-left font-medium break-words" },
        h("label", { for: `mapper-field-${index}` }, header),
      ),
      h("td", { class: "mapper-sample py-2 pr-3" }, samples.length ? samples.join(" · ") : "—"),
      h("td", { class: "py-2" }, select),
    );
  });

  const unitSelect = h(
    "select",
    { id: "mapper-unit", class: "field-input mt-0 w-auto py-1.5 text-sm" },
    ...WEIGHT_UNITS.map((value) => h("option", { value }, t(`map.unit.${value}` as MessageKey))),
  );
  unitSelect.value = unit;
  unitSelect.addEventListener("change", () => {
    if (isWeightUnit(unitSelect.value)) unit = unitSelect.value;
    schedule();
  });

  const dialog = h(
    "dialog",
    {
      id: "mapper-dialog",
      closedby: "any",
      "aria-labelledby": "mapper-title",
      class:
        "m-auto w-[calc(100%-2rem)] max-w-3xl rounded-2xl border bg-background p-0 text-foreground shadow-layered backdrop:bg-black/25 backdrop:backdrop-blur-xs",
    },
    h(
      "div",
      { class: "max-h-[85vh] overflow-y-auto p-6" },
      title,
      h("p", { class: "mt-1 text-sm text-muted-foreground" }, t("map.intro")),
      h(
        "p",
        { class: "mt-2 text-sm font-medium" },
        t("map.fileInfo", {
          file: file.name,
          rows: table.rows.length,
          columns: table.headers.length,
        }),
      ),
      h(
        "p",
        { class: "mt-1 text-xs text-muted-foreground" },
        restored ? t("map.restored") : t("map.suggested"),
      ),
      h(
        "div",
        { class: "mt-3 overflow-x-auto" },
        h(
          "table",
          { class: "w-full text-sm" },
          h("caption", { class: "sr-only" }, t("map.title")),
          h(
            "thead",
            { class: "text-left text-xs text-muted-foreground" },
            h(
              "tr",
              {},
              h("th", { scope: "col", class: "pb-1 pr-3 font-medium" }, t("map.column")),
              h("th", { scope: "col", class: "pb-1 pr-3 font-medium" }, t("map.sample")),
              h("th", { scope: "col", class: "pb-1 font-medium" }, t("map.field")),
            ),
          ),
          h("tbody", {}, ...headerRows),
        ),
      ),
      h(
        "div",
        { class: "mt-4 flex flex-wrap items-center gap-x-6 gap-y-2" },
        h(
          "label",
          { class: "flex items-center gap-2 text-sm", for: "mapper-unit" },
          t("map.unit"),
          unitSelect,
        ),
        h(
          "label",
          { class: "flex items-center gap-2 text-sm", for: "mapper-remember" },
          remember,
          t("map.remember"),
        ),
      ),
      messages,
      dry,
      h("div", { class: "mt-5 flex flex-wrap justify-end gap-2" }, cancel, downloadButton),
    ),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest: { csv: string } | null = null;

  function renderMessages(problems: MappingProblem[], notes: string[]): void {
    messages.replaceChildren(
      ...(problems.length
        ? [
            h("p", { class: "font-semibold text-error" }, t("map.problems")),
            h(
              "ul",
              { class: "list-disc pl-5 text-error" },
              ...problems.map((problem) => h("li", {}, describeProblem(problem))),
            ),
          ]
        : []),
      ...(notes.length
        ? [
            h("p", { class: "mt-2 font-semibold" }, t("map.warnings")),
            h(
              "ul",
              { class: "list-disc pl-5 text-muted-foreground" },
              ...notes.map((note) => h("li", {}, note)),
            ),
          ]
        : []),
    );
  }

  function recompute(): void {
    latest = null;
    const check = validateMapping(mapping, table.headers);
    renderMessages(
      check.problems,
      check.notes.map((note) =>
        t(note === "no-weight" ? "map.warn.noWeight" : "map.warn.bothWeights"),
      ),
    );
    if (check.problems.length) {
      dry.replaceChildren();
      downloadButton.disabled = true;
      return;
    }
    try {
      const conversion = convertToSpoolmanCsv(table, mapping, { weightUnit: unit });
      const { report } = dryRunConversion(conversion, file.name);
      const view = renderImportReport(report, file.name, {
        lead: t("map.dry.lead", { loaded: report.spoolsLoaded, rows: report.rowsRead }),
        summaryLabel: t("map.dry.title"),
      });
      view.open = true;
      dry.replaceChildren(view);
      latest = conversion;
      downloadButton.disabled = conversion.spoolCount === 0;
    } catch (error) {
      dry.replaceChildren(
        h(
          "p",
          { class: "text-sm text-error" },
          t("map.readError", { message: error instanceof Error ? error.message : String(error) }),
        ),
      );
      downloadButton.disabled = true;
    }
  }

  // Large files take a moment to convert, so a burst of changes converts once.
  function schedule(): void {
    downloadButton.disabled = true;
    dry.replaceChildren(h("p", { class: "text-sm text-muted-foreground" }, t("map.dry.checking")));
    clearTimeout(timer);
    timer = setTimeout(recompute, table.rows.length > 2000 ? 250 : 60);
  }

  downloadButton.addEventListener("click", () => {
    if (!latest || downloadButton.disabled) return;
    if (remember.checked) saveColumnMapping(signature, mapping, unit);
    else forgetColumnMapping(signature);
    // A byte-order mark makes Excel read the file as UTF-8, so accented names survive.
    download(convertedFilename(file.name), `﻿${latest.csv}`, "text/csv");
    showToast(t("map.downloaded"), "success", 5000);
    dialog.close();
  });
  cancel.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    clearTimeout(timer);
    dialog.remove();
    if (opener?.isConnected) opener.focus();
  });

  document.body.append(dialog);
  recompute();
  dialog.showModal();
  title.focus();
}
