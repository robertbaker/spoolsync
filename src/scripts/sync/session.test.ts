import { expect, mock, test } from "bun:test";

import type { CommonSpool, LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import { SyncSession } from "./session";

function snapshot(source: SourceId, spools: CommonSpool[]): LoadResult {
  return { source, spools, warnings: [], loadedAt: "now" };
}

function session(loaded: Map<SourceId, LoadResult>) {
  const saveResolutions = mock(() => {});
  const saveMatchDecisions = mock(() => {});
  const state = new SyncSession(loaded, { confirmed: [], rejected: [] }, new Map(), {
    saveResolutions,
    saveMatchDecisions,
  });
  return { state, saveResolutions, saveMatchDecisions };
}

test("sync recomputation preserves choices when a group gains a created member", () => {
  const spool = makeSpool("spoolman", "1");
  const loaded = new Map<SourceId, LoadResult>([
    ["spoolman", snapshot("spoolman", [spool])],
    ["spoolio", snapshot("spoolio", [])],
    ["tigertag", snapshot("tigertag", [])],
  ]);
  const { state, saveResolutions } = session(loaded);
  state.recompute();
  const before = state.match.groups[0]!;
  const resolution = state.resolutionFor(before);
  resolution.values.name = "Chosen name";
  resolution.createIn = ["spoolio", "tigertag"];
  loaded.set(
    "spoolio",
    snapshot("spoolio", [makeSpool("spoolio", "new", { crossIds: { spoolmanId: 1 } })]),
  );
  state.recompute();
  const after = state.match.groups[0]!;
  expect(after.id).not.toBe(before.id);
  expect(state.resolutionFor(after).values.name).toBe("Chosen name");
  expect(state.resolutionFor(after).createIn).toEqual(["tigertag"]);
  expect(saveResolutions).toHaveBeenCalledTimes(2);
});

test("match decisions persist and remove pending groups after recomputation", () => {
  const { state, saveMatchDecisions } = session(
    new Map([
      ["spoolman", snapshot("spoolman", [makeSpool("spoolman", "1")])],
      ["spoolio", snapshot("spoolio", [makeSpool("spoolio", "one")])],
    ]),
  );
  state.recompute();
  const suggestion = state.match.suggestions[0]!;
  expect(state.pendingGroupIds().size).toBe(2);
  state.decide(suggestion, true);
  expect(saveMatchDecisions).toHaveBeenCalledTimes(1);
  state.recompute();
  expect(state.match.groups).toHaveLength(1);
  expect(state.match.groups[0]!.status).toBe("linked");
  expect(state.pendingGroupIds().size).toBe(0);
});

test("sync filters reflect current resolutions and exclude read-only creation targets", () => {
  const { state } = session(
    new Map([
      ["spoolman", snapshot("spoolman", [makeSpool("spoolman", "1", { remainingWeight: 500 })])],
      [
        "spoolio",
        snapshot("spoolio", [
          makeSpool("spoolio", "one", { crossIds: { spoolmanId: 1 }, remainingWeight: 600 }),
        ]),
      ],
      ["spoolstock", snapshot("spoolstock", [])],
    ]),
  );
  state.recompute();
  state.filter = "open";
  expect(state.visibleGroups()).toHaveLength(1);
  state.resolutionFor(state.match.groups[0]!).values.remainingWeight = 500;
  expect(state.visibleGroups()).toHaveLength(0);
  state.filter = "missing";
  expect(state.visibleGroups()).toHaveLength(0);
  expect(state.writableLoadedSources()).toEqual(["spoolman", "spoolio"]);
});
