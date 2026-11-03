import { SOURCE_IDS, SOURCE_LABELS } from "@spoolsync/core/core/model";

import {
  loadMatchDecisions,
  loadResolutions,
  readLoadResult,
  saveLoadResult,
  saveMatchDecisions,
  saveResolutions,
} from "~/lib/browser/storage";
import { readPreferences } from "~/lib/preferences";
import {
  applySampleParam,
  clearSampleData,
  isSampleInventory,
  sampleLink,
} from "~/lib/sample-data";

import { byId, h, notice, showToast } from "./dom";
import { renderLoadedChart } from "./load/loaded-chart";
import { createApplyView } from "./sync/apply-view";
import { createControlsView } from "./sync/controls-view";
import { createGroupsView } from "./sync/groups-view";
import { button } from "./sync/presentation";
import { SyncSession } from "./sync/session";
import { createSuggestionsView } from "./sync/suggestions-view";
import { createSummaryView } from "./sync/summary-view";

// A shared `?sample=1` link stores the sample inventories first (only when nothing is loaded).
await applySampleParam(SOURCE_IDS);

const loaded = new Map(
  SOURCE_IDS.flatMap((source) => {
    const result = readLoadResult(source);
    return result ? [[source, result] as const] : [];
  }),
);
const state = new SyncSession(loaded, loadMatchDecisions(), loadResolutions(), {
  saveMatchDecisions,
  saveResolutions,
});
// Come back to the same view of the differences list.
state.filter = readPreferences().syncFilter ?? "all";
const renderSummary = createSummaryView(state);
const renderApply = createApplyView(loaded, renderAll);
const renderGroups = createGroupsView(state, () => {
  renderSummary();
  renderApply(state.match, state.resolutions);
});
const { renderFilters, renderBulk } = createControlsView(state, renderAll, renderGroups);
const renderSuggestions = createSuggestionsView(
  state,
  (suggestion, same) => {
    state.decide(suggestion, same);
    showToast(same ? "Confirmed match as same spool" : "Marked spools as different", "info");
    renderAll();
  },
  (same) => {
    const count = state.decideAll(same);
    showToast(`${same ? "Confirmed" : "Rejected"} ${count} possible matches`, "info");
    renderAll();
  },
  () => {
    const count = state.resetDecisions();
    showToast(`Forgot ${count} match ${count === 1 ? "answer" : "answers"}`, "info");
    renderAll();
  },
);

function renderAll(): void {
  state.recompute();
  renderSummary();
  // Redrawn with every change so a spool you just linked is counted once.
  renderLoadedChart(byId("sync-chart"), loaded);
  renderSuggestions();
  renderFilters();
  renderBulk();
  renderGroups();
  renderApply(state.match, state.resolutions);
}

if (loaded.size < 2) {
  byId("sync-empty").hidden = false;
  if (loaded.size === 0) {
    const sample = byId<HTMLButtonElement>("try-sample-sync");
    sample.hidden = false;
    sample.addEventListener("click", async () => {
      const { sampleInventories } = await import("~/lib/sample-data");
      const results = await sampleInventories();
      if (!results.every((result) => saveLoadResult(result))) {
        showToast("Browser storage is unavailable, so sample data cannot be kept.", "error");
        return;
      }
      location.reload();
    });
  }
  if (loaded.size) {
    byId("sync-empty-title").textContent =
      `Only ${SOURCE_LABELS[state.loadedSources()[0]!]} is loaded`;
    byId("sync-empty-body").textContent = "Load at least one more service to compare against.";
  }
} else {
  byId("sync-empty").hidden = true;
  byId("sync-app").hidden = false;
  if (isSampleInventory(loaded.values())) showSampleBanner();
  renderAll();
}

/** Says plainly that this is invented data, and offers a shareable link and a way out. */
function showSampleBanner(): void {
  const banner = byId("sample-banner");
  const copy = button("Copy demo link", () => {
    navigator.clipboard.writeText(sampleLink(location.origin)).then(
      () => showToast("Demo link copied", "success"),
      () => showToast("Could not copy the link", "error"),
    );
  });
  const clear = button("Clear sample data", () => {
    clearSampleData([...loaded.keys()]);
    location.assign("/load");
  });
  banner.hidden = false;
  banner.replaceChildren(
    notice(
      "info",
      "You are looking at sample data",
      h(
        "p",
        { class: "mt-1" },
        "These inventories are invented so you can try matching and syncing. Nothing leaves this browser.",
      ),
      h("div", { class: "mt-3 flex flex-wrap gap-2" }, copy, clear),
    ),
  );
}
