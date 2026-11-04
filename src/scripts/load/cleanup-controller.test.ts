import { describe, expect, test } from "bun:test";

import {
  CLEANUP_RULE_IDS,
  type AcceptedCleanup,
  type CleanupSettings,
} from "@spoolsync/core/core/cleanup";
import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import { CleanupController } from "./cleanup-controller";

const result = (source: SourceId, spools: LoadResult["spools"]): LoadResult => ({
  source,
  spools,
  warnings: [],
  loadedAt: "2026-01-01T00:00:00.000Z",
});

function memoryStore(accepted: AcceptedCleanup[] = []) {
  const state = {
    settings: { enabled: [...CLEANUP_RULE_IDS] } as CleanupSettings,
    saved: accepted,
  };
  return {
    state,
    store: {
      loadSettings: () => state.settings,
      saveSettings: (settings: CleanupSettings) => {
        state.settings = settings;
      },
      loadAccepted: () => state.saved,
      saveAccepted: (list: readonly AcceptedCleanup[]) => {
        state.saved = [...list];
      },
    },
  };
}

function setup(accepted: AcceptedCleanup[] = []) {
  const results = new Map<SourceId, LoadResult>([
    [
      "spoolman",
      result("spoolman", [
        makeSpool("spoolman", "1", { vendor: "esun", name: "red" }),
        makeSpool("spoolman", "2", { material: "Silk PLA", name: "gold" }),
        makeSpool("spoolman", "3", { material: "Nylon" }),
      ]),
    ],
  ]);
  const memory = memoryStore(accepted);
  const controller = new CleanupController(results, memory.store, () => "2026-06-01");
  controller.refresh();
  return { results, controller, memory };
}

describe("CleanupController", () => {
  test("counts proposals by confidence and starts with nothing decided", () => {
    const { controller } = setup();
    expect(controller.counts()).toEqual({
      total: 5,
      safe: 2,
      review: 3,
      accepted: 0,
      rejected: 0,
      pending: 5,
      notApplicable: 0,
      warnings: 0,
    });
    expect(controller.acceptedEntries()).toEqual([]);
  });

  test("accepting all safe proposals is saved and can be undone", () => {
    const { controller, memory } = setup();
    expect(controller.acceptAllSafe()).toBe(2);
    expect(controller.counts().accepted).toBe(2);
    expect(memory.state.saved.map((entry) => `${entry.spoolKey}#${entry.field}`).sort()).toEqual([
      "spoolman:1#name",
      "spoolman:1#vendor",
    ]);
    expect(controller.undoLabel()).toContain("safe");
    expect(controller.undo()).toContain("safe");
    expect(controller.counts().accepted).toBe(0);
    expect(memory.state.saved).toEqual([]);
    expect(controller.undo()).toBeNull();
  });

  test("a bundle is accepted and rejected as a whole", () => {
    const { controller } = setup();
    expect(controller.accept(["spoolman:2#material"])).toBe(2);
    expect(controller.counts().accepted).toBe(2);
    expect(controller.reject(["spoolman:2#name"])).toBe(2);
    expect(controller.counts()).toMatchObject({ accepted: 0, rejected: 2 });
    expect(controller.reset(["spoolman:2#material"])).toBe(2);
    expect(controller.counts().rejected).toBe(0);
  });

  test("rejected proposals are skipped by accept all safe", () => {
    const { controller } = setup();
    controller.reject(["spoolman:1#vendor"]);
    expect(controller.acceptAllSafe()).toBe(1);
    expect(controller.counts()).toMatchObject({ accepted: 1, rejected: 1 });
    expect(controller.clearChoices()).toBe(2);
    expect(controller.counts().pending).toBe(5);
  });

  test("filters narrow the list and groups follow rule order", () => {
    const { controller } = setup();
    controller.setFilter({ confidence: "review" });
    expect(controller.visible()).toHaveLength(3);
    controller.setFilter({ confidence: "all", rule: "material-variant" });
    expect(controller.visible().map((proposal) => proposal.id)).toEqual([
      "spoolman:2#material",
      "spoolman:2#name",
    ]);
    controller.setFilter({ rule: "all" });
    expect(controller.grouped().map((group) => [group.rule, group.proposals.length])).toEqual([
      ["casing", 2],
      ["material", 1],
      ["material-variant", 2],
    ]);
    // "Accept all safe" respects the filter.
    controller.setFilter({ confidence: "review" });
    expect(controller.acceptAllSafe()).toBe(0);
  });

  test("turning a rule off removes its proposals and is remembered", () => {
    const { controller, memory } = setup();
    controller.setFilter({ rule: "casing" });
    controller.setRule("casing", false);
    expect(memory.state.settings.enabled).not.toContain("casing");
    expect(controller.filter.rule).toBe("all");
    expect(controller.result.proposals.some((proposal) => proposal.rules.includes("casing"))).toBe(
      false,
    );
    controller.setRule("casing", true);
    expect(memory.state.settings.enabled).toEqual([...CLEANUP_RULE_IDS]);
    expect(controller.counts().total).toBe(5);
  });

  test("an accepted change is dropped when the data it was made for changes", () => {
    const { controller, results } = setup();
    controller.accept(["spoolman:1#vendor", "spoolman:1#name"]);
    results.set(
      "spoolman",
      result("spoolman", [makeSpool("spoolman", "1", { vendor: "ESUN 3D", name: "red" })]),
    );
    controller.refresh();
    expect(controller.dropped).toBe(1);
    expect(controller.acceptedEntries().map((entry) => entry.field)).toEqual(["name"]);
  });

  test("saved choices are restored for loaded services and kept for the others", () => {
    const saved: AcceptedCleanup[] = [
      { spoolKey: "spoolman:1", field: "vendor", before: "esun", after: "eSUN" },
      { spoolKey: "spoolio:9", field: "vendor", before: "x", after: "Y" },
    ];
    const { controller, memory } = setup(saved);
    expect(controller.counts().accepted).toBe(1);
    expect(memory.state.saved).toHaveLength(2);
    expect(memory.state.saved.map((entry) => entry.spoolKey).sort()).toEqual([
      "spoolio:9",
      "spoolman:1",
    ]);
  });

  test("changes a service cannot take can be seen and rejected but not accepted", () => {
    const results = new Map<SourceId, LoadResult>([
      ["spoolstock", result("spoolstock", [makeSpool("spoolstock", "S1", { vendor: "esun" })])],
    ]);
    const controller = new CleanupController(results, memoryStore().store, () => "2026-06-01");
    controller.refresh();
    expect(controller.counts()).toMatchObject({ total: 1, notApplicable: 1, pending: 0 });
    expect(controller.accept(["spoolstock:S1#vendor"])).toBe(0);
    expect(controller.acceptAllSafe()).toBe(0);
    expect(controller.reject(["spoolstock:S1#vendor"])).toBe(1);
  });

  test("reports duplicates that only appear after accepted cleanups", () => {
    const results = new Map<SourceId, LoadResult>([
      [
        "spoolman",
        result("spoolman", [
          makeSpool("spoolman", "1", { vendor: "Prusament", name: "Orange", remainingWeight: 500 }),
          makeSpool("spoolman", "2", {
            vendor: "Prusament Inc",
            name: "Orange",
            remainingWeight: 500,
          }),
        ]),
      ],
    ]);
    const controller = new CleanupController(results, memoryStore().store, () => "2026-06-01");
    controller.refresh();
    expect(controller.newDuplicates()).toEqual([]);
    controller.accept(["spoolman:2#vendor"]);
    expect(controller.newDuplicates().map((group) => group.spools.length)).toEqual([2]);
  });

  test("nothing loaded gives an empty, harmless state", () => {
    const controller = new CleanupController(new Map(), memoryStore().store, () => "2026-06-01");
    controller.refresh();
    expect(controller.counts().total).toBe(0);
    expect(controller.grouped()).toEqual([]);
    expect(controller.acceptAllSafe()).toBe(0);
    expect(controller.undo()).toBeNull();
  });
});
