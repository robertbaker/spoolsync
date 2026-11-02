import { SOURCE_IDS } from "@spoolsync/core/core/model";

import { clearLoadResult, readLoadResult, saveLoadResult } from "~/lib/browser/storage";

import { CONNECTION_CHANGED } from "./connections/events";
import { createActionBar } from "./load/action-bar";
import { wireApiSources } from "./load/api-sources";
import { wireConnectionPanels } from "./load/connection-panels";
import { wireFileSource } from "./load/file-source";
import { createInventoryTable } from "./load/inventory-table";
import { wireSmartDrop } from "./load/smart-drop";
import { wireSourcePanels } from "./load/source-panels";
import { LoadState } from "./load/state";
import { createLoadStatusView } from "./load/status-view";

const state = new LoadState({ clearLoadResult, readLoadResult, saveLoadResult });
const renderTable = createInventoryTable(state.results);
const panels = wireSourcePanels(state);
const actionBar = createActionBar(state);
const render = () => {
  renderTable();
  panels.refresh();
  actionBar.update();
};
const { store, setStatus } = createLoadStatusView(state, render);
const context = { state, store };
wireApiSources(context);
wireConnectionPanels();
wireSmartDrop(context);
for (const source of SOURCE_IDS) wireFileSource(source, context);
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
