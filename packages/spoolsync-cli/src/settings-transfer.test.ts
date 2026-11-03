import { expect, test } from "bun:test";

import { buildExportDocument, parseImportDocument } from "./settings-transfer";

// A document in exactly the shape the browser's "Export settings" writes.
const browserExport = JSON.stringify({
  format: "spoolsync-settings",
  version: 1,
  exportedAt: "2026-11-03T12:00:00.000Z",
  entries: {
    "spoolsync:low-stock-percent": "30",
    "spoolsync:prefs": '{"lowOnly":true}',
    "spoolsync:open-panels": '["spoolio"]',
  },
});

test("a browser export gives the CLI its low-stock threshold and reports the rest as skipped", () => {
  const { settings, skipped } = parseImportDocument(browserExport, "web.json");
  expect(settings).toEqual({ "low-threshold": 30 });
  expect(skipped.sort()).toEqual(["spoolsync:open-panels", "spoolsync:prefs"]);
});

test("a CLI export carries the browser's key for the shared setting plus the CLI's own file", () => {
  const text = buildExportDocument(
    { spoolio: "/a.json", "output-dir": "/out", "low-threshold": 25 },
    new Date("2026-11-03T12:00:00Z"),
  );
  const document = JSON.parse(text);
  expect(document).toMatchObject({
    format: "spoolsync-settings",
    version: 1,
    exportedAt: "2026-11-03T12:00:00.000Z",
    entries: { "spoolsync:low-stock-percent": "25" },
    cli: { spoolio: "/a.json", "output-dir": "/out", "low-threshold": 25 },
  });
  // And the CLI can read its own export back, exactly.
  expect(parseImportDocument(text).settings).toEqual({
    spoolio: "/a.json",
    "output-dir": "/out",
    "low-threshold": 25,
  });
});

test("the CLI's own section wins over the browser entry, which only fills a gap", () => {
  const { settings } = parseImportDocument(
    JSON.stringify({
      format: "spoolsync-settings",
      version: 1,
      entries: { "spoolsync:low-stock-percent": "50" },
      cli: { "low-threshold": 10, "output-dir": "/out" },
    }),
  );
  expect(settings).toEqual({ "low-threshold": 10, "output-dir": "/out" });
  const filled = parseImportDocument(
    JSON.stringify({
      format: "spoolsync-settings",
      version: 1,
      entries: { "spoolsync:low-stock-percent": "50" },
      cli: { "output-dir": "/out" },
    }),
  );
  expect(filled.settings).toEqual({ "output-dir": "/out", "low-threshold": 50 });
});

test("an export with no settings still has a valid shape, and unusable files are refused clearly", () => {
  expect(JSON.parse(buildExportDocument(null))).toMatchObject({
    format: "spoolsync-settings",
    entries: {},
  });
  expect(() => parseImportDocument("{nope", "x.json")).toThrow("x.json is not valid JSON");
  expect(() => parseImportDocument("[]", "x.json")).toThrow("not a SpoolSync settings export");
  expect(() => parseImportDocument('{"format":"other"}', "x.json")).toThrow(
    "not a SpoolSync settings export",
  );
  expect(() =>
    parseImportDocument('{"format":"spoolsync-settings","version":2,"entries":{}}', "x.json"),
  ).toThrow("export version 2");
  expect(() =>
    parseImportDocument(
      '{"format":"spoolsync-settings","version":1,"entries":{"spoolsync:prefs":"{}"}}',
      "x.json",
    ),
  ).toThrow("nothing the CLI can use");
  expect(() =>
    parseImportDocument('{"format":"spoolsync-settings","version":1,"cli":[]}', "x.json"),
  ).toThrow('"cli" section that is not an object');
});

test("a planted secret or unknown key in the CLI section is refused like in a config file", () => {
  const withKey = (key: string) =>
    JSON.stringify({ format: "spoolsync-settings", version: 1, cli: { [key]: "x" } });
  expect(() => parseImportDocument(withKey("spoolman-token"), "x.json")).toThrow(
    "looks like a secret",
  );
  expect(() => parseImportDocument(withKey("not-a-key"), "x.json")).toThrow(
    'unknown key "not-a-key"',
  );
});
