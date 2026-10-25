import { SOURCE_IDS, SOURCE_LABELS } from "@spoolsync/core/core/model";

import {
  loadMatchDecisions,
  loadResolutions,
  readLoadResult,
  saveMatchDecisions,
  saveResolutions,
} from "~/lib/browser/storage";

import { byId, showToast } from "./dom";
import { createApplyView } from "./sync/apply-view";
import { createControlsView } from "./sync/controls-view";
import { createGroupsView } from "./sync/groups-view";
import { SyncSession } from "./sync/session";
import { createSuggestionsView } from "./sync/suggestions-view";
import { createSummaryView } from "./sync/summary-view";

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
const renderSummary = createSummaryView(state);
const renderApply = createApplyView(loaded, renderAll);
const renderGroups = createGroupsView(state, () => {
  renderSummary();
  renderApply(state.match, state.resolutions);
});
const { renderFilters, renderBulk } = createControlsView(state, renderAll, renderGroups);
const renderSuggestions = createSuggestionsView(state, (suggestion, same) => {
  state.decide(suggestion, same);
  showToast(same ? "Confirmed match as same spool" : "Marked spools as different", "info");
  renderAll();
});

function renderAll(): void {
  state.recompute();
  renderSummary();
  renderSuggestions();
  renderFilters();
  renderBulk();
  renderGroups();
  renderApply(state.match, state.resolutions);
}

if (loaded.size < 2) {
  byId("sync-empty").hidden = false;
  if (loaded.size) {
    byId("sync-empty-title").textContent =
      `Only ${SOURCE_LABELS[state.loadedSources()[0]!]} is loaded`;
    byId("sync-empty-body").textContent = "Load at least one more service to compare against.";
  }
} else {
  byId("sync-empty").hidden = true;
  byId("sync-app").hidden = false;
  renderAll();
}
