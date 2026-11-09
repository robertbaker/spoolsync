import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseArgs } from "./parse-args";

let folder: string;
beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), "spoolsync-defaults-"));
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

function parseWith(saved: Record<string, unknown>, args: string[]) {
  const file = path.join(folder, "config.json");
  writeFileSync(file, JSON.stringify(saved));
  return parseArgs(args, { userConfig: { path: file } });
}

const compare = ["--spoolman", "a.json", "--spoolio", "b.json"];

test("a saved threshold does not stop a comparison, and still applies to a summary", () => {
  expect(parseWith({ "low-threshold": 30 }, compare).lowThreshold).toBeUndefined();
  expect(
    parseWith({ "low-threshold": 30 }, ["--summary", "--spoolman", "a.json"]).lowThreshold,
  ).toBe(30);
});

test("saved rollback settings do not stop a dry run", () => {
  const options = parseWith({ "rollback-dir": "/saved", "no-rollback": true }, compare);
  expect(options.rollbackDir).toBeUndefined();
  expect(options.noRollback).toBe(false);
});

test("saved rollback settings still apply to --apply", () => {
  const options = parseWith({ "rollback-dir": "/saved" }, [
    "--spoolman-url",
    "http://spoolman.test",
    "--spoolio",
    "b.json",
    "--apply",
  ]);
  expect(options.rollbackDir).toBe("/saved");
});

test("saved plan options do not stop a report", () => {
  const options = parseWith(
    { "output-dir": "/out", "create-in": ["spoolio"], resolve: ["material=spoolman"] },
    ["--reorder", "--spoolman", "a.json"],
  );
  expect(options.outputDir).toBeUndefined();
  expect(options.createIn).toEqual([]);
  expect(options.resolves).toEqual([]);
});

test("saved choices about a service that is not loaded are left out", () => {
  const options = parseWith({ "create-in": ["spoolio", "tigertag"] }, compare);
  expect(options.createIn).toEqual(["spoolio"]);
});

test("saved inventories and options do not stop a rollback restore", () => {
  const options = parseWith(
    { spoolio: "/saved.json", "output-dir": "/out", cleanup: true, reference: "/ref.json" },
    ["--restore-rollback", "r.json", "--spoolman-url", "http://spoolman.test"],
  );
  expect(options.inputs.size).toBe(0);
  expect(options.outputDir).toBeUndefined();
  expect(options.cleanup).toBe(false);
  expect(options.reference).toBeUndefined();
});

test("the same option typed for this run is still refused", () => {
  expect(() => parseArgs([...compare, "--low-threshold", "30"])).toThrow(
    "--low-threshold applies to --summary and --reorder",
  );
  expect(() => parseArgs([...compare, "--rollback-dir", "/typed"])).toThrow(
    "--rollback-dir applies to --apply",
  );
});
