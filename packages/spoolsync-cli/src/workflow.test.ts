import { expect, test } from "bun:test";

import { ApplyReloadError } from "@spoolsync/core/apply";
import type { ApplyLogEntry, LoadResult } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import { parseArgs } from "./args";
import { defaultDependencies, type CliDependencies, type CliOutput } from "./runtime";
import { runWorkflow } from "./workflow";

function fixture() {
  const events: string[] = [];
  const stdout: unknown[][] = [],
    stderr: unknown[][] = [],
    warnings: unknown[][] = [];
  let exitCode = 0;
  const inventory: LoadResult = {
    source: "spoolman",
    spools: [makeSpool("spoolman", "1")],
    warnings: [],
    loadedAt: "now",
    origin: "api",
  };
  const log: ApplyLogEntry[] = [{ groupId: "one", ok: true, message: "Applied" }];
  const service = {
    source: "spoolman" as const,
    label: "Spoolman",
    async load() {
      events.push("load-remote");
      return inventory;
    },
    async apply(_changes: unknown, progress: (done: number, total: number) => void) {
      events.push("apply");
      progress(1, 1);
      return log;
    },
  };
  const dependencies: CliDependencies = {
    ...defaultDependencies,
    async createEmptyInventory(source) {
      events.push("load-empty");
      return defaultDependencies.createEmptyInventory(source);
    },
    remoteServices: () => [service],
    async exportInventory(...args) {
      events.push("serialize");
      return defaultDependencies.exportInventory(...args);
    },
    async validateOutputPaths() {
      events.push("validate-paths");
    },
    async stageOutputFiles(_directory, files) {
      events.push("stage");
      expect(files).toHaveLength(1);
      expect(JSON.parse(files[0]!.text).filaments).toHaveLength(1);
      return {
        async commit() {
          events.push("commit");
          return files.map((file) => file.filename);
        },
        async cleanup() {
          events.push("cleanup");
        },
      };
    },
  };
  const output: CliOutput = {
    log: (...values) => {
      stdout.push(values);
    },
    warn: (...values) => {
      warnings.push(values);
    },
    error: (...values) => {
      stderr.push(values);
    },
    setExitCode: (code) => {
      exitCode = code;
    },
  };
  const options = parseArgs([
    "--spoolman-url",
    "https://spoolman.test",
    "--empty",
    "spoolio",
    "--create-in",
    "spoolio",
    "--output-dir",
    "out",
    "--apply",
    "--json",
  ]);
  return {
    events,
    stdout,
    stderr,
    warnings,
    dependencies,
    output,
    options,
    service,
    log,
    exitCode: () => exitCode,
  };
}

test("CLI workflow serializes and stages exports before remote writes, commits, and cleanup", async () => {
  const f = fixture();
  await runWorkflow(f.options, f.dependencies, f.output);
  expect(f.events).toEqual([
    "load-empty",
    "load-remote",
    "serialize",
    "validate-paths",
    "stage",
    "apply",
    "commit",
    "cleanup",
  ]);
  const report = JSON.parse(String(f.stdout[0]![0]));
  expect(report.applied).toEqual(f.log);
  expect(report.written).toHaveLength(1);
  expect(report.changes.spoolio.creates).toBe(1);
  expect(f.stderr).toEqual([]);
  expect(f.warnings).toEqual([]);
  expect(f.exitCode()).toBe(0);
});

test("serialization failures stop CLI workflow before staging or remote writes", async () => {
  const f = fixture();
  f.dependencies.exportInventory = async () => {
    throw new Error("Cannot serialize");
  };
  expect(runWorkflow(f.options, f.dependencies, f.output)).rejects.toThrow("Cannot serialize");
  expect(f.events).toEqual(["load-empty", "load-remote"]);
  expect(f.stdout).toEqual([]);
});

test("remote refresh failures retain completed writes, skip file commits, and clean staging", async () => {
  const f = fixture();
  f.service.apply = async () => {
    f.events.push("apply");
    throw new ApplyReloadError("Spoolman", f.log, new Error("Refresh failed"));
  };
  expect(runWorkflow(f.options, f.dependencies, f.output)).rejects.toMatchObject({
    applied: f.log,
    written: [],
  });
  expect(f.events).toEqual([
    "load-empty",
    "load-remote",
    "serialize",
    "validate-paths",
    "stage",
    "apply",
    "cleanup",
  ]);
});

test("failed apply entries set a failing exit code while preserving the report and file commit", async () => {
  const f = fixture();
  f.log[0]!.ok = false;
  await runWorkflow(f.options, f.dependencies, f.output);
  expect(f.exitCode()).toBe(1);
  expect(f.events.slice(-2)).toEqual(["commit", "cleanup"]);
  expect(JSON.parse(String(f.stdout[0]![0])).applied[0].ok).toBe(false);
});

for (const refreshFailure of [false, true]) {
  test(`later service ${refreshFailure ? "refresh" : "apply"} failures retain all completed CLI writes`, async () => {
    const f = fixture();
    const laterLog = [{ groupId: "later", ok: true, message: "Created remotely" }];
    const failure = refreshFailure
      ? new ApplyReloadError("FilamentDB", laterLog, new Error("Refresh failed"))
      : new Error("Connection lost");
    f.dependencies.remoteServices = () => [
      f.service,
      {
        source: "filamentdb",
        label: "FilamentDB",
        load: async () => ({
          source: "filamentdb",
          spools: [],
          warnings: [],
          loadedAt: "now",
          origin: "api",
        }),
        apply: async () => {
          throw failure;
        },
      },
    ];
    expect(runWorkflow(f.options, f.dependencies, f.output)).rejects.toMatchObject({
      applied: [...f.log, ...(refreshFailure ? laterLog : [])],
      written: [],
      message: failure.message,
    });
    expect(f.events).toContain("cleanup");
    expect(f.events).not.toContain("commit");
    expect(f.stdout).toEqual([]);
  });
}
