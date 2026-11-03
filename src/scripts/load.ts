import { SOURCE_IDS, type LoadResult, type SourceId } from "@spoolsync/core/core/model";
import { summarizeInventory } from "@spoolsync/core/workflow";

import {
  clearLoadResult,
  readLoadResult,
  readSnapshot,
  readWatchlist,
  saveLoadResult,
  saveSnapshot,
  toggleWatched,
} from "~/lib/browser/storage";
import { recordStockPoint } from "~/lib/browser/storage/stock-history";
import { currentLowStockRule, loadLowStockPercent, saveLowStockPercent } from "~/lib/low-stock";
import { readPreferences, updatePreferences } from "~/lib/preferences";
import { applySampleParam, sampleLink } from "~/lib/sample-data";
import { DISPLAY_CHANGED } from "~/lib/units";

import { CONNECTION_CHANGED } from "./connections/events";
import { h, notice, showToast } from "./dom";
import { createActionBar } from "./load/action-bar";
import { wireApiSources } from "./load/api-sources";
import { wireCleanupPanel } from "./load/cleanup-view";
import { wireConnectionPanels } from "./load/connection-panels";
import { renderCostChart } from "./load/cost-chart";
import { renderFileHistory } from "./load/file-history-view";
import { wireFileSource } from "./load/file-source";
import { LoadInsights } from "./load/insights";
import { renderInsights } from "./load/insights-view";
import { createInventoryTable } from "./load/inventory-table";
import { wireLabelPrinting } from "./load/label-sheet";
import { renderLoadedChart } from "./load/loaded-chart";
import { renderLoadedStats } from "./load/loaded-stats";
import { wireInventoryReport } from "./load/report-panel";
import { wireReorderPanel } from "./load/reorder-panel";
import { wireSinceVisit } from "./load/since-visit-panel";
import { wireSmartDrop } from "./load/smart-drop";
import { wireSourcePanels } from "./load/source-panels";
import { wireSpoolDrawer } from "./load/spool-drawer";
import { LoadState } from "./load/state";
import { createLoadStatusView } from "./load/status-view";
import { renderTrendChart } from "./load/trend-chart";
import { wireViewsPanel } from "./load/views-panel";
import { button, download } from "./sync/presentation";

const state = new LoadState({ clearLoadResult, readLoadResult, saveLoadResult });
const insights = new LoadInsights(state.results, {
  readSnapshot,
  saveSnapshot,
  readWatchlist,
  toggleWatched,
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
const labels = wireLabelPrinting({
  results: state.results,
  visibleSpools: () => renderTable.visibleSpools(),
});
const drawer = wireSpoolDrawer({ results: state.results, insights, onChange: () => render() });
const viewsRoot = document.getElementById("saved-views");
const views = viewsRoot
  ? wireViewsPanel(viewsRoot, renderTable, () => state.results.size > 0)
  : null;
const reorderRoot = document.getElementById("reorder-panel");
const reorder = reorderRoot ? wireReorderPanel(reorderRoot, state.results) : null;
const cleanupRoot = document.getElementById("cleanup-panel");
const cleanup = cleanupRoot ? wireCleanupPanel(cleanupRoot, state.results) : null;
const inventoryReport = wireInventoryReport(state.results);
const sinceVisit = wireSinceVisit(state.results, insights);
const render = () => {
  insights.refresh();
  renderTable();
  drawer.update();
  views?.update();
  reorder?.update();
  cleanup?.update();
  inventoryReport.update();
  sinceVisit.update();
  if (insightsRoot) renderInsights(insightsRoot, insights, state.results);
  renderFileHistory(state);
  if (loadedStats) renderLoadedStats(loadedStats, state.results);
  if (loadedChart) renderLoadedChart(loadedChart, state.results);
  if (loadedTrend) renderTrendChart(loadedTrend, state.results.size > 0);
  if (loadedCost) renderCostChart(loadedCost, state.results);
  labels.update();
  panels.refresh();
  actionBar.update();
  if (unloadAll) unloadAll.hidden = state.results.size === 0;
  if (downloadCombined) downloadCombined.hidden = state.results.size === 0;
  const thresholdWrap = document.getElementById("low-threshold-wrap");
  if (thresholdWrap) thresholdWrap.hidden = state.results.size === 0;
  // Sample data would replace real inventories in the same services, so offer it only when empty.
  const samplePrompt = document.getElementById("sample-prompt");
  if (samplePrompt) samplePrompt.hidden = state.results.size > 0;
};
const { store, setStatus } = createLoadStatusView(state, render);
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
    render();
  },
};
// Choosing a filter only redraws the table; the panels and focus stay where they are.
insights.onFilterChange(renderTable);
wireApiSources(context);
wireConnectionPanels();
wireSmartDrop(context);
for (const source of SOURCE_IDS) wireFileSource(source, context);
// A shared `?sample=1` link stores the sample inventories first (only when nothing is loaded).
await applySampleParam(SOURCE_IDS);
for (const source of SOURCE_IDS) {
  state.restore(source);
  setStatus(source);
}
render();

// Weight unit and price symbol changes redraw the charts and stats; setup guide is lazy.
document.addEventListener(DISPLAY_CHANGED, render);
void import("./setup/wizard").then(({ wireSetupGuide }) =>
  wireSetupGuide({ loadedCount: () => state.results.size }),
);

// Saving a different connection invalidates that service's fetched snapshot in storage; mirror it
// here so the page never shows (or syncs) an inventory that came from the previous server or account.
document.addEventListener(CONNECTION_CHANGED, () => {
  for (const source of SOURCE_IDS) {
    if (state.results.get(source)?.origin === "api" && !readLoadResult(source)) {
      state.unload(source);
      setStatus(source);
    }
  }
  render();
});

unloadAll?.addEventListener("click", () => {
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
