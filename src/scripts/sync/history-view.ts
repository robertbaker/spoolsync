import { SOURCE_IDS, SOURCE_LABELS } from "@spoolsync/core/core/model";

import {
  clearSyncHistory,
  describeHistoryEntry,
  filterSyncHistory,
  formatHistorySummary,
  readSyncHistory,
  recordSyncHistory,
  syncHistoryFilename,
  syncHistoryJson,
  type SyncHistoryFilter,
  type SyncHistoryRecord,
} from "~/lib/browser/storage/sync-history";

import { confirmDialog } from "../confirm-dialog";
import { h, showToast } from "../dom";
import { copyText } from "./clipboard";
import { button, download } from "./presentation";

const SELECT = "field-input mt-0 w-auto py-1 text-xs";

/**
 * "History" under the Apply section: what was applied or downloaded and when, newest first, kept in
 * this browser. `record` is what the apply and download controllers call when they finish. The list
 * can be narrowed by service, method, result and words, and what is shown can be copied or exported
 * as JSON (counts and short errors only, as stored).
 */
export function createHistoryView(container: HTMLElement = document.createElement("div")) {
  let history = readSyncHistory();
  const filter: Required<SyncHistoryFilter> = {
    source: "all",
    via: "all",
    outcome: "all",
    query: "",
  };

  const labelled = (text: string, control: HTMLElement) =>
    h("label", { class: "flex items-center gap-1.5 text-xs text-muted-foreground" }, text, control);
  const source = h(
    "select",
    { id: "history-filter-source", class: SELECT },
    h("option", { value: "all" }, "All services"),
    ...SOURCE_IDS.map((id) => h("option", { value: id }, SOURCE_LABELS[id])),
  );
  const via = h(
    "select",
    { id: "history-filter-via", class: SELECT },
    h("option", { value: "all" }, "Any method"),
    h("option", { value: "api" }, "API writes"),
    h("option", { value: "download" }, "Downloads"),
  );
  const outcome = h(
    "select",
    { id: "history-filter-outcome", class: SELECT },
    h("option", { value: "all" }, "Any result"),
    h("option", { value: "failed" }, "With failures"),
    h("option", { value: "succeeded" }, "Without failures"),
  );
  const query = h("input", {
    id: "history-filter-query",
    type: "search",
    class: "field-input mt-0 w-44 py-1 text-xs",
    placeholder: "Search history",
    "aria-label": "Search history",
    autocomplete: "off",
  });
  const copy = button("Copy summary", () => {
    void copyText(formatHistorySummary(shown())).then((ok) =>
      showToast(
        ok ? "History summary copied" : "Could not copy the summary",
        ok ? "success" : "error",
      ),
    );
  });
  const exportJson = button("Export JSON", () => {
    try {
      download(syncHistoryFilename(new Date()), syncHistoryJson(shown()), "application/json");
    } catch {
      showToast("Could not create the history file", "error");
    }
  });
  exportJson.id = "sync-history-export";
  const clear = button("Clear history", async () => {
    if (!history.length) return;
    const total = history.length;
    const confirmed = await confirmDialog({
      title: `Forget ${total} recorded ${total === 1 ? "entry" : "entries"}?`,
      body: "The sync history is removed from this browser. This cannot be undone.",
      confirmLabel: "Forget history",
      tone: "danger",
    });
    if (!confirmed) return;
    clearSyncHistory();
    history = [];
    render();
    showToast("History cleared", "info");
  });
  const count = h("p", {
    class: "mt-1 text-xs text-muted-foreground",
    role: "status",
    "aria-live": "polite",
  });
  const list = h("div", {});
  const controls = h(
    "div",
    {
      class: "mt-2 flex flex-wrap items-center gap-2",
      role: "group",
      "aria-label": "Filter the history",
    },
    labelled("Service", source),
    labelled("Method", via),
    labelled("Result", outcome),
    query,
  );

  const shown = () => filterSyncHistory(history, filter);

  function onFilter(): void {
    filter.source = source.value as typeof filter.source;
    filter.via = via.value as typeof filter.via;
    filter.outcome = outcome.value as typeof filter.outcome;
    filter.query = query.value;
    render();
  }
  for (const control of [source, via, outcome]) control.addEventListener("change", onFilter);
  query.addEventListener("input", onFilter);

  container.replaceChildren(
    h(
      "div",
      { class: "flex flex-wrap items-center justify-between gap-2" },
      h("h3", { class: "text-lg", id: "sync-history-heading" }, "History"),
      h("div", { class: "flex flex-wrap gap-2" }, copy, exportJson, clear),
    ),
    h(
      "p",
      { class: "mt-1 text-xs text-muted-foreground" },
      "The last 100 applies and downloads, kept in this browser. Only counts are saved, never spool details.",
    ),
    controls,
    count,
    list,
  );

  function render(): void {
    const items = shown().toReversed();
    const filtering =
      filter.source !== "all" ||
      filter.via !== "all" ||
      filter.outcome !== "all" ||
      filter.query.trim() !== "";
    for (const control of [copy, exportJson]) control.disabled = items.length === 0;
    clear.disabled = history.length === 0;
    controls.hidden = history.length === 0;
    count.textContent = !history.length
      ? ""
      : filtering
        ? `Showing ${items.length} of ${history.length} ${history.length === 1 ? "entry" : "entries"}.`
        : "";
    list.replaceChildren(
      items.length
        ? h(
            "ul",
            {
              class: "mt-2 max-h-64 list-none overflow-y-auto pl-0 text-sm",
              "aria-labelledby": "sync-history-heading",
            },
            ...items.map((entry) => {
              const time = h("time", { datetime: entry.at, class: "text-muted-foreground" });
              time.textContent = new Date(entry.at).toLocaleString();
              return h(
                "li",
                {
                  class: `border-b py-1.5 last:border-b-0 ${entry.failed ? "font-medium" : ""}`,
                  "data-history-entry": entry.via,
                },
                time,
                h("span", { class: "block sm:inline sm:ml-2" }, describeHistoryEntry(entry)),
              );
            }),
          )
        : history.length
          ? h(
              "div",
              { class: "empty-state mt-2" },
              h("strong", {}, "No entries match"),
              h("p", {}, "Change the filters or clear the search to see the rest."),
            )
          : h(
              "p",
              { class: "mt-2 text-sm text-muted-foreground" },
              "Nothing applied or downloaded yet.",
            ),
    );
  }

  function record(entry: SyncHistoryRecord): void {
    history = recordSyncHistory(entry);
    render();
  }

  return { render, record, container };
}
