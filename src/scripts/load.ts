import { SOURCE_IDS } from "@spoolsync/core/core/model";

import { clearLoadResult, readLoadResult, saveLoadResult } from "~/lib/browser/storage";

import { createActionBar } from "./load/action-bar";
import { wireApiSources } from "./load/api-sources";
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
wireSmartDrop(context);
for (const source of SOURCE_IDS) wireFileSource(source, context);
for (const source of SOURCE_IDS) {
  state.restore(source);
  setStatus(source);
}
render();
