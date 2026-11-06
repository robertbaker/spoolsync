import { expect, mock, test } from "bun:test";

import { ApplyReloadError } from "@spoolsync/core/apply";
import type { PlannedUpdate } from "@spoolsync/core/core/compare";
import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";
import {
  buildRollback,
  createEmptyInventory,
  type RollbackDocument,
} from "@spoolsync/core/workflow";

import { ApplyController, type ApplyTarget, type RollbackHook } from "./apply-controller";

async function fixture() {
  const inventory = {
    ...(await createEmptyInventory("spoolman")),
    origin: "api" as const,
    connectionId: "https://spoolman.test",
  };
  const loaded = new Map<SourceId, LoadResult>([["spoolman", inventory]]);
  const log = [{ groupId: "one", ok: true, message: "Updated" }];
  const apply = mock<ApplyTarget["apply"]>(async (_changes, progress) => {
    progress(1, 1);
    return { log, inventory: { ...inventory } };
  });
  const target = { identity: inventory.connectionId, description: "Spoolman", apply };
  const connect = mock((): ApplyTarget | null => target);
  const onApplied = mock(() => {});
  const save = mock((_inventory: LoadResult) => {});
  const confirm = mock((_message: string, _details?: unknown) => true);
  const controller = new ApplyController(
    { spoolman: { changedMessage: "Reload changed server", connect } },
    { loaded, onApplied },
    save,
    confirm,
  );
  return {
    inventory,
    loaded,
    log,
    apply,
    target,
    connect,
    onApplied,
    save,
    confirm,
    controller,
    status: document.createElement("div"),
  };
}

test("rejects changed API targets before confirmation or writes", async () => {
  const f = await fixture();
  f.target.identity = "https://other.test";
  await f.controller.run("spoolman", [], f.status);
  expect(f.status.textContent).toContain("Reload changed server");
  expect(f.confirm).not.toHaveBeenCalled();
  expect(f.apply).not.toHaveBeenCalled();
  expect(f.save).not.toHaveBeenCalled();
});

test("resolves the current connection for each attempt and respects cancellation", async () => {
  const f = await fixture();
  f.connect.mockReturnValueOnce(null);
  await f.controller.run("spoolman", [], f.status);
  f.confirm.mockReturnValue(false);
  await f.controller.run("spoolman", [], f.status);
  expect(f.connect).toHaveBeenCalledTimes(2);
  expect(f.confirm).toHaveBeenCalledTimes(1);
  expect(f.apply).not.toHaveBeenCalled();
  expect(f.onApplied).not.toHaveBeenCalled();
});

test("reports progress, persists the refreshed inventory and retains logs", async () => {
  const f = await fixture();
  await f.controller.run("spoolman", [], f.status);
  expect(f.status.textContent).toContain("Applying… 1 of 1");
  expect(f.controller.logs.get("spoolman")).toEqual(f.log);
  expect(f.loaded.get("spoolman")).not.toBe(f.inventory);
  expect(f.save).toHaveBeenCalledWith(f.loaded.get("spoolman")!);
  expect(f.onApplied).toHaveBeenCalledTimes(1);
});

test("records failures and rerenders without replacing the previous inventory", async () => {
  const f = await fixture();
  f.apply.mockRejectedValue(new Error("Server unavailable"));
  await f.controller.run("spoolman", [], f.status);
  expect(f.controller.logs.get("spoolman")).toEqual([
    { groupId: "", ok: false, message: "Server unavailable" },
  ]);
  expect(f.loaded.get("spoolman")).toBe(f.inventory);
  expect(f.save).not.toHaveBeenCalled();
  expect(f.onApplied).toHaveBeenCalledTimes(1);
});

test("refresh failures retain completed write logs and the reload warning without saving a stale snapshot", async () => {
  const f = await fixture();
  const failure = new ApplyReloadError("Spoolman", f.log, new Error("Refresh offline"));
  f.apply.mockRejectedValue(failure);
  await f.controller.run("spoolman", [], f.status);
  expect(f.controller.logs.get("spoolman")).toEqual([
    ...f.log,
    { groupId: "", ok: false, message: failure.message },
  ]);
  expect(f.loaded.get("spoolman")).toBe(f.inventory);
  expect(f.save).not.toHaveBeenCalled();
  expect(f.onApplied).toHaveBeenCalledTimes(1);
});

const planned = (): PlannedUpdate => ({
  kind: "update",
  source: "spoolman",
  groupId: "g1",
  spool: makeSpool("spoolman", "1", { vendor: "Prusament", material: "PLA", name: "Galaxy" }),
  changes: [{ field: "density", from: null, to: 1.24 }],
  links: {},
});

async function withRollback(options: { enabled?: boolean; failSave?: boolean } = {}) {
  const f = await fixture();
  const saved: RollbackDocument[] = [];
  const hook: RollbackHook = {
    enabled: () => options.enabled ?? true,
    build: (source, changes, target) =>
      buildRollback(source, changes, { target, now: new Date("2026-11-04T10:00:00.000Z") }),
    save: (document) => {
      if (options.failSave) throw new Error("blocked");
      saved.push(document);
    },
  };
  const controller = new ApplyController(
    { spoolman: { changedMessage: "changed", connect: f.connect } },
    { loaded: f.loaded, onApplied: f.onApplied },
    f.save,
    f.confirm,
    undefined,
    hook,
  );
  return { ...f, controller, saved };
}

test("a rollback file is saved after the write is confirmed and before it is sent", async () => {
  const f = await withRollback();
  const order: string[] = [];
  f.apply.mockImplementation(async (_changes, progress) => {
    order.push(`apply (rollback saved: ${f.saved.length})`);
    progress(1, 1);
    return { log: f.log, inventory: { ...f.inventory } };
  });
  await f.controller.run("spoolman", [planned()], f.status);
  expect(order).toEqual(["apply (rollback saved: 1)"]);
  expect(f.saved[0]).toMatchObject({ source: "spoolman", target: "Spoolman" });
  expect(f.saved[0]!.updates[0]).toMatchObject({
    sourceId: "1",
    changes: [{ field: "density", before: null, after: 1.24 }],
  });
});

test("the confirmation is told the target, the change counts and whether a rollback is saved", async () => {
  const on = await withRollback();
  await on.controller.run("spoolman", [planned()], on.status);
  expect(on.confirm).toHaveBeenCalledWith("Write 1 change to Spoolman?", {
    target: "Spoolman",
    updates: 1,
    creations: 0,
    rollback: true,
  });

  const off = await withRollback({ enabled: false });
  await off.controller.run("spoolman", [planned()], off.status);
  expect(off.confirm.mock.calls[0]![1]).toMatchObject({ rollback: false });
});

test("nothing is saved when the person declines, or turned the file off", async () => {
  const declined = await withRollback();
  declined.confirm.mockReturnValue(false);
  await declined.controller.run("spoolman", [planned()], declined.status);
  expect(declined.saved).toEqual([]);

  const off = await withRollback({ enabled: false });
  await off.controller.run("spoolman", [planned()], off.status);
  expect(off.saved).toEqual([]);
  expect(off.apply).toHaveBeenCalledTimes(1);
});

test("if the rollback file cannot be saved, nothing is written", async () => {
  const f = await withRollback({ failSave: true });
  await f.controller.run("spoolman", [planned()], f.status);
  expect(f.status.textContent).toContain("Nothing was written");
  expect(f.apply).not.toHaveBeenCalled();
  expect(f.onApplied).not.toHaveBeenCalled();
});
