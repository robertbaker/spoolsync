import { expect, test } from "bun:test";

import { ApplyReloadError } from "@spoolsync/core/apply";

import { ExecutionError, executeWrites } from "./execution";
import { ExportCommitError } from "./output";

const log = [{ groupId: "group", ok: true, message: "Created" }];

test("applies, commits, and cleans up in order", async () => {
  const order: string[] = [];
  const result = await executeWrites(
    {
      async commit() {
        order.push("commit");
        return ["inventory.json"];
      },
      async cleanup() {
        order.push("cleanup");
      },
    },
    async () => {
      order.push("apply");
      return log;
    },
  );
  expect(order).toEqual(["apply", "commit", "cleanup"]);
  expect(result).toEqual({ applied: log, written: ["inventory.json"] });
});

test("refresh failures retain apply logs, skip file commit, and clean up", async () => {
  const order: string[] = [];
  await expect(
    executeWrites(
      {
        async commit() {
          order.push("commit");
          return [];
        },
        async cleanup() {
          order.push("cleanup");
        },
      },
      async () => {
        throw new ApplyReloadError("Spoolman", log, new Error("offline"));
      },
    ),
  ).rejects.toMatchObject({ applied: log, written: [], name: "ExecutionError" });
  expect(order).toEqual(["cleanup"]);
});

test("file commit failures retain remote results and completed files", async () => {
  let cleaned = false;
  const cause = new ExportCommitError(["first.json"], new Error("disk full"));
  await expect(
    executeWrites(
      {
        async commit() {
          throw cause;
        },
        async cleanup() {
          cleaned = true;
        },
      },
      async () => log,
    ),
  ).rejects.toMatchObject({ applied: log, written: ["first.json"], cause });
  expect(cleaned).toBe(true);
});

test("cleanup failure does not hide the original error", async () => {
  const primary = new Error("primary failure");
  const cleanup = new Error("cleanup failure");
  await expect(
    executeWrites(
      {
        async commit() {
          throw primary;
        },
        async cleanup() {
          throw cleanup;
        },
      },
      async () => log,
    ),
  ).rejects.toMatchObject({
    cause: primary,
    cleanupError: cleanup,
    applied: log,
    written: [],
    message: "primary failure Staging cleanup also failed: cleanup failure",
  });
});

test("cleanup failure after success still reports completed work", async () => {
  await expect(
    executeWrites(
      {
        async commit() {
          return ["complete.json"];
        },
        async cleanup() {
          throw new Error("cleanup failure");
        },
      },
      async () => log,
    ),
  ).rejects.toMatchObject({
    applied: log,
    written: ["complete.json"],
    message: "cleanup failure",
  });
});

test("dry runs need no staged files or apply callback", async () => {
  expect(await executeWrites(undefined)).toEqual({ applied: undefined, written: [] });
  expect(new ExecutionError("failure", undefined, []).cause).toBe("failure");
});
