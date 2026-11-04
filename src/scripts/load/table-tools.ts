import type { CommonSpool } from "@spoolsync/core/core/model";

import { LOCALE_CHANGED, getLocale, t, type MessageKey } from "~/lib/i18n";
import { REQUIRED_COLUMNS, TABLE_COLUMNS, type TableColumn } from "~/lib/table-columns";
import { asLoadResult, viewFilename, viewJson } from "~/lib/table-export";

import { h, showToast } from "../dom";
import { download } from "../sync/presentation";

/** What the tools need from the inventory table. */
export interface ToolsTable {
  getColumns(): readonly TableColumn[];
  setColumns(columns: readonly string[]): unknown;
  /** The spools in the table now, after every filter, in table order. */
  visibleSpools(): readonly CommonSpool[];
}

const BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary";

/**
 * The tools above the inventory table: a column chooser whose choice is remembered, and exports of
 * the spools currently shown (CSV or JSON). Nothing here changes the loaded inventories.
 */
export function wireTableTools(
  root: HTMLElement,
  table: ToolsTable,
  hasData: () => boolean,
  now: () => Date = () => new Date(),
) {
  let builtFor = "";

  function exportView(format: "csv" | "json"): void {
    const spools = table.visibleSpools();
    if (!spools.length) {
      showToast(t("table.export.none"), "warning");
      return;
    }
    const stamp = now();
    void (async () => {
      try {
        if (format === "csv") {
          const { combinedInventoryCsv } = await import("@spoolsync/core/workflow");
          const { csv } = combinedInventoryCsv([asLoadResult(spools, stamp.toISOString())]);
          // A byte-order mark makes Excel read the file as UTF-8, so accented names survive.
          download(viewFilename("csv", stamp), `﻿${csv}`, "text/csv");
        } else {
          download(viewFilename("json", stamp), viewJson(spools, stamp.toISOString()), "application/json");
        }
        showToast(t("table.export.done", { count: spools.length }), "success");
      } catch {
        showToast(t("table.export.none"), "error");
      }
    })();
  }

  function chooser(): HTMLElement {
    const chosen = new Set(table.getColumns());
    const details = h("details", { class: "column-chooser", id: "column-chooser" });
    const summary = h("summary", { class: `${BUTTON} cursor-pointer list-none` }, t("table.columns"));
    const panel = h("div", {
      class: "column-chooser__panel",
      role: "group",
      "aria-label": t("table.columns.aria"),
    });
    panel.append(h("p", { class: "text-xs text-muted-foreground" }, t("table.columns.hint")));
    for (const column of TABLE_COLUMNS) {
      const required = REQUIRED_COLUMNS.includes(column);
      const input = h("input", {
        type: "checkbox",
        id: `column-${column}`,
        class: "size-4",
        value: column,
      });
      input.checked = chosen.has(column);
      input.disabled = required;
      input.addEventListener("change", () => {
        const next = TABLE_COLUMNS.filter((candidate) => {
          const box = panel.querySelector<HTMLInputElement>(`#column-${candidate}`);
          return box?.checked || REQUIRED_COLUMNS.includes(candidate);
        });
        table.setColumns(next);
        // The checkboxes already show the choice; keep them (and keyboard focus) in place.
        builtFor = signature();
      });
      panel.append(
        h(
          "label",
          { class: "column-chooser__option", for: `column-${column}` },
          input,
          t(`col.${column}` as MessageKey),
        ),
      );
    }
    const reset = h("button", { type: "button", class: BUTTON }, t("table.columns.reset"));
    reset.addEventListener("click", () => {
      table.setColumns(TABLE_COLUMNS);
      for (const box of panel.querySelectorAll<HTMLInputElement>("input")) box.checked = true;
      builtFor = signature();
    });
    panel.append(reset);
    details.append(summary, panel);
    details.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !details.open) return;
      event.stopPropagation();
      details.open = false;
      summary.focus();
    });
    return details;
  }

  const signature = () => `${getLocale()}|${table.getColumns().join(",")}`;

  function build(): void {
    const wasOpen = root.querySelector<HTMLDetailsElement>("#column-chooser")?.open ?? false;
    const csv = h("button", { type: "button", id: "export-view-csv", class: BUTTON, "aria-describedby": "export-view-hint" }, t("table.export.csv"));
    const json = h("button", { type: "button", id: "export-view-json", class: BUTTON, "aria-describedby": "export-view-hint" }, t("table.export.json"));
    csv.addEventListener("click", () => exportView("csv"));
    json.addEventListener("click", () => exportView("json"));
    const columns = chooser();
    columns.open = wasOpen;
    root.replaceChildren(
      columns,
      csv,
      json,
      h("span", { id: "export-view-hint", class: "sr-only" }, t("table.export.hint")),
    );
    builtFor = signature();
  }

  // Close the chooser when the visitor clicks elsewhere, like a menu.
  document.addEventListener("click", (event) => {
    const details = root.querySelector<HTMLDetailsElement>("#column-chooser");
    if (details?.open && event.target instanceof Node && !details.contains(event.target))
      details.open = false;
  });
  document.addEventListener(LOCALE_CHANGED, () => {
    if (!root.hidden) build();
  });

  return {
    update(): void {
      root.hidden = !hasData();
      if (root.hidden) return;
      if (builtFor !== signature()) build();
    },
  };
}
