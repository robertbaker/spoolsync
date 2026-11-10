import { expect, mock, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";

import { announceConnectionChange } from "../connections/events";
import { handleConnectionChange } from "./connection-change";
import { LoadState } from "./state";

const fetched = (source: SourceId): LoadResult => ({
  source,
  spools: [],
  warnings: [],
  loadedAt: "now",
  origin: "api",
});

function fixture() {
  const state = new LoadState({
    readLoadResult: () => null,
    saveLoadResult: () => true,
    clearLoadResult: () => {},
  });
  const setStatus = mock((_source: SourceId) => {});
  const render = mock(() => {});
  const listener = (event: Event) =>
    handleConnectionChange(event, {
      state,
      sources: ["spoolman", "tigertag", "spoolstock"],
      readStored: () => null,
      setStatus,
      render,
    });
  document.addEventListener("spoolsync:connection-changed", listener);
  return {
    state,
    setStatus,
    render,
    dispose: () => document.removeEventListener("spoolsync:connection-changed", listener),
  };
}

test("an event naming one service leaves other services' loads and snapshots alone", () => {
  const f = fixture();
  try {
    const spoolmanLoad = f.state.nextRevision("spoolman");
    const tigertagLoad = f.state.nextRevision("tigertag");
    f.state.store(fetched("spoolman"));
    f.state.store(fetched("tigertag"));

    announceConnectionChange("spoolman");

    expect(f.state.isCurrent("spoolman", spoolmanLoad, "api")).toBe(false);
    expect(f.state.results.has("spoolman")).toBe(false);
    expect(f.state.isCurrent("tigertag", tigertagLoad, "api")).toBe(true);
    expect(f.state.results.has("tigertag")).toBe(true);
    expect(f.setStatus.mock.calls.map(([source]) => source)).toEqual(["spoolman"]);
    expect(f.render).toHaveBeenCalledTimes(1);
  } finally {
    f.dispose();
  }
});

test("an event without a service invalidates every service's loads and API snapshots", () => {
  const f = fixture();
  try {
    const spoolmanLoad = f.state.nextRevision("spoolman");
    const tigertagLoad = f.state.nextRevision("tigertag");
    f.state.store(fetched("spoolman"));
    f.state.store({ ...fetched("spoolstock"), origin: "file" });

    announceConnectionChange();

    expect(f.state.isCurrent("spoolman", spoolmanLoad, "api")).toBe(false);
    expect(f.state.isCurrent("tigertag", tigertagLoad, "api")).toBe(false);
    expect(f.state.results.has("spoolman")).toBe(false);
    // A file snapshot does not depend on a connection.
    expect(f.state.results.has("spoolstock")).toBe(true);
  } finally {
    f.dispose();
  }
});
