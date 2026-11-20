import { expect, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import { parseArgs } from "./args";
import { ExecutionError } from "./execution";
import { createCliPlan } from "./planning";
import { reportError, reportInventoryOnly, reportWorkflow } from "./report";
import type { CliOutput } from "./runtime";

function capture(tty?: { isTTY?: boolean; stderrIsTTY?: boolean }) {
  const stdout: unknown[][] = [],
    stderr: unknown[][] = [];
  let code = 0;
  const output: CliOutput = {
    log: (...values) => {
      stdout.push(values);
    },
    warn: (...values) => {
      stderr.push(values);
    },
    error: (...values) => {
      stderr.push(values);
    },
    setExitCode: (value) => {
      code = value;
    },
    ...tty,
  };
  return { output, stdout, stderr, code: () => code };
}

test("text comparisons expose unresolved fields and distinguish plans from results", () => {
  const options = parseArgs([
    "--spoolman",
    "one.json",
    "--spoolio",
    "two.json",
    "--confirm",
    "spoolman:1,spoolio:2",
  ]);
  const loaded = new Map<SourceId, LoadResult>([
    [
      "spoolman",
      {
        source: "spoolman",
        spools: [makeSpool("spoolman", "1", { material: "PLA" })],
        warnings: [],
        loadedAt: "now",
      },
    ],
    [
      "spoolio",
      {
        source: "spoolio",
        spools: [makeSpool("spoolio", "2", { material: "PETG" })],
        warnings: [],
        loadedAt: "now",
      },
    ],
  ]);
  const planning = createCliPlan(options, loaded);
  const report = { loaded, planning, applied: undefined, written: [], exportWarnings: [] };
  const text = capture();
  reportWorkflow(options, report, text.output);
  const rendered = text.stdout.flat().join("\n");
  expect(rendered).toContain("Planned changes");
  expect(rendered).toContain("Spoolman (spoolman)");
  expect(rendered).toContain("Spoolio (spoolio)");
  expect(rendered).toContain("Preview; add --output-dir");
  expect(rendered).toContain("Write target");
  expect(rendered).toContain("Unresolved fields");
  expect(rendered).toContain(`${planning.summary.unresolved[0]!.group}: material`);
  expect(rendered).toContain("across all groups");
  expect(rendered).toContain('spoolman: "PLA"');
  expect(rendered).toContain('spoolio: "PETG"');
  expect(rendered).toContain("Dry run only");
  expect(rendered).toContain("Add --output-dir <dir>");
  expect(rendered).not.toContain("Add --apply");
  const csv = capture();
  reportWorkflow(
    { ...options, exportCsv: "all.csv" },
    { ...report, written: ["all.csv"] },
    csv.output,
  );
  const csvText = csv.stdout.flat().join("\n");
  expect(csvText).toContain("Exported 2 spools to all.csv");
  expect(csvText).toContain("No remote services were modified.");
  expect(csvText).not.toContain("Dry run only");
  const api = capture();
  const remoteLoaded = new Map(loaded);
  remoteLoaded.set("spoolman", { ...loaded.get("spoolman")!, origin: "api" });
  reportWorkflow(
    { ...options, inputs: new Map([["spoolio", "two.json"]]) },
    { ...report, loaded: remoteLoaded },
    api.output,
  );
  const apiText = api.stdout.flat().join("\n");
  expect(apiText).toContain("Preview; add --apply");
  expect(apiText).toContain("Add --apply to write planned changes to: spoolman.");
  expect(apiText).toContain("write inventory files for: spoolio.");
  const json = capture();
  reportWorkflow({ ...options, json: true }, report, json.output);
  expect(json.stdout).toHaveLength(1);
  expect(JSON.parse(String(json.stdout[0]![0])).unresolved).toEqual(planning.summary.unresolved);
});

test("partial failures print every result and recovery path without object inspection", () => {
  const captured = capture();
  reportError(
    new ExecutionError(
      new Error("Connection lost"),
      [
        { groupId: "first", ok: true, message: "Updated spool" },
        { groupId: "second", ok: false, message: "Request failed" },
      ],
      ["updated inventory.json"],
      undefined,
      ["rollback.json"],
    ),
    false,
    captured.output,
  );
  const rendered = captured.stderr.flat().join("\n");
  expect(rendered).toContain("1 succeeded, 1 failed");
  expect(rendered).toContain("OK  first: Updated spool");
  expect(rendered).toContain("FAILED  second: Request failed");
  expect(rendered).toContain("  updated inventory.json");
  expect(rendered).toContain("  rollback.json");
  expect(captured.stderr.flat().every((value) => typeof value === "string")).toBe(true);
  expect(captured.stdout).toEqual([]);
  expect(captured.code()).toBe(1);
});

test("match suggestions and unresolved conflicts include human-readable spool summaries", () => {
  const options = parseArgs(["--spoolman", "one.json", "--spoolio", "two.json"]);
  const loaded = new Map<SourceId, LoadResult>([
    [
      "spoolman",
      {
        source: "spoolman",
        spools: [
          makeSpool("spoolman", "1", {
            vendor: "Polymaker",
            material: "PLA",
            name: "Charcoal",
            colors: ["#222222"],
            remainingWeight: 750,
          }),
        ],
        warnings: [],
        loadedAt: "now",
      },
    ],
    [
      "spoolio",
      {
        source: "spoolio",
        spools: [
          makeSpool("spoolio", "2", {
            vendor: "Polymaker",
            material: "PLA",
            name: "Charcoal",
            colors: ["#222222"],
            remainingWeight: 700,
          }),
        ],
        warnings: [],
        loadedAt: "now",
      },
    ],
  ]);
  const planning = createCliPlan(options, loaded);
  const text = capture();
  reportWorkflow(
    options,
    { loaded, planning, applied: undefined, written: [], exportWarnings: [] },
    text.output,
  );
  const rendered = text.stdout.flat().join("\n");
  expect(rendered).toContain("Match suggestion: spoolman:1,spoolio:2");
  expect(rendered).toContain("Polymaker PLA Charcoal 750g ↔ Polymaker PLA Charcoal 700g");
});

test("stdout and stderr TTY flags independently gate ANSI colors and style table cells", () => {
  const options = parseArgs([
    "--spoolman",
    "one.json",
    "--spoolio",
    "two.json",
    "--confirm",
    "spoolman:1,spoolio:2",
  ]);
  const loaded = new Map<SourceId, LoadResult>([
    [
      "spoolman",
      {
        source: "spoolman",
        spools: [makeSpool("spoolman", "1", { material: "PLA", remainingWeight: 700 })],
        warnings: ["check spoolman"],
        loadedAt: "now",
      },
    ],
    [
      "spoolio",
      {
        source: "spoolio",
        spools: [makeSpool("spoolio", "2", { material: "PLA" })],
        warnings: [],
        loadedAt: "now",
      },
    ],
  ]);
  const planning = createCliPlan(options, loaded);
  const report = { loaded, planning, applied: undefined, written: [], exportWarnings: [] };

  const plain = capture({ isTTY: false, stderrIsTTY: false });
  reportWorkflow(options, report, plain.output);
  const plainStdout = plain.stdout.flat().join("\n");

  const stdoutOnly = capture({ isTTY: true, stderrIsTTY: false });
  reportWorkflow(options, report, stdoutOnly.output);
  const stdoutColored = stdoutOnly.stdout.flat().join("\n");
  const stderrPlain = stdoutOnly.stderr.flat().join("\n");
  expect(stdoutColored).toContain("\x1b[");
  expect(Bun.stripANSI(stdoutColored)).toBe(plainStdout);
  expect(stdoutColored).toContain("\x1b[2mPreview; add --output-dir\x1b[22m");
  expect(stderrPlain).not.toContain("\x1b[");

  const stderrOnly = capture({ isTTY: false, stderrIsTTY: true });
  reportWorkflow(options, report, stderrOnly.output);
  expect(stderrOnly.stdout.flat().join("\n")).toBe(plainStdout);
  expect(stderrOnly.stderr.flat().join("\n")).toContain("\x1b[33mWarning (spoolman):");

  const inv = capture({ isTTY: false, stderrIsTTY: true });
  reportInventoryOnly(parseArgs(["--spoolman", "one.json", "--summary"]), loaded, [], inv.output);
  expect(inv.stdout.flat().join("\n")).not.toContain("\x1b[");
  expect(inv.stderr.flat().join("\n")).toContain("\x1b[33mWarning (spoolman):");
});
