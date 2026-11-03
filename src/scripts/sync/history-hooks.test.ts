import { expect, mock, test } from "bun:test";

import { ApplyReloadError } from "@spoolsync/core/apply";
import type { PlannedChange } from "@spoolsync/core/core/compare";
import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { createEmptyInventory } from "@spoolsync/core/workflow";

import type { SyncHistoryRecord } from "~/lib/browser/storage/sync-history";

import { ApplyController, type ApplyTarget } from "./apply-controller";
import { DownloadController } from "./download-controller";

const changes = [
  { kind: "update" },
  { kind: "update" },
  { kind: "create" },
] as unknown as PlannedChange[];

async function applyFixture(record: (entry: SyncHistoryRecord) => void) {
  const inventory = {
    ...(await createEmptyInventory("spoolman")),
    origin: "api" as const,
    connectionId: "https://spoolman.test",
  };
  const loaded = new Map<SourceId, LoadResult>([["spoolman", inventory]]);
  const apply = mock<ApplyTarget["apply"]>(async () => ({
    log: [
      { groupId: "a", ok: true, message: "ok" },
      { groupId: "b", ok: true, message: "ok" },
      { groupId: "c", ok: false, message: "nope" },
    ],
    inventory: { ...inventory },
  }));
  const target = { identity: inventory.connectionId, description: "Spoolman", apply };
  const confirm = mock((_message: string) => true);
  const controller = new ApplyController(
    { spoolman: { changedMessage: "changed", connect: () => target } },
    { loaded, onApplied: () => {} },
    () => {},
    confirm,
    record,
  );
  return { controller, apply, confirm, status: document.createElement("div") };
}

test("an API apply is recorded with planned counts and per-change results", async () => {
  const record = mock((_entry: SyncHistoryRecord) => {});
  const f = await applyFixture(record);
  await f.controller.run("spoolman", changes, f.status);
  expect(record).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenCalledWith({
    source: "spoolman",
    via: "api",
    updates: 2,
    creations: 1,
    succeeded: 2,
    failed: 1,
  });
});

test("a cancelled apply or a changed target writes nothing and records nothing", async () => {
  const record = mock((_entry: SyncHistoryRecord) => {});
  const f = await applyFixture(record);
  f.confirm.mockReturnValue(false);
  await f.controller.run("spoolman", changes, f.status);
  expect(record).not.toHaveBeenCalled();
});

test("a failed apply is recorded with its error, and refresh failures keep write counts", async () => {
  const record = mock((_entry: SyncHistoryRecord) => {});
  const f = await applyFixture(record);
  f.apply.mockRejectedValueOnce(new Error("Server\nunavailable"));
  await f.controller.run("spoolman", changes, f.status);
  expect(record).toHaveBeenLastCalledWith({
    source: "spoolman",
    via: "api",
    updates: 2,
    creations: 1,
    succeeded: 0,
    failed: 1,
    error: "Server unavailable",
  });
  f.apply.mockRejectedValueOnce(
    new ApplyReloadError("Spoolman", [{ groupId: "a", ok: true, message: "ok" }], new Error("x")),
  );
  await f.controller.run("spoolman", changes, f.status);
  expect(record.mock.calls.at(-1)![0]).toMatchObject({ succeeded: 1, failed: 1 });
});

test("a throwing history callback never hides the apply result", async () => {
  const f = await applyFixture(() => {
    throw new Error("storage full");
  });
  await f.controller.run("spoolman", changes, f.status);
  expect(f.controller.logs.get("spoolman")).toHaveLength(3);
});

function downloadFixture(record: (entry: SyncHistoryRecord) => void) {
  const exportInventory = mock(async () => ({
    source: "filameter" as const,
    text: "{}",
    mediaType: "application/json",
    total: 3,
    updated: 2,
    created: 1,
    warnings: [],
  }));
  const controller = new DownloadController({
    exportInventory,
    download: () => {},
    today: () => "2026-11-03",
    record,
  });
  const inventory: LoadResult = { source: "filameter", spools: [], warnings: [], loadedAt: "now" };
  return { controller, exportInventory, inventory, status: document.createElement("div") };
}

test("a download is recorded as a file, success and failure", async () => {
  const record = mock((_entry: SyncHistoryRecord) => {});
  const f = downloadFixture(record);
  await f.controller.run("filameter", () => f.inventory, changes, f.status);
  expect(record).toHaveBeenLastCalledWith({
    source: "filameter",
    via: "download",
    updates: 2,
    creations: 1,
    succeeded: 3,
    failed: 0,
  });
  f.exportInventory.mockRejectedValueOnce(new Error("Cannot export"));
  await f.controller.run("filameter", () => f.inventory, changes, f.status);
  expect(record).toHaveBeenLastCalledWith({
    source: "filameter",
    via: "download",
    updates: 2,
    creations: 1,
    succeeded: 0,
    failed: 3,
    error: "Cannot export",
  });
});
