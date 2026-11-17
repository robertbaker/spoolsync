import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { PlannedUpdate } from "@spoolsync/core/core/compare";
import type { LoadResult } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";
import { buildRollback, serializeRollback } from "@spoolsync/core/workflow";

import { parseArgs } from "./args";
import { ExecutionError } from "./execution";
import { runRestore, writeRollbackFile } from "./rollback";
import { defaultDependencies, type CliDependencies, type CliOutput } from "./runtime";

const update: PlannedUpdate = {
  kind: "update",
  source: "spoolman",
  groupId: "g1",
  spool: makeSpool("spoolman", "1", { vendor: "Prusament", material: "PLA", name: "Galaxy" }),
  changes: [{ field: "name", from: "Old", to: "Galaxy" }],
  links: {},
};

function fixture(failure: Error) {
  const document = buildRollback("spoolman", [update], {
    target: "Spoolman",
    now: new Date("2026-11-04T10:00:00.000Z"),
  });
  const inventory: LoadResult = {
    source: "spoolman",
    spools: [makeSpool("spoolman", "1", { vendor: "Prusament", material: "PLA", name: "Galaxy" })],
    warnings: [],
    loadedAt: "now",
    origin: "api",
  };
  const dependencies: CliDependencies = {
    ...defaultDependencies,
    readText: async () => serializeRollback(document),
    saveRollback: async () => "saved-rollback.json",
    remoteServices: () => [
      {
        source: "spoolman",
        label: "Spoolman",
        load: async () => inventory,
        apply: async () => {
          throw failure;
        },
      },
    ],
  };
  const output: CliOutput = { log() {}, warn() {}, error() {}, setExitCode() {} };
  const options = parseArgs([
    "--restore-rollback",
    "old.json",
    "--spoolman-url",
    "https://spoolman.test",
    "--apply",
    "--json",
  ]);
  return { dependencies, output, options };
}

test("any restore failure names the rollback file that was saved before writing", async () => {
  const f = fixture(new Error("Connection lost"));
  const error = await runRestore(f.options, f.dependencies, f.output).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ExecutionError);
  expect(error).toMatchObject({
    message: "Connection lost",
    rollbackFiles: ["saved-rollback.json"],
    applied: [],
  });
});

test("restore accepts a UTF-8 BOM before the rollback JSON", async () => {
  const f = fixture(new Error("not used in a dry run"));
  const readText = f.dependencies.readText;
  f.dependencies.readText = async (filename) => `\uFEFF${await readText(filename)}`;
  f.options.apply = false;
  const reports: string[] = [];
  f.output.log = (...values) => reports.push(values.join(" "));

  expect(runRestore(f.options, f.dependencies, f.output)).resolves.toHaveLength(1);
  expect(JSON.parse(reports[0]!).report).toBe("rollback");
});

test("rollback files with the same source and timestamp do not overwrite each other", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "spoolsync-rollbacks-"));
  try {
    const first = buildRollback("spoolman", [update], {
      target: "Spoolman",
      now: new Date("2026-11-04T10:00:00.000Z"),
    });
    const secondChange: PlannedUpdate = {
      ...update,
      changes: [{ field: "name", from: "Old", to: "Different" }],
    };
    const second = buildRollback("spoolman", [secondChange], {
      target: "Spoolman",
      now: new Date("2026-11-04T10:00:00.000Z"),
    });
    const firstFile = await writeRollbackFile(first, { rollbackDir: directory });
    const secondFile = await writeRollbackFile(second, { rollbackDir: directory });

    expect(firstFile).not.toBe(secondFile);
    expect(await readdir(directory)).toHaveLength(2);
    expect(await readFile(firstFile, "utf8")).toBe(serializeRollback(first));
    expect(await readFile(secondFile, "utf8")).toBe(serializeRollback(second));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
