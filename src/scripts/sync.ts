import { recordEditsFromAccepted } from "@spoolsync/core/core/cleanup";
import type { MatchSuggestion } from "@spoolsync/core/core/match";
import { SOURCE_IDS, SOURCE_LABELS } from "@spoolsync/core/core/model";
import { mergeRecordEdits, referenceEditsFromAccepted } from "@spoolsync/core/core/reference";

import {
  loadMatchDecisions,
  loadResolutions,
  readLoadResult,
  saveLoadResult,
  saveMatchDecisions,
  saveResolutions,
} from "~/lib/browser/storage";
import { loadBulkEdits, saveBulkEdits } from "~/lib/browser/storage/bulk-edits";
import { loadAcceptedCleanups } from "~/lib/browser/storage/cleanup";
import { loadAcceptedReferences } from "~/lib/browser/storage/reference";
import { readPreferences } from "~/lib/preferences";
import {
  applySampleParam,
  clearSampleData,
  isSampleInventory,
  sampleLink,
} from "~/lib/sample-data";

import { byId, h, notice, showToast } from "./dom";
import { renderLoadedChart } from "./load/loaded-chart";
import { isTypingTarget } from "./shortcuts";
import { createApplyView } from "./sync/apply-view";
import { createBulkEditView } from "./sync/bulk-edit-view";
import { createControlsView } from "./sync/controls-view";
import { createGroupsView } from "./sync/groups-view";
import { button } from "./sync/presentation";
import { createReviewMode } from "./sync/review-mode";
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
const state = new SyncSession(
  loaded,
  loadMatchDecisions(),
  loadResolutions(),
  { saveMatchDecisions, saveResolutions, saveBulkEdits },
  loadBulkEdits(),
);
// Cleanups accepted on the Load page; any that no longer match the loaded values are left out.
const cleanupEdits = recordEditsFromAccepted(
  loadAcceptedCleanups(),
  [...loaded.values()].flatMap((result) => result.spools),
).edits;
// Reference data accepted on the Load page, checked the same way. Applied after cleanups: the
// person picked these values from a catalog they chose.
const referenceEdits = referenceEditsFromAccepted(
  loadAcceptedReferences(),
  [...loaded.values()].flatMap((result) => result.spools),
).edits;
const recordEdits = mergeRecordEdits(cleanupEdits, referenceEdits);
const countFields = (edits: typeof cleanupEdits) =>
  [...edits.values()].reduce((sum, edit) => sum + Object.keys(edit).length, 0);
// Come back to the same view of the differences list.
state.filter = readPreferences().syncFilter ?? "all";
const renderSummary = createSummaryView(state);
const renderApply = createApplyView(loaded, renderAll, {
  excluded: () => state.excluded(),
  decisions: () => state.matchDecisions(),
  bulkEdits: () => state.bulkEdits(),
  recordEdits: () => recordEdits,
  recordEditCounts: () => ({
    cleanup: countFields(cleanupEdits),
    reference: countFields(referenceEdits),
  }),
  clearBulkEdit: (groupId) => {
    state.clearBulkEdit([groupId], undefined, "clearing a bulk edit");
    renderAll();
  },
  // Leaving a change out is part of the undo history, so Undo and Redo must reflect it.
  setExcluded: (key, exclude, label) => {
    if (!state.setExcluded(key, exclude, label)) return;
    renderApply(state.match, state.resolutions);
    renderBulk();
  },
});
const renderGroups = createGroupsView(state, () => {
  renderSummary();
  renderApply(state.match, state.resolutions);
  // A pick is an undoable change, so the Undo and Redo buttons must reflect it.
  renderBulk();
});
const { renderFilters, renderBulk, undoOrRedo } = createControlsView(
  state,
  renderAll,
  renderGroups,
);

const renderBulkEdit = createBulkEditView(state, { renderAll, renderGroups: () => renderGroups() });

// Ctrl or Cmd + Z undoes a change to the plan; adding Shift (or pressing Y) redoes it.
document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || isTypingTarget(document.activeElement))
    return;
  const key = event.key.toLowerCase();
  if (key !== "z" && key !== "y") return;
  event.preventDefault();
  undoOrRedo(key === "y" || event.shiftKey ? "redo" : "undo");
});
const decideMatch = (suggestion: MatchSuggestion, same: boolean) => {
  state.decide(suggestion, same);
  showToast(same ? "Confirmed match as same spool" : "Marked spools as different", "info");
  renderAll();
};
// The one-at-a-time review shares the list's redraw, so it is created before the list.
const review = createReviewMode({
  state,
  decide: decideMatch,
  undo: () => undoOrRedo("undo"),
  rerender: () => renderSuggestions(),
});
const renderSuggestions = createSuggestionsView(
  state,
  decideMatch,
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
  review,
);

review.wireKeys();
// "Review matches" in the sticky bar starts (or returns to) the one-at-a-time review.
document.getElementById("sync-bar-review")?.addEventListener("click", () => review.start());

function renderAll(): void {
  state.recompute();
  renderSummary();
  // Redrawn with every change so a spool you just linked is counted once.
  renderLoadedChart(byId("sync-chart"), loaded);
  renderSuggestions();
  renderFilters();
  renderBulk();
  renderBulkEdit();
  renderGroups();
  renderApply(state.match, state.resolutions);
}

byId("sync-loading").hidden = true;
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
  // The empty state is a dead end whose only way forward is its buttons, so land on its heading
  // rather than leaving screen-reader users on a page that just swapped a placeholder. Only when
  // nobody has started interacting: never steal focus from someone already tabbing.
  const emptyTitle = byId("sync-empty-title");
  emptyTitle.tabIndex = -1;
  if (document.activeElement === document.body || document.activeElement === null)
    emptyTitle.focus({ preventScroll: true });
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
