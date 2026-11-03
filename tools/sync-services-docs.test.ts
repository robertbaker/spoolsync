import { expect, test } from "bun:test";
import { resolve } from "node:path";

import { SOURCE_IDS } from "../packages/spoolsync-core/src/core/model";
import { countWord } from "../packages/spoolsync-core/src/core/services";
import { SERVICE_VIEWS } from "../src/lib/services";
import { OPTION_SPECS } from "../packages/spoolsync-cli/src/completion";
import { GENERATORS, renderRegions, syncDocs, unknownRegions } from "./sync-services-docs";

const root = resolve(import.meta.dir, "..");

test("the committed docs match the registry", async () => {
  const results = await syncDocs(root, true);
  expect(results.filter((result) => result.changed).map((result) => result.file)).toEqual([]);
  expect(results.every((result) => result.regions.length > 0)).toBe(true);
});

test("the capability table has one row per source id", () => {
  const rows = GENERATORS[""]!().split("\n").slice(2);
  expect(rows).toHaveLength(SOURCE_IDS.length);
  for (const service of SERVICE_VIEWS) {
    expect(rows.some((row) => row.includes(service.fullName))).toBe(true);
  }
});

test("block regions are rewritten between their markers and inline regions stay on the line", () => {
  const text = [
    "Before",
    "<!-- services:start -->",
    "stale",
    "<!-- services:end -->",
    "There are <!-- services:count-inline:start -->two<!-- services:count-inline:end --> tools.",
    "After",
  ].join("\n");
  const { text: next, regions } = renderRegions(text);
  expect(regions.sort()).toEqual(["count-inline", "table"]);
  expect(next).not.toContain("stale");
  expect(next).toContain("| Service");
  expect(next).toContain(`There are ${countWord(SOURCE_IDS.length)} tools.`);
  expect(next.startsWith("Before\n<!-- services:start -->\n| ")).toBe(true);
  expect(renderRegions(next).text).toBe(next);
});

test("text without markers is left alone, and unknown markers are reported", () => {
  expect(renderRegions("plain").text).toBe("plain");
  expect(unknownRegions("<!-- services:nope:start -->x<!-- services:nope:end -->")).toEqual(["nope"]);
  expect(unknownRegions("<!-- services:start -->x<!-- services:end -->")).toEqual([]);
});

test("generated names escape pipes so table cells stay intact", () => {
  for (const line of GENERATORS[""]!().split("\n")) {
    expect(line.replace(/\\\|/g, "").split("|").length).toBe(7);
  }
});

test("every CLI option named in the registry is a real CLI option", () => {
  const flags = new Set(OPTION_SPECS.map((option) => option.flag));
  for (const service of SERVICE_VIEWS) {
    expect(flags.has(service.cliFlag)).toBe(true);
    if (service.cliApiFlag) expect(flags.has(service.cliApiFlag)).toBe(true);
    for (const alias of service.cliAliases) expect(flags.has(alias)).toBe(true);
  }
});
