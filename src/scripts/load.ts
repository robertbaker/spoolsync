import { SOURCE_IDS } from "@spoolsync/core/core/model";

import { clearLoadResult, readLoadResult, saveLoadResult } from "~/lib/browser/storage";

import { wireApiSources } from "./load/api-sources";
import { wireFileSource } from "./load/file-source";
import { createInventoryTable } from "./load/inventory-table";
import { LoadState } from "./load/state";
import { createLoadStatusView } from "./load/status-view";

const state = new LoadState({ clearLoadResult, readLoadResult, saveLoadResult });
const renderTable = createInventoryTable(state.results);
const { store, setStatus } = createLoadStatusView(state, renderTable);
const context = { state, store };
wireApiSources(context);
for (const source of SOURCE_IDS) wireFileSource(source, context);
for (const source of SOURCE_IDS) {
  state.restore(source);
  setStatus(source);
}
renderTable();
