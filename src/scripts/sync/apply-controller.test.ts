import { expect, mock, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { createEmptyInventory } from "@spoolsync/core/workflow";

import { ApplyController, type ApplyTarget } from "./apply-controller";

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
  const confirm = mock((_message: string) => true);
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
