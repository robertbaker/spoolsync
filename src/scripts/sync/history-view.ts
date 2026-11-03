import {
  clearSyncHistory,
  describeHistoryEntry,
  formatHistorySummary,
  readSyncHistory,
  recordSyncHistory,
  type SyncHistoryRecord,
} from "~/lib/browser/storage/sync-history";

import { h, showToast } from "../dom";
import { copyText } from "./clipboard";
import { button } from "./presentation";

/**
 * "History" under the Apply section: what was applied or downloaded and when, newest first, kept in
 * this browser. `record` is what the apply and download controllers call when they finish.
 */
export function createHistoryView(container: HTMLElement = document.createElement("div")) {
  let history = readSyncHistory();

  function render(): void {
    const copy = button("Copy summary", () => {
      void copyText(formatHistorySummary(history)).then((ok) =>
        showToast(ok ? "History summary copied" : "Could not copy the summary", ok ? "success" : "error"),
      );
    });
    const clear = button("Clear history", () => {
      if (!history.length) return;
      if (!confirm(`Forget ${history.length} recorded ${history.length === 1 ? "entry" : "entries"}?`))
        return;
      clearSyncHistory();
      history = [];
      render();
      showToast("History cleared", "info");
    });
    copy.disabled = history.length === 0;
    clear.disabled = history.length === 0;
    const items = [...history].reverse();
    container.replaceChildren(
      h(
        "div",
        { class: "flex flex-wrap items-center justify-between gap-2" },
        h("h3", { class: "text-lg", id: "sync-history-heading" }, "History"),
        h("div", { class: "flex flex-wrap gap-2" }, copy, clear),
      ),
      h(
        "p",
        { class: "mt-1 text-xs text-muted-foreground" },
        "The last 100 applies and downloads, kept in this browser. Only counts are saved, never spool details.",
      ),
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
        : h("p", { class: "mt-2 text-sm text-muted-foreground" }, "Nothing applied or downloaded yet."),
    );
  }

  function record(entry: SyncHistoryRecord): void {
    history = recordSyncHistory(entry);
    render();
  }

  return { render, record, container };
}
