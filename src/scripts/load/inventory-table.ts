import {
  SOURCE_LABELS,
  type CommonSpool,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import { isRunningLow } from "@spoolsync/core/core/stock";
import { HEALTH_ISSUES, spoolKey } from "@spoolsync/core/workflow";

import { t, type MessageKey } from "~/lib/i18n";
import { currentLowStockRule } from "~/lib/low-stock";
import { readPreferences, updatePreferences, type SortKey } from "~/lib/preferences";
import {
  EMPTY_VIEW,
  groupSpools,
  matchesRange,
  sanitizeSettings,
  type ViewSettings,
} from "~/lib/saved-views";
import { readColumns, saveColumns, type TableColumn } from "~/lib/table-columns";
import { WINDOW_STEP, nextLimit, windowSections } from "~/lib/table-window";

import { buttonClass, byId, h, setChildren } from "../dom";
import type { InsightFilter, LoadInsights } from "./insights";
import { spoolRow } from "./inventory-row";

const NUMERIC_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

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
  return spools.toSorted((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null || left === "") return right === null || right === "" ? 0 : 1;
    if (right === null || right === "") return -1;
    const order =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : NUMERIC_COLLATOR.compare(String(left), String(right));
    return order * direction;
  });
}

/** The chip and empty-state wording for a filter, in the page language. */
export const filterLabel = (filter: InsightFilter): string =>
  filter === "watched" ? "Watched" : t(`health.factor.${filter}` as MessageKey);

/** Table columns with their translated headings and, where sortable, the sort key. */
const COLUMN_SORT: Partial<Record<TableColumn, SortKey>> = {
  source: "source",
  vendor: "vendor",
  material: "material",
  name: "name",
  remaining: "remaining",
  location: "location",
};

export function createInventoryTable(
  results: ReadonlyMap<SourceId, LoadResult>,
  insights?: LoadInsights,
  onWatchChange?: () => void,
) {
  const searchCache = new WeakMap<CommonSpool, string>();
  const spoolSearchText = (s: CommonSpool): string => {
    let text = searchCache.get(s);
    if (text === undefined) {
      text = [s.vendor, s.material, s.name, s.location, s.sourceId, ...s.colors]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      searchCache.set(s, text);
    }
    return text;
  };

  let searchQuery = "";
  // The columns shown, restored from the last visit. The name column always stays.
  let columns: TableColumn[] = readColumns();
  // Rows drawn so far; reset to one window whenever the filters, sort or grouping change.
  let rowLimit = WINDOW_STEP;
  let windowSignature = "";
  /** Index of the row to focus after the next draw, set when "Show more" adds rows. */
  let focusAfterDraw: number | null = null;
  const windowStatus = document.createElement("p");
  windowStatus.className = "sr-only";
  windowStatus.setAttribute("role", "status");
  windowStatus.setAttribute("aria-live", "polite");
  document.getElementById("loaded-table")?.after(windowStatus);
  /** The spools the table is showing now, in table order, for features such as label printing. */
  let visible: CommonSpool[] = [];
  // Restored from the last visit; the table drops them again when they no longer apply.
  const saved = readPreferences();
  let lowOnly = saved.lowOnly ?? false;
  let sort: { key: SortKey; direction: "asc" | "desc" } | null = saved.tableSort ?? null;
  const lowButton = document.getElementById("low-only");
  lowButton?.addEventListener("click", () => {
    lowOnly = !lowOnly;
    updatePreferences({ lowOnly: lowOnly || undefined });
    renderTable();
  });
  // Part of a saved view: material and weight range filters and grouping (not remembered alone).
  let extra = {
    material: EMPTY_VIEW.material,
    minGrams: EMPTY_VIEW.minGrams,
    maxGrams: EMPTY_VIEW.maxGrams,
    group: EMPTY_VIEW.group,
  };
  const renderListeners = new Set<() => void>();
  const searchWrap = document.getElementById("loaded-filter-wrap");
  const searchInput = document.getElementById("spool-search-input") as HTMLInputElement | null;

  if (searchInput) {
    let frameId: number | null = null;
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      if (typeof requestAnimationFrame === "function") {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = requestAnimationFrame(() => {
          frameId = null;
          renderTable();
        });
      } else {
        renderTable();
      }
    });
  }

  /** One-click filter chips: duplicates, watched spools, and each health check that found something. */
  function renderChips(): void {
    const container = document.getElementById("insight-chips");
    if (!container || !insights) return;
    const filters: InsightFilter[] = [
      "duplicates",
      "watched",
      "missing-price",
      ...HEALTH_ISSUES.filter((issue) => insights.health.counts[issue] > 0),
    ];
    const shown = filters.filter(
      (filter) => insights.countFor(filter) > 0 || insights.activeFilter === filter,
    );
    container.hidden = shown.length === 0;
    container.replaceChildren(
      h("span", { class: "text-xs font-medium text-muted-foreground" }, "Show only:"),
      ...shown.map((filter) => {
        const pressed = insights.activeFilter === filter;
        const chip = h(
          "button",
          {
            type: "button",
            "aria-pressed": String(pressed),
            "data-filter": filter,
            class:
              "rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground",
          },
          `${filterLabel(filter)} (${insights.countFor(filter)})`,
        );
        chip.addEventListener("click", () => {
          insights.setFilter(pressed ? null : filter);
          container.querySelector<HTMLElement>(`[data-filter="${filter}"]`)?.focus();
        });
        return chip;
      }),
    );
  }

  function renderTable(): void {
    draw();
    for (const listener of renderListeners) listener();
  }

  /** The table's filters, sort and grouping as one saved-view value. */
  function getViewSettings(): ViewSettings {
    return sanitizeSettings({
      search: searchQuery,
      lowOnly,
      insight: insights?.activeFilter ?? null,
      sort,
      ...extra,
    });
  }

  /** Replaces the table's filters, sort and grouping, then redraws once. */
  function applyViewSettings(next: ViewSettings): void {
    const settings = sanitizeSettings(next);
    searchQuery = settings.search;
    if (searchInput) searchInput.value = settings.search;
    lowOnly = settings.lowOnly;
    sort = settings.sort;
    updatePreferences({ lowOnly: lowOnly || undefined, tableSort: sort ?? undefined });
    extra = {
      material: settings.material,
      minGrams: settings.minGrams,
      maxGrams: settings.maxGrams,
      group: settings.group,
    };
    // A check that found nothing in the current inventory is dropped, as the table already does.
    const filter = settings.insight as InsightFilter | null;
    const usable = filter !== null && insights !== undefined && insights.countFor(filter) > 0;
    // Setting the filter redraws through its listener; the redraw below covers the other cases.
    insights?.setFilter(usable ? filter : null);
    renderTable();
  }

  function draw(): void {
    renderChips();
    windowStatus.textContent = "";
    const all = [...results.values()].flatMap((result) => result.spools);
    visible = [];
    const container = byId("loaded-table");
    const counts = [...results.values()].map(
      (r) => `${SOURCE_LABELS[r.source]}: ${r.spools.length}`,
    );

    if (searchWrap) {
      searchWrap.hidden = all.length === 0;
    }

    if (!all.length) {
      byId("loaded-summary").textContent = "";
      // Hand the visitor the two ways forward instead of a dead end.
      const choose = h(
        "button",
        { type: "button", class: buttonClass({ variant: "solid", color: "primary" }) },
        "Choose files",
      );
      choose.addEventListener("click", () => document.getElementById("smart-file")?.click());
      const sample = h("button", { type: "button", class: buttonClass() }, "Try sample data");
      sample.addEventListener("click", () => document.getElementById("try-sample")?.click());
      container.replaceChildren(
        h(
          "div",
          { class: "empty-state" },
          h("p", { class: "font-medium text-foreground" }, "Nothing loaded yet."),
          h(
            "p",
            { class: "text-sm text-muted-foreground" },
            "Pick export files or connect a service above to see your spools here.",
          ),
          h("div", { class: "mt-3 flex flex-wrap justify-center gap-2" }, choose, sample),
        ),
      );
      return;
    }

    const rule = currentLowStockRule();
    const isLow = (spool: CommonSpool) => isRunningLow(spool, rule);
    const lowCount = all.filter(isLow).length;
    if (lowCount === 0) lowOnly = false;
    const reorderButton = document.getElementById("copy-reorder");
    if (reorderButton) reorderButton.hidden = lowCount === 0;
    if (lowButton) {
      lowButton.hidden = lowCount === 0;
      lowButton.textContent = `Running low (${lowCount})`;
      lowButton.setAttribute("aria-pressed", String(lowOnly));
    }
    const matching = searchQuery
      ? all.filter((s) => spoolSearchText(s).includes(searchQuery))
      : all;
    const insightFilter = insights?.activeFilter ?? null;
    const narrowed =
      insights && insightFilter ? matching.filter((s) => insights.matches(s)) : matching;
    const ranged = narrowed.filter((s) => matchesRange(s, extra));
    const rangeActive = Boolean(
      extra.material || extra.minGrams !== null || extra.maxGrams !== null,
    );
    const filtered = sortSpools(lowOnly ? ranged.filter(isLow) : ranged, sort);
    // Grouping lists each group together, so the order the table shows is the grouped order.
    const sections = groupSpools(filtered, extra.group);
    visible = sections.flatMap((section) => section.spools);

    byId("loaded-summary").textContent =
      searchQuery || lowOnly || insightFilter || rangeActive
        ? `Showing ${filtered.length} of ${all.length} spools (${counts.join(" · ")})`
        : counts.join(" · ");

    if ((searchQuery || lowOnly || insightFilter || rangeActive) && !filtered.length) {
      container.replaceChildren(
        h(
          "p",
          { class: "rounded-lg border border-dashed p-8 text-center text-muted-foreground" },
          searchQuery
            ? `No spools matching "${searchQuery}".`
            : rangeActive
              ? "No spools match the material and weight filters."
              : insightFilter
                ? `No spools match "${filterLabel(insightFilter)}".`
                : "No spools are running low.",
        ),
      );
      return;
    }

    const headers: Array<{ label: string; key?: SortKey }> = [
      ...columns.map((column) => {
        const key = COLUMN_SORT[column];
        return { label: t(`col.${column}` as MessageKey), ...(key ? { key } : {}) };
      }),
      ...(insights ? [{ label: "Watch" }] : []),
    ];
    const drops = insights?.droppedWatched();
    // Only a window of rows is built; sorting, filtering and grouping above used the whole list.
    const signature = JSON.stringify([
      searchQuery,
      lowOnly,
      insightFilter,
      extra,
      sort,
      all.length,
    ]);
    if (signature !== windowSignature) {
      windowSignature = signature;
      rowLimit = WINDOW_STEP;
    }
    const windowed = windowSections(sections, rowLimit);
    const drawn = windowed.sections.flatMap((section) => section.spools);
    const rows = drawn.map((spool) =>
      spoolRow(spool, {
        columns,
        insights,
        onWatchChange,
        low: isLow(spool),
        drop: drops?.get(spoolKey(spool)),
      }),
    );
    const rowOf = new Map(drawn.map((spool, index) => [spool, rows[index]!]));
    const bodyRows = windowed.sections.flatMap((section) => [
      section.label
        ? h(
            "tr",
            { class: "spool-group-row" },
            h(
              "th",
              {
                scope: "colgroup",
                colspan: String(headers.length),
                class: "bg-muted/40 text-left text-sm font-semibold",
              },
              `${section.label} (${section.total})`,
            ),
          )
        : null,
      ...section.spools.map((spool) => rowOf.get(spool)!),
    ]);

    const hiddenRows = windowed.total - windowed.shown;
    const windowButton =
      "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary";
    const showMore = h(
      "button",
      { type: "button", class: windowButton },
      t("table.window.more", { count: Math.min(WINDOW_STEP, hiddenRows) }),
    );
    showMore.addEventListener("click", () => {
      focusAfterDraw = windowed.shown;
      rowLimit = nextLimit(rowLimit, windowed.total);
      renderTable();
    });
    const showAll = h("button", { type: "button", class: windowButton }, t("table.window.all"));
    showAll.addEventListener("click", () => {
      focusAfterDraw = windowed.shown;
      rowLimit = windowed.total;
      renderTable();
    });
    const windowControls =
      hiddenRows > 0
        ? h(
            "div",
            { class: "table-window" },
            h(
              "p",
              { class: "text-muted-foreground" },
              t("table.window.status", { shown: windowed.shown, total: windowed.total }),
            ),
            showMore,
            hiddenRows > WINDOW_STEP ? showAll : null,
          )
        : null;
    setChildren(
      container,
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
                  updatePreferences({ tableSort: sort ?? undefined });
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
          h("tbody", {}, ...bodyRows),
        ),
      ),
      windowControls,
    );
    // Spoken only after "Show more"; an unrelated redraw (such as watching a spool) stays silent.
    if (focusAfterDraw !== null) {
      windowStatus.textContent = t("table.window.status", {
        shown: windowed.shown,
        total: windowed.total,
      });
      // "Show more" replaced the button that had focus, so move to the first row it added.
      container.querySelectorAll<HTMLElement>("[data-open-spool]")[focusAfterDraw]?.focus();
      focusAfterDraw = null;
    }
  }

  /** Shows exactly these columns (the name column always stays) and remembers the choice. */
  function setColumns(next: readonly string[]): TableColumn[] {
    columns = saveColumns(next);
    renderTable();
    return columns;
  }

  return Object.assign(renderTable, {
    visibleSpools: (): readonly CommonSpool[] => visible,
    getColumns: (): readonly TableColumn[] => columns,
    setColumns,
    getViewSettings,
    applyViewSettings,
    /** Runs after every redraw, so the saved-views panel can show whether a view is modified. */
    onRender(listener: () => void): void {
      renderListeners.add(listener);
    },
  });
}
