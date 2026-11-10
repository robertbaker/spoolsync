import { allSpools, SOURCE_IDS, type LoadResult, type SourceId } from "@spoolsync/core/core/model";
import { spoolKey, summarizeInventory } from "@spoolsync/core/workflow";

import {
  clearLoadResult,
  loadMatchDecisions,
  readLoadResult,
  readSnapshot,
  readWatchlist,
  saveLoadResult,
  saveSnapshot,
  toggleWatched,
} from "~/lib/browser/storage";
import { recordStockPoint } from "~/lib/browser/storage/stock-history";
import { LOCALE_CHANGED } from "~/lib/i18n";
import { readScan } from "~/lib/labels/scan";
import { currentLowStockRule, loadLowStockPercent, saveLowStockPercent } from "~/lib/low-stock";
import { readPreferences, updatePreferences } from "~/lib/preferences";
import { applySampleParam, sampleLink } from "~/lib/sample-data";
import { DISPLAY_CHANGED } from "~/lib/units";

import { confirmDialog } from "./confirm-dialog";
import { announceConnectionChange, CONNECTION_CHANGED } from "./connections/events";
import { h, notice, showToast } from "./dom";
import { createActionBar } from "./load/action-bar";
import { wireApiSources } from "./load/api-sources";
import { wireCleanupPanel } from "./load/cleanup-view";
import { handleConnectionChange } from "./load/connection-change";
import { wireConnectionPanels } from "./load/connection-panels";
import { renderCostChart } from "./load/cost-chart";
import { wireDryingPanel } from "./load/drying-panel";
import { renderFileHistory } from "./load/file-history-view";
import { wireFileSource } from "./load/file-source";
import { wireHealthDashboard } from "./load/health-dashboard";
import { LoadInsights } from "./load/insights";
import { renderInsights } from "./load/insights-view";
import { createInventoryTable } from "./load/inventory-table";
import { wireLazyLabelPrinting } from "./load/label-lazy";
import { renderLoadedChart } from "./load/loaded-chart";
import { renderLoadedStats } from "./load/loaded-stats";
import { wireLazyReferencePanel } from "./load/reference-lazy";
import { wireReorderPanel } from "./load/reorder-panel";
import { wireInventoryReport } from "./load/report-panel";
import { wireSinceVisit } from "./load/since-visit-panel";
import { wireSmartDrop } from "./load/smart-drop";
import { wireSourcePanels } from "./load/source-panels";
import { wireSpoolDrawer } from "./load/spool-drawer";
import { LoadState, announceChange } from "./load/state";
import { createLoadStatusView } from "./load/status-view";
import { wireTableTools } from "./load/table-tools";
import { renderTrendChart } from "./load/trend-chart";
import { wireViewsPanel } from "./load/views-panel";
import { button, download } from "./sync/presentation";

const state = new LoadState({
  clearLoadResult,
  readLoadResult,
  saveLoadResult,
});
const insights = new LoadInsights(state.results, {
  readSnapshot,
  saveSnapshot,
  readWatchlist,
  toggleWatched,
  readDifferentPairs: () => new Set(loadMatchDecisions().rejected),
});
// Watching a spool changes the panels and highlights too, so it takes the full render.
const renderTable = createInventoryTable(state.results, insights, () => render());
const panels = wireSourcePanels(state);
const actionBar = createActionBar(state);
const unloadAll = document.getElementById("unload-all");
const downloadCombined = document.getElementById("download-combined");
const loadedStats = document.getElementById("loaded-stats");
const loadedChart = document.getElementById("loaded-chart");
const insightsRoot = document.getElementById("loaded-insights");
const loadedTrend = document.getElementById("loaded-trend");
const loadedCost = document.getElementById("loaded-cost");
const labels = wireLazyLabelPrinting({
  results: state.results,
  visibleSpools: () => renderTable.visibleSpools(),
});
const drawer = wireSpoolDrawer({
  results: state.results,
  insights,
  onChange: () => render(),
});
const viewsRoot = document.getElementById("saved-views");
const views = viewsRoot
  ? wireViewsPanel(viewsRoot, renderTable, () => state.results.size > 0)
  : null;
const reorderRoot = document.getElementById("reorder-panel");
const reorder = reorderRoot ? wireReorderPanel(reorderRoot, state.results) : null;
const cleanupRoot = document.getElementById("cleanup-panel");
const cleanup = cleanupRoot ? wireCleanupPanel(cleanupRoot, state.results) : null;
const healthRoot = document.getElementById("health-dashboard");
const health = healthRoot
  ? wireHealthDashboard(healthRoot, {
      results: state.results,
      insights,
      cleanupSpools: () => cleanup?.applicableSpools() ?? 0,
    })
  : null;
const toolsRoot = document.getElementById("table-tools");
const tableTools = toolsRoot
  ? wireTableTools(toolsRoot, renderTable, () => state.results.size > 0)
  : null;
const referenceRoot = document.getElementById("reference-panel");
// A spool's selected reference can supply its drying settings, so that list redraws on arrival.
const reference = referenceRoot
  ? wireLazyReferencePanel(referenceRoot, state.results, () => drying?.update())
  : null;
const dryingRoot = document.getElementById("drying-panel");
const drying = dryingRoot
  ? wireDryingPanel(
      dryingRoot,
      state.results,
      (spool) => reference?.selectedFor(spoolKey(spool))?.reference ?? null,
    )
  : null;
const inventoryReport = wireInventoryReport(state.results);
const sinceVisit = wireSinceVisit(state.results, insights);
// A label scanner types the code and presses Enter, so Enter in the filter box opens that spool.
const filterBox = document.getElementById("spool-search-input") as HTMLInputElement | null;
filterBox?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  const scan = readScan(filterBox.value, allSpools(state.results.values()));
  if (scan.kind === "text") return;
  event.preventDefault();
  if (scan.kind === "spool") {
    filterBox.value = "";
    filterBox.dispatchEvent(new Event("input"));
    drawer.open(spoolKey(scan.spool));
  } else if (scan.kind === "ambiguous") {
    showToast(`${scan.spools.length} loaded spools share the barcode ${scan.code}`, "info");
  } else {
    showToast(`No loaded spool has the code ${scan.code}. Load that service first.`, "info");
  }
});
// `dataChanged` is false when only how things are shown changed (weight unit, price symbol,
// language): the reports and the cleanup suggestions are computed from the spools alone, so they
// are kept and only redrawn. Anything that can change a spool takes the full path.
const drawnInto = (root: HTMLElement | null, render: (root: HTMLElement) => void) =>
  root ? { update: () => render(root) } : null;
const pageViews: ReadonlyArray<{ update(dataChanged: boolean): void } | null> = [
  // First: the table and the panels below read these reports.
  { update: (dataChanged) => dataChanged && insights.refresh() },
  { update: () => renderTable() },
  drawer,
  views,
  reorder,
  cleanup,
  // After the cleanup panel, whose suggestions are one input to the score.
  health,
  tableTools,
  reference,
  drying,
  inventoryReport,
  sinceVisit,
  drawnInto(insightsRoot, (root) => renderInsights(root, insights, state.results)),
  { update: () => renderFileHistory(state) },
  drawnInto(loadedStats, (root) => renderLoadedStats(root, state.results)),
  drawnInto(loadedChart, (root) => renderLoadedChart(root, state.results)),
  drawnInto(loadedTrend, (root) => renderTrendChart(root, state.results.size > 0)),
  drawnInto(loadedCost, (root) => renderCostChart(root, state.results)),
  labels,
  { update: () => panels.refresh() },
  actionBar,
];
const draw = (dataChanged: boolean) => {
  // The locale listener below outlives a page that was torn down (and test DOMs without this page).
  if (!document.getElementById("loaded-table")) return;
  for (const view of pageViews) view?.update(dataChanged);
  if (unloadAll) unloadAll.hidden = state.results.size === 0;
  if (downloadCombined) downloadCombined.hidden = state.results.size === 0;
  const thresholdWrap = document.getElementById("low-threshold-wrap");
  if (thresholdWrap) thresholdWrap.hidden = state.results.size === 0;
  // Sample data would replace real inventories in the same services, so offer it only when empty.
  const samplePrompt = document.getElementById("sample-prompt");
  if (samplePrompt) samplePrompt.hidden = state.results.size > 0;
};
const render = () => draw(true);
const renderPresentation = () => draw(false);
// Storing a file and comparing it with the previous one happen in one task; draw once, after both.
let renderQueued = false;
const scheduleRender = () => {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    render();
  });
};
const { store, setStatus } = createLoadStatusView(state, scheduleRender);
// Services loaded from this page are remembered so the next visit lists them first. Sample data
// uses the plain `store` and is deliberately left out.
const context = {
  state,
  store(result: LoadResult) {
    // Totals only, so the trend chart can show change between visits.
    recordStockPoint(result.source, {
      at: new Date().toISOString(),
      totalGrams: summarizeInventory(result).remainingGrams,
      spoolCount: result.spools.length,
    });
    store(result);
    panels.markUsed(result.source);
  },
  fileLoaded(result: LoadResult) {
    insights.fileLoaded(result);
    scheduleRender();
  },
};
// Choosing a filter only redraws the table; the panels and focus stay where they are.
insights.onFilterChange(renderTable);
wireApiSources(context);
wireConnectionPanels();
wireSmartDrop(context);
for (const source of SOURCE_IDS) wireFileSource(source, context);
// A shared `?sample=1` link stores the sample inventories first (only when nothing is loaded).
// The sidebar and stepper read storage when they start, so tell them sample data arrived.
if (await applySampleParam(SOURCE_IDS)) announceChange();
for (const source of SOURCE_IDS) {
  state.restore(source);
  setStatus(source);
}
render();

// Weight unit and price symbol changes redraw the charts and stats; setup guide is lazy.
document.addEventListener(DISPLAY_CHANGED, renderPresentation);
document.addEventListener(LOCALE_CHANGED, renderPresentation);
void Promise.all([
  import("./setup/wizard"),
  import("@spoolsync/core/adapters/spoolman"),
  import("~/lib/browser/storage"),
]).then(([{ wireSetupGuide }, adapter, storage]) =>
  wireSetupGuide({
    loadedCount: () => state.results.size,
    spoolman: {
      browserEnvironment: adapter.browserEnvironment,
      diagnoseConnection: adapter.diagnoseConnection,
      normalizeBaseUrl: adapter.normalizeBaseUrl,
      loadSpoolmanConnection: storage.loadSpoolmanConnection,
      saveSpoolmanConnection: (connection) => {
        storage.saveSpoolmanConnection(connection);
        announceConnectionChange("spoolman");
      },
    },
  }),
);

// Saving a different connection invalidates that service's fetched snapshot in storage; mirror it
// here so the page never shows (or syncs) an inventory that came from the previous server or account.
document.addEventListener(CONNECTION_CHANGED, (event) =>
  handleConnectionChange(event, {
    state,
    sources: SOURCE_IDS,
    readStored: readLoadResult,
    setStatus,
    render,
  }),
);

unloadAll?.addEventListener("click", async () => {
  const count = state.results.size;
  if (!count) return;
  const confirmed = await confirmDialog({
    title: `Unload ${count} ${count === 1 ? "service" : "services"}?`,
    body: "Loaded spools and their messages are cleared from this page. Files must be chosen again and servers fetched again.",
    confirmLabel: "Unload all",
    tone: "danger",
  });
  if (!confirmed) return;
  // Read again: a fetch may have finished while the question was open.
  const sources = [...state.results.keys()];
  for (const source of sources) {
    state.unload(source);
    setStatus(source);
    document.getElementById(`${source}-message`)?.replaceChildren();
  }
  render();
  showToast(`Unloaded ${sources.length} ${sources.length === 1 ? "service" : "services"}`, "info");
});

downloadCombined?.addEventListener("click", async () => {
  const { combinedInventoryCsv } = await import("@spoolsync/core/workflow");
  const { csv } = combinedInventoryCsv([...state.results.values()]);
  // A byte-order mark makes Excel read the file as UTF-8, so accented names survive.
  download(
    `spoolsync-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
    `\uFEFF${csv}`,
    "text/csv",
  );
});

document.getElementById("try-sample")?.addEventListener("click", async () => {
  const { sampleInventories } = await import("~/lib/sample-data");
  if (state.results.size > 0) return;
  const samples = await sampleInventories();
  for (const result of samples) {
    state.nextRevision(result.source);
    store(result);
  }
  document.getElementById("smart-message")?.replaceChildren(
    notice(
      "info",
      "Sample data loaded",
      h(
        "p",
        { class: "mt-1" },
        "Two invented inventories (Spoolio and FilaMeter) so you can try matching and syncing. Nothing here is real; use Unload all to clear it.",
      ),
      h(
        "div",
        { class: "mt-3" },
        button("Copy demo link", () => {
          navigator.clipboard.writeText(sampleLink(location.origin)).then(
            () => showToast("Demo link copied", "success"),
            () => showToast("Could not copy the link", "error"),
          );
        }),
      ),
    ),
  );
});

document.getElementById("copy-reorder")?.addEventListener("click", async () => {
  const { formatReorderList, reorderItems } = await import("@spoolsync/core/workflow");
  const { loadMatchDecisions } = await import("~/lib/browser/storage");
  const items = reorderItems(
    [...state.results.values()],
    loadMatchDecisions(),
    currentLowStockRule(),
  );
  try {
    await navigator.clipboard.writeText(formatReorderList(items));
    showToast(
      `Copied ${items.length} ${items.length === 1 ? "spool" : "spools"} to reorder`,
      "success",
    );
  } catch {
    showToast("Could not copy the list", "error");
  }
});

const thresholdSelect = document.getElementById("low-threshold") as HTMLSelectElement | null;
if (thresholdSelect) {
  thresholdSelect.value = String(loadLowStockPercent());
  thresholdSelect.addEventListener("change", () => {
    saveLowStockPercent(Number(thresholdSelect.value));
    render();
  });
}

// Opt-in: a returning visitor with connected services lands on loaded data.
const autoFetch = document.getElementById("auto-fetch") as HTMLInputElement | null;
if (autoFetch) {
  autoFetch.checked = readPreferences().autoFetch ?? false;
  autoFetch.addEventListener("change", () =>
    updatePreferences({ autoFetch: autoFetch.checked || undefined }),
  );
  if (autoFetch.checked) {
    const fetchers: Array<[SourceId, string]> = [
      ["spoolman", "spoolman-load"],
      ["tigertag", "tigertag-cloud"],
      ["bambuddy", "bambuddy-fetch"],
      ["filamentdb", "filamentdb-fetch"],
    ];
    for (const [source, id] of fetchers) {
      const button = document.getElementById(id) as HTMLButtonElement | null;
      // Only services that are connected (their button is enabled) and not already loaded.
      if (button && !button.disabled && !state.results.has(source)) button.click();
    }
  }
}
