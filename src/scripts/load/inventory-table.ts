import {
  SOURCE_LABELS,
  type CommonSpool,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import { isRunningLow } from "@spoolsync/core/core/stock";

import { byId, h } from "../dom";

export type SortKey = "source" | "vendor" | "material" | "name" | "remaining" | "location";
type Sort = { key: SortKey; direction: "asc" | "desc" } | null;

/** Clicking a column sorts it ascending, then descending, then returns to the loaded order. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current?.key !== key) return { key, direction: "asc" };
  return current.direction === "asc" ? { key, direction: "desc" } : null;
}

/** A sorted copy; empty values always sort last, whichever direction is chosen. */
export function sortSpools(spools: CommonSpool[], sort: Sort): CommonSpool[] {
  if (!sort) return spools;
  const value = (spool: CommonSpool): string | number | null => {
    switch (sort.key) {
      case "source":
        return SOURCE_LABELS[spool.source];
      case "remaining":
        return spool.remainingWeight;
      default:
        return spool[sort.key];
    }
  };
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...spools].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null || left === "") return right === null || right === "" ? 0 : 1;
    if (right === null || right === "") return -1;
    const order =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), undefined, {
            numeric: true,
            sensitivity: "base",
          });
    return order * direction;
  });
}

export function createInventoryTable(results: ReadonlyMap<SourceId, LoadResult>) {
  function swatches(colors: string[]): HTMLElement {
    if (!colors.length) return h("span", { class: "text-muted-foreground" }, "—");
    return h(
      "span",
      { class: "flex gap-1", title: colors.map((c) => `#${c}`).join(", ") },
      ...colors.slice(0, 4).map((color) => {
        const swatch = h("span", {
          class: "filament-swatch inline-block size-4 rounded-full border",
        });
        swatch.style.backgroundColor = `#${color}`;
        return swatch;
      }),
    );
  }

  function weight(spool: CommonSpool): string {
    const remaining = spool.remainingWeight === null ? "?" : Math.round(spool.remainingWeight);
    const initial = spool.initialWeight === null ? "?" : Math.round(spool.initialWeight);
    return `${remaining} / ${initial} g`;
  }

  function links(spool: CommonSpool): string {
    const {
      spoolmanId,
      spoolstockShortId,
      spoolioId,
      tigertagUid,
      threeDfpId,
      bambuddyId,
      filameterId,
      filadexId,
      filamentdbSerial,
      spoolmasterId,
      spoolhoarderId,
      spoolappId,
      spoolkeepId,
    } = spool.crossIds;
    const parts = [];
    if (spool.source !== "spoolman" && spoolmanId !== undefined)
      parts.push(`Spoolman #${spoolmanId}`);
    if (spool.source !== "spoolstock" && spoolstockShortId)
      parts.push(`Spoolstock ${spoolstockShortId}`);
    if (spool.source !== "spoolio" && spoolioId) parts.push(`Spoolio ${spoolioId.slice(0, 8)}`);
    if (spool.source !== "tigertag" && tigertagUid)
      parts.push(`TigerTag ${tigertagUid.slice(0, 14)}`);
    if (spool.source !== "threeDfp" && threeDfpId) parts.push(`3DFP ${threeDfpId.slice(0, 8)}`);
    if (spool.source !== "bambuddy" && bambuddyId !== undefined)
      parts.push(`Bambuddy #${bambuddyId}`);
    if (spool.source !== "filameter" && filameterId)
      parts.push(`FilaMeter ${filameterId.slice(0, 8)}`);
    if (spool.source !== "filadex" && filadexId) parts.push(`Filadex ${filadexId.slice(0, 8)}`);
    if (spool.source !== "filamentdb" && filamentdbSerial)
      parts.push(`FilamentDB ${filamentdbSerial.slice(0, 8)}`);
    if (spool.source !== "spoolmaster" && spoolmasterId) parts.push(`SpoolMaster ${spoolmasterId}`);
    if (spool.source !== "spoolhoarder" && spoolhoarderId)
      parts.push(`Spool Hoarder ${spoolhoarderId.slice(0, 8)}`);
    if (spool.source !== "spoolapp" && spoolappId) parts.push(`Spool ${spoolappId.slice(0, 8)}`);
    if (spool.source !== "spoolkeep" && spoolkeepId)
      parts.push(`SpoolKeep ${spoolkeepId.slice(0, 8)}`);
    return parts.join(", ") || "—";
  }

  let searchQuery = "";
  let lowOnly = false;
  let sort: { key: SortKey; direction: "asc" | "desc" } | null = null;
  const lowButton = document.getElementById("low-only");
  lowButton?.addEventListener("click", () => {
    lowOnly = !lowOnly;
    renderTable();
  });
  const searchWrap = document.getElementById("loaded-filter-wrap");
  const searchInput = document.getElementById("spool-search-input") as HTMLInputElement | null;

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderTable();
    });
  }

  function renderTable(): void {
    const all = [...results.values()].flatMap((result) => result.spools);
    const container = byId("loaded-table");
    const counts = [...results.values()].map(
      (r) => `${SOURCE_LABELS[r.source]}: ${r.spools.length}`,
    );

    if (searchWrap) {
      searchWrap.hidden = all.length === 0;
    }

    if (!all.length) {
      byId("loaded-summary").textContent = "";
      container.replaceChildren(
        h(
          "p",
          { class: "rounded-lg border border-dashed p-8 text-center text-muted-foreground" },
          "Nothing loaded yet.",
        ),
      );
      return;
    }

    const lowCount = all.filter(isRunningLow).length;
    if (lowCount === 0) lowOnly = false;
    const reorderButton = document.getElementById("copy-reorder");
    if (reorderButton) reorderButton.hidden = lowCount === 0;
    if (lowButton) {
      lowButton.hidden = lowCount === 0;
      lowButton.textContent = `Running low (${lowCount})`;
      lowButton.setAttribute("aria-pressed", String(lowOnly));
    }
    const matching = searchQuery
      ? all.filter((s) => {
          const text = [s.vendor, s.material, s.name, s.location, s.sourceId, ...s.colors]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return text.includes(searchQuery);
        })
      : all;
    const filtered = sortSpools(lowOnly ? matching.filter(isRunningLow) : matching, sort);

    byId("loaded-summary").textContent =
      searchQuery || lowOnly
        ? `Showing ${filtered.length} of ${all.length} spools (${counts.join(" · ")})`
        : counts.join(" · ");

    if ((searchQuery || lowOnly) && !filtered.length) {
      container.replaceChildren(
        h(
          "p",
          { class: "rounded-lg border border-dashed p-8 text-center text-muted-foreground" },
          searchQuery ? `No spools matching "${searchQuery}".` : "No spools are running low.",
        ),
      );
      return;
    }

    const headers: Array<{ label: string; key?: SortKey }> = [
      { label: "Source", key: "source" },
      { label: "ID" },
      { label: "Brand", key: "vendor" },
      { label: "Material", key: "material" },
      { label: "Name", key: "name" },
      { label: "Color" },
      { label: "Remaining", key: "remaining" },
      { label: "Location", key: "location" },
      { label: "Linked to" },
    ];
    const rows = filtered.map((spool) =>
      h(
        "tr",
        { class: spool.archived ? "text-muted-foreground/70" : "" },
        h("td", { class: "whitespace-nowrap font-medium" }, SOURCE_LABELS[spool.source]),
        h(
          "td",
          { class: "max-w-40 truncate font-mono text-xs", title: spool.sourceId },
          spool.sourceId,
        ),
        h("td", {}, spool.vendor ?? "—"),
        h("td", {}, spool.material ?? "—"),
        h("td", {}, spool.name ?? "—", spool.archived ? " (archived)" : ""),
        h("td", {}, swatches(spool.colors)),
        h(
          "td",
          { class: "whitespace-nowrap" },
          weight(spool),
          isRunningLow(spool)
            ? h(
                "span",
                {
                  class:
                    "ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-text",
                },
                "Low",
              )
            : null,
        ),
        h("td", {}, spool.location ?? "—"),
        h("td", { class: "text-xs" }, links(spool)),
      ),
    );

    container.replaceChildren(
      h(
        "div",
        {
          class: "spool-table-wrapper",
          tabindex: "0",
          role: "region",
          "aria-label": "Loaded spools table (scrollable)",
        },
        h(
          "table",
          {},
          h(
            "thead",
            {},
            h(
              "tr",
              {},
              ...headers.map((header) => {
                if (!header.key) return h("th", { scope: "col" }, header.label);
                const active = sort?.key === header.key ? sort.direction : null;
                const button = h(
                  "button",
                  {
                    type: "button",
                    class:
                      "inline-flex items-center gap-1 font-inherit uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary",
                  },
                  header.label,
                  h(
                    "span",
                    { "aria-hidden": "true", class: "text-[0.7em]" },
                    active === "asc" ? "▲" : active === "desc" ? "▼" : "↕",
                  ),
                );
                button.addEventListener("click", () => {
                  sort = nextSort(sort, header.key!);
                  renderTable();
                  // The table is redrawn, so hand keyboard focus to the same column's button.
                  const next = [...container.querySelectorAll("th button")].find((candidate) =>
                    candidate.textContent?.startsWith(header.label),
                  );
                  (next as HTMLElement | undefined)?.focus();
                });
                return h(
                  "th",
                  {
                    scope: "col",
                    "aria-sort":
                      active === "asc" ? "ascending" : active === "desc" ? "descending" : "none",
                  },
                  button,
                );
              }),
            ),
          ),
          h("tbody", {}, ...rows),
        ),
      ),
    );
  }

  return renderTable;
}
