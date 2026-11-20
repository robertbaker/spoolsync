import { describe, expect, mock, test } from "bun:test";

import type { CommonSpool, LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import { readPreferences, updatePreferences } from "~/lib/preferences";

import { createGroupsView } from "./groups-view";
import { SyncSession } from "./session";

function snapshot(source: SourceId, spools: CommonSpool[]): LoadResult {
  return { source, spools, warnings: [], loadedAt: "now" };
}

function makeSession(loaded: Map<SourceId, LoadResult>): SyncSession {
  const state = new SyncSession(loaded, { confirmed: [], rejected: [] }, new Map(), {
    saveResolutions: () => {},
    saveMatchDecisions: () => {},
  });
  state.recompute();
  return state;
}

describe("createGroupsView", () => {
  test("filtered empty state shows specific message and Show all spools resets filter", () => {
    localStorage.clear();
    document.body.replaceChildren();
    const groupsEl = document.createElement("div");
    groupsEl.id = "groups";
    const filterAll = document.createElement("button");
    filterAll.setAttribute("data-sync-filter", "all");
    document.body.append(filterAll, groupsEl);

    // One matched spool with identical fields in both services -> no open conflicts, not missing.
    const loaded = new Map<SourceId, LoadResult>([
      ["spoolman", snapshot("spoolman", [makeSpool("spoolman", "1", { name: "Black" })])],
      [
        "spoolio",
        snapshot("spoolio", [
          makeSpool("spoolio", "1", { name: "Black", crossIds: { spoolmanId: 1 } }),
        ]),
      ],
    ]);
    const state = makeSession(loaded);
    const onFilterReset = mock(() => {});
    const view = createGroupsView(state, () => {}, onFilterReset);

    state.filter = "open";
    updatePreferences({ syncFilter: "open" });
    view.render();
    expect(groupsEl.textContent).toContain("No spools have open conflicts.");

    state.filter = "missing";
    updatePreferences({ syncFilter: "missing" });
    view.render();
    expect(groupsEl.textContent).toContain("No spools are missing from any service.");

    const resetBtn = [...groupsEl.querySelectorAll("button")].find(
      (btn) => btn.textContent === "Show all spools",
    );
    expect(resetBtn).toBeDefined();
    resetBtn!.click();

    expect<string>(state.filter).toBe("all");
    expect(readPreferences().syncFilter).toBeUndefined();
    expect(onFilterReset).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(filterAll);
  });

  test("Show more and Show all focus the first newly revealed group card", () => {
    localStorage.clear();
    document.body.replaceChildren();
    const groupsEl = document.createElement("div");
    groupsEl.id = "groups";
    document.body.append(groupsEl);

    // 60 spools in spoolman only -> 60 groups missing from spoolio.
    const spools = Array.from({ length: 60 }, (_, index) =>
      makeSpool("spoolman", String(index + 1), { name: `Spool ${index + 1}` }),
    );
    const loaded = new Map<SourceId, LoadResult>([
      ["spoolman", snapshot("spoolman", spools)],
      ["spoolio", snapshot("spoolio", [])],
    ]);
    const state = makeSession(loaded);
    const view = createGroupsView(state, () => {});
    view.render();

    expect(groupsEl.querySelectorAll("[data-group]")).toHaveLength(25);
    const showMore = [...groupsEl.querySelectorAll("button")].find((btn) =>
      btn.textContent?.startsWith("Show 25 more"),
    )!;
    showMore.click();

    let cards = groupsEl.querySelectorAll<HTMLElement>("[data-group]");
    expect(cards).toHaveLength(50);
    expect(cards[25]!.contains(document.activeElement)).toBe(true);

    const showAll = [...groupsEl.querySelectorAll("button")].find((btn) =>
      btn.textContent?.startsWith("Show all 60"),
    )!;
    showAll.click();

    cards = groupsEl.querySelectorAll<HTMLElement>("[data-group]");
    expect(cards).toHaveLength(60);
    expect(cards[50]!.contains(document.activeElement)).toBe(true);
  });
});
