import { SOURCE_IDS, type LoadResult } from "@spoolsync/core/core/model";

import { clearLoadResult, readLoadResult, saveLoadResult } from "~/lib/browser/storage";
import { applySampleParam, sampleLink } from "~/lib/sample-data";

import { CONNECTION_CHANGED } from "./connections/events";
import { h, notice, showToast } from "./dom";
import { createActionBar } from "./load/action-bar";
import { wireApiSources } from "./load/api-sources";
import { wireConnectionPanels } from "./load/connection-panels";
import { wireFileSource } from "./load/file-source";
import { createInventoryTable } from "./load/inventory-table";
import { renderLoadedChart } from "./load/loaded-chart";
import { renderLoadedStats } from "./load/loaded-stats";
import { wireSmartDrop } from "./load/smart-drop";
import { wireSourcePanels } from "./load/source-panels";
import { LoadState } from "./load/state";
import { createLoadStatusView } from "./load/status-view";
import { button, download } from "./sync/presentation";

const state = new LoadState({ clearLoadResult, readLoadResult, saveLoadResult });
const renderTable = createInventoryTable(state.results);
const panels = wireSourcePanels(state);
const actionBar = createActionBar(state);
const unloadAll = document.getElementById("unload-all");
const downloadCombined = document.getElementById("download-combined");
const loadedStats = document.getElementById("loaded-stats");
const loadedChart = document.getElementById("loaded-chart");
const render = () => {
  renderTable();
  if (loadedStats) renderLoadedStats(loadedStats, state.results);
  if (loadedChart) renderLoadedChart(loadedChart, state.results);
  panels.refresh();
  actionBar.update();
  if (unloadAll) unloadAll.hidden = state.results.size === 0;
  if (downloadCombined) downloadCombined.hidden = state.results.size === 0;
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
    store(result);
    panels.markUsed(result.source);
  },
};
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
