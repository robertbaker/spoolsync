import type { SourceId } from "@spoolsync/core/core/model";
import { SERVICES } from "@spoolsync/core/core/services";

import { changedConnectionSource } from "../connections/events";
import type { LoadState } from "./state";

export interface ConnectionChangeContext {
  state: LoadState;
  sources: readonly SourceId[];
  /** The inventory kept in browser storage, if any; a fetched one that is gone from it is stale. */
  readStored(source: SourceId): unknown;
  setStatus(source: SourceId): void;
  render(): void;
}

/**
 * Saving a different connection invalidates that service's fetched snapshot in storage; this
 * mirrors it on the page so it never shows (or syncs) an inventory that came from the previous
 * server or account. An event naming one service leaves other services alone; one without a service
 * covers all of them.
 */
export function handleConnectionChange(event: Event, context: ConnectionChangeContext): void {
  const { state, sources, readStored, setStatus, render } = context;
  const only = changedConnectionSource(event);
  for (const source of sources) {
    if (only && source !== only) continue;
    // Reject any in-flight server response that was started for the previous connection. In-flight
    // file loads are unaffected: they do not depend on a connection.
    if ((SERVICES[source].apiClients as readonly string[]).includes("browser"))
      state.invalidateApi(source);
    if (state.results.get(source)?.origin === "api" && !readStored(source)) {
      state.unload(source);
      setStatus(source);
    }
  }
  render();
}
