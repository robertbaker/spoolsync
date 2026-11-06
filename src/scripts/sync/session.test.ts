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

test("bulk decisions answer every suggestion once and persist a single time", () => {
  const { state, saveMatchDecisions } = session(
    new Map([
      [
        "spoolman",
        snapshot("spoolman", [
          makeSpool("spoolman", "1", { name: "Alpha" }),
          makeSpool("spoolman", "2", { name: "Beta" }),
        ]),
      ],
      [
        "spoolio",
        snapshot("spoolio", [
          makeSpool("spoolio", "a", { name: "Alpha" }),
          makeSpool("spoolio", "b", { name: "Beta" }),
        ]),
      ],
    ]),
  );
  state.recompute();
  expect(state.match.suggestions).toHaveLength(2);
  expect(state.decideAll(true)).toBe(2);
  expect(saveMatchDecisions).toHaveBeenCalledTimes(1);
  state.recompute();
  expect(state.match.suggestions).toHaveLength(0);
  expect(state.match.groups.filter((group) => group.status === "linked")).toHaveLength(2);
  expect(state.decideAll(false)).toBe(0);
});

test("saved match answers can be counted and reset so pairs are suggested again", () => {
  const { state, saveMatchDecisions } = session(
    new Map([
      ["spoolman", snapshot("spoolman", [makeSpool("spoolman", "1")])],
      ["spoolio", snapshot("spoolio", [makeSpool("spoolio", "one")])],
    ]),
  );
  state.recompute();
  expect(state.decisionCounts()).toEqual({ same: 0, different: 0 });
  state.decide(state.match.suggestions[0]!, false);
  expect(state.decisionCounts()).toEqual({ same: 0, different: 1 });
  state.recompute();
  expect(state.match.suggestions).toHaveLength(0);

  expect(state.resetDecisions()).toBe(1);
  expect(state.decisionCounts()).toEqual({ same: 0, different: 0 });
  expect(saveMatchDecisions).toHaveBeenLastCalledWith({ confirmed: [], rejected: [] });
  state.recompute();
  expect(state.match.suggestions).toHaveLength(1);
  expect(state.resetDecisions()).toBe(0);
});

test("changes to the plan can be undone and redone, and a new change drops the redo history", () => {
  const { state } = session(
    new Map([
      ["spoolman", snapshot("spoolman", [makeSpool("spoolman", "1")])],
      ["spoolio", snapshot("spoolio", [])],
    ]),
  );
  state.recompute();
  const group = state.match.groups[0]!;
  expect(state.undoLabel()).toBeNull();
  expect(state.undo()).toBeNull();

  state.checkpoint("adding a spool to Spoolio");
  state.updateResolution(group, (draft) => draft.createIn.push("spoolio"));
  state.checkpoint("picking a weight");
  state.updateResolution(group, (draft) => {
    draft.values["remainingWeight"] = 123;
  });
  expect(state.undoLabel()).toBe("picking a weight");

  expect(state.undo()).toBe("picking a weight");
  expect(state.resolutionFor(group).values["remainingWeight"]).toBeUndefined();
  expect(state.resolutionFor(group).createIn).toEqual(["spoolio"]);
  expect(state.redoLabel()).toBe("picking a weight");

  expect(state.undo()).toBe("adding a spool to Spoolio");
  expect(state.resolutionFor(group).createIn).toEqual([]);
  expect(state.undoLabel()).toBeNull();

  expect(state.redo()).toBe("adding a spool to Spoolio");
  expect(state.resolutionFor(group).createIn).toEqual(["spoolio"]);
  expect(state.redo()).toBe("picking a weight");
  expect(state.resolutionFor(group).values["remainingWeight"]).toBe(123);
  expect(state.redo()).toBeNull();

  // Undoing and then changing something else means the old future can no longer be replayed.
  state.undo();
  state.checkpoint("something new");
  expect(state.redoLabel()).toBeNull();
});

test("recompute reuses the match until the records or the answers change", () => {
  const { state, saveResolutions } = answerSession();
  state.recompute();
  const first = state.match;
  expect(first.suggestions).toHaveLength(1);

  // A plan-only redraw (nothing matched differently) keeps the match but still reconciles and saves.
  state.recompute();
  expect(state.match).toBe(first);
  expect(saveResolutions).toHaveBeenCalledTimes(2);

  // A new answer is a new decisions object, so the match is computed again.
  state.decide(first.suggestions[0]!, true);
  state.recompute();
  expect(state.match).not.toBe(first);
  expect(state.match.suggestions).toHaveLength(0);

  // Undoing restores the earlier answers object, which differs from the last one matched.
  state.undo();
  state.recompute();
  expect(state.match.suggestions).toHaveLength(1);

  // New records (a reload or an apply) are matched again too.
  const again = state.match;
  state.loaded.set("spoolio", snapshot("spoolio", [makeSpool("spoolio", "one")]));
  state.recompute();
  expect(state.match).not.toBe(again);
});

test("snapshots are not changed by later edits and the history is bounded", () => {
  const { state } = session(
    new Map([["spoolman", snapshot("spoolman", [makeSpool("spoolman", "1")])]]),
  );
  state.recompute();
  const group = state.match.groups[0]!;
  state.updateResolution(group, (draft) => {
    draft.values["name"] = "before";
  });
  state.checkpoint("first");
  const shared = state.resolutionFor(group);
  state.updateResolution(group, (draft) => {
    draft.values["name"] = "changed after the snapshot";
    draft.createIn.push("spoolio");
  });
  // The object the snapshot holds is untouched; the live map got a new one.
  expect(shared.values["name"]).toBe("before");
  expect(shared.createIn).toEqual([]);
  expect(state.resolutionFor(group)).not.toBe(shared);
  state.undo();
  expect(state.resolutionFor(group).values["name"]).toBe("before");
  expect(state.resolutionFor(group).createIn).toEqual([]);
  // Editing a snapshotted object in place is a bug, so it fails loudly instead of corrupting undo.
  expect(() => {
    state.resolutionFor(group).values["name"] = "in place";
  }).toThrow();
  state.redo();
  expect(state.resolutionFor(group).values["name"]).toBe("changed after the snapshot");
  state.undo();

  for (let index = 0; index < 120; index++) state.checkpoint(`change ${index}`);
  let undone = 0;
  while (state.undo() !== null) undone++;
  expect(undone).toBe(50);
});

function answerSession() {
  return session(
    new Map([
      ["spoolman", snapshot("spoolman", [makeSpool("spoolman", "1")])],
      ["spoolio", snapshot("spoolio", [makeSpool("spoolio", "one")])],
    ]),
  );
}

test("a match answer can be undone and redone, and the saved answers follow", () => {
  const { state, saveMatchDecisions } = answerSession();
  state.recompute();
  const suggestion = state.match.suggestions[0]!;
  expect(state.undoLabel()).toBeNull();

  state.decide(suggestion, true);
  expect(state.decisionCounts()).toEqual({ same: 1, different: 0 });
  expect(state.undoLabel()).toBe("confirming a match");

  expect(state.undo()).toBe("confirming a match");
  expect(state.decisionCounts()).toEqual({ same: 0, different: 0 });
  expect(saveMatchDecisions).toHaveBeenLastCalledWith({ confirmed: [], rejected: [] });
  state.recompute();
  expect(state.match.suggestions).toHaveLength(1);

  expect(state.redo()).toBe("confirming a match");
  expect(state.decisionCounts()).toEqual({ same: 1, different: 0 });
  state.recompute();
  expect(state.match.suggestions).toHaveLength(0);
  expect(state.match.groups.filter((group) => group.status === "linked")).toHaveLength(1);
});

test("bulk answers and resets are single steps in the same history as plan changes", () => {
  const { state } = answerSession();
  state.recompute();
  const group = state.match.groups[0]!;

  state.checkpoint("adding a spool to Spoolio");
  state.updateResolution(group, (draft) => draft.createIn.push("spoolio"));

  expect(state.decideAll(false)).toBe(1);
  expect(state.undoLabel()).toBe("rejecting 1 match");
  // The page recomputes after every answer, which is when the answered pair stops being suggested.
  state.recompute();
  expect(state.decideAll(true)).toBe(0);
  // Nothing was left to answer, so no empty step was recorded.
  expect(state.undoLabel()).toBe("rejecting 1 match");

  expect(state.resetDecisions()).toBe(1);
  expect(state.undoLabel()).toBe("resetting match answers");
  expect(state.resetDecisions()).toBe(0);
  expect(state.undoLabel()).toBe("resetting match answers");

  // Undo walks back through the reset, then the rejection, then the earlier plan change.
  expect(state.undo()).toBe("resetting match answers");
  expect(state.decisionCounts()).toEqual({ same: 0, different: 1 });
  expect(state.undo()).toBe("rejecting 1 match");
  expect(state.decisionCounts()).toEqual({ same: 0, different: 0 });
  expect(state.resolutionFor(group).createIn).toEqual(["spoolio"]);
  expect(state.undo()).toBe("adding a spool to Spoolio");
  expect(state.resolutionFor(group).createIn).toEqual([]);
  expect(state.undo()).toBeNull();
});

test("restoring a step restores answers and plan choices together", () => {
  const { state } = answerSession();
  state.recompute();
  const group = state.match.groups[0]!;
  state.checkpoint("pick");
  state.updateResolution(group, (draft) => {
    draft.values["remainingWeight"] = 9;
  });
  state.decide(state.match.suggestions[0]!, false);
  expect(state.decisionCounts()).toEqual({ same: 0, different: 1 });

  state.undo();
  expect(state.decisionCounts()).toEqual({ same: 0, different: 0 });
  expect(state.resolutionFor(group).values["remainingWeight"]).toBe(9);
  state.undo();
  expect(state.resolutionFor(group).values["remainingWeight"]).toBeUndefined();
});

test("excluding a planned change is undoable, redoable and restored after clearing", () => {
  const { state } = answerSession();
  expect(state.setExcluded("k", true, "excluding a")).toBe(true);
  expect(state.setExcluded("k", true, "again")).toBe(false);
  expect(state.undoLabel()).toBe("excluding a");
  expect(state.undo()).toBe("excluding a");
  expect(state.excluded().has("k")).toBe(false);
  expect(state.redo()).toBe("excluding a");
  expect(state.excluded().has("k")).toBe(true);
  state.checkpoint("reset");
  state.clearExclusions();
  expect(state.excluded().size).toBe(0);
  state.undo();
  expect(state.excluded().has("k")).toBe(true);
});
