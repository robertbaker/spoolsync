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
import { OPEN_SPOOL_EVENT } from "~/lib/spool-detail";
import { readColumns, saveColumns, type TableColumn } from "~/lib/table-columns";
import { WINDOW_STEP, nextLimit, windowSections } from "~/lib/table-window";

import { byId, h, setChildren } from "../dom";
import type { InsightFilter, LoadInsights } from "./insights";

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
  return [...spools].sort((a, b) => {
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
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderTable();
    });
  }

  function watchButton(key: string, spool: CommonSpool, watching: boolean): HTMLElement {
    const label =
      [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || spool.sourceId;
    const button = h(
      "button",
      {
        type: "button",
        "aria-pressed": String(watching),
        "aria-label": `Watch ${label} (${SOURCE_LABELS[spool.source]} ${spool.sourceId})`,
        "data-watch": key,
        class:
          "rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground",
      },
      watching ? "Watching" : "Watch",
    );
    button.addEventListener("click", () => {
      insights?.toggleWatch(key);
      onWatchChange?.();
      // The table is redrawn, so hand keyboard focus to the same spool's button when it remains.
      document.querySelector<HTMLElement>(`[data-watch="${CSS.escape(key)}"]`)?.focus();
    });
    return button;
  }

  /**
   * The spool's name as a button, which opens the detail drawer for keyboard and screen reader
   * users.
   */
  function detailsButton(key: string, name: string | null): HTMLElement {
    return h(
      "button",
      {
        type: "button",
        "data-open-spool": key,
        "aria-haspopup": "dialog",
        class:
          "text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary",
      },
      name ?? "—",
      h("span", { class: "sr-only" }, " (open details)"),
    );
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
      container.replaceChildren(
        h(
          "p",
          { class: "rounded-lg border border-dashed p-8 text-center text-muted-foreground" },
          "Nothing loaded yet.",
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
      ? all.filter((s) => {
          const text = [s.vendor, s.material, s.name, s.location, s.sourceId, ...s.colors]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return text.includes(searchQuery);
        })
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
    const rows = drawn.map((spool) => {
      const key = spoolKey(spool);
      const drop = drops?.get(key);
      const watching = insights?.watched.has(key) ?? false;
      const flags = insights
        ? [
            insights.duplicateSpoolKeys.has(key) ? "Possible duplicate" : null,
            ...(insights.health.byKey.get(key) ?? []).map((issue) =>
              t(`health.factor.${issue}` as MessageKey),
            ),
            insights.missingPrice.has(key) ? t("health.factor.missing-price") : null,
          ].filter(Boolean)
        : [];
      const cells: Record<TableColumn, HTMLElement> = {
        source: h("td", { class: "whitespace-nowrap font-medium" }, SOURCE_LABELS[spool.source]),
        id: h(
          "td",
          { class: "max-w-40 truncate font-mono text-xs", title: spool.sourceId },
          spool.sourceId,
        ),
        vendor: h("td", {}, spool.vendor ?? "—"),
        material: h("td", {}, spool.material ?? "—"),
        name: h("td", {}, detailsButton(key, spool.name), spool.archived ? " (archived)" : ""),
        color: h("td", {}, swatches(spool.colors)),
        remaining: h(
          "td",
          { class: "whitespace-nowrap" },
          weight(spool),
          isLow(spool)
            ? h(
                "span",
                {
                  class:
                    "ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-text",
                },
                "Low",
              )
            : null,
          drop
            ? h(
                "span",
                {
                  class:
                    "ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-text",
                },
                `Dropped ${Math.round(-drop.delta)} g`,
              )
            : null,
        ),
        location: h("td", {}, spool.location ?? "—"),
        linked: h("td", { class: "text-xs" }, links(spool)),
      };
      const row = h(
        "tr",
        {
          "data-spool-row": "",
          class:
            `cursor-pointer hover:bg-muted/40 ${spool.archived ? "text-muted-foreground/70" : ""} ${drop ? "bg-warning/10" : ""}`.trim(),
          ...(flags.length ? { title: flags.join("; ") } : {}),
        },
        ...columns.map((column) => cells[column]),
        insights ? h("td", {}, watchButton(key, spool, watching)) : null,
      );
      // A click anywhere on the row opens the detail drawer, except on other controls and while
      // the visitor is selecting text. The name button is the keyboard route to the same action.
      row.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const control = target?.closest("button, a, input, select, textarea, label");
        if (control && !control.hasAttribute("data-open-spool")) return;
        if (!control && window.getSelection()?.toString()) return;
        document.dispatchEvent(new CustomEvent(OPEN_SPOOL_EVENT, { detail: { key } }));
      });
      return row;
    });
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
