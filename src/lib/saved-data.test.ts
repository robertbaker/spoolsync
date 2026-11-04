import { beforeEach, expect, test } from "bun:test";

import {
  BACKUP_FORMAT,
  BACKUP_LIMITS,
  backupFilename,
  createBackup,
  exportSettings,
  forgetEverything,
  forgetGroup,
  formatBytes,
  importSettings,
  inspectBackup,
  listSavedData,
  restoreBackup,
} from "./saved-data";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test("lists only groups that hold something, with sizes", () => {
  expect(listSavedData()).toEqual([]);
  localStorage.setItem("spoolsync:prefs", '{"lowOnly":true}');
  localStorage.setItem("spoolsync:chart-view", "brand");
  localStorage.setItem("unrelated", "keep me");
  sessionStorage.setItem("spoolsync:load:spoolio", "{}");
  const items = listSavedData();
  expect(items.map((item) => item.group.id)).toEqual(["preferences", "inventories"]);
  expect(items[0]!.keys.sort()).toEqual(["spoolsync:chart-view", "spoolsync:prefs"]);
  expect(items[0]!.bytes).toBeGreaterThan(20);
});

test("forgetting a group leaves the rest, and never touches other sites' keys", () => {
  localStorage.setItem("spoolsync:file-history", "{}");
  localStorage.setItem("spoolsync:match-decisions", "{}");
  localStorage.setItem("other-app", "x");
  expect(forgetGroup("files")).toBe(1);
  expect(localStorage.getItem("spoolsync:file-history")).toBeNull();
  expect(localStorage.getItem("spoolsync:match-decisions")).toBe("{}");
  expect(forgetGroup("files")).toBe(0);
  expect(forgetGroup("no-such-group")).toBe(0);
});

test("a session prefix group matches every loaded inventory", () => {
  sessionStorage.setItem("spoolsync:load:spoolio", "1");
  sessionStorage.setItem("spoolsync:load:spoolkeep", "2");
  sessionStorage.setItem("spoolsync:resolutions", "[]");
  expect(forgetGroup("inventories")).toBe(3);
});

test("forgetting everything clears all spoolsync keys, including ones no group names", () => {
  localStorage.setItem("spoolsync:prefs", "{}");
  localStorage.setItem("spoolsync:future-setting", "1");
  sessionStorage.setItem("spoolsync:load:spoolio", "{}");
  localStorage.setItem("other-app", "x");
  expect(forgetEverything()).toBe(3);
  expect(localStorage.getItem("other-app")).toBe("x");
  expect(listSavedData()).toEqual([]);
});

test("sizes are shown in plain units", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(2048)).toBe("2.0 KB");
});

test("exports portable settings only, never credentials or loaded inventories", () => {
  localStorage.setItem("spoolsync:prefs", '{"lowOnly":true}');
  localStorage.setItem("spoolsync:low-stock-percent", "30");
  localStorage.setItem("spoolsync:chart-view", "brand");
  localStorage.setItem("spoolsync:match-decisions", '{"confirmed":["a|b"],"rejected":[]}');
  localStorage.setItem("spoolsync:spoolman-connection", '{"baseUrl":"http://secret.local"}');
  localStorage.setItem("spoolsync:spoolman-token", "TOKEN");
  localStorage.setItem("spoolsync:tigertag-session", "SESSION");
  sessionStorage.setItem("spoolsync:load:spoolio", "{}");
  const text = exportSettings(new Date("2026-11-03T12:00:00Z"));
  const document = JSON.parse(text);
  expect(document).toMatchObject({
    format: "spoolsync-settings",
    version: 1,
    exportedAt: "2026-11-03T12:00:00.000Z",
  });
  expect(Object.keys(document.entries).sort()).toEqual([
    "spoolsync:chart-view",
    "spoolsync:low-stock-percent",
    "spoolsync:match-decisions",
    "spoolsync:prefs",
  ]);
  for (const secret of ["secret.local", "TOKEN", "SESSION", "load:spoolio"])
    expect(text).not.toContain(secret);
});

test("an export imports into a clean browser, round trip", () => {
  localStorage.setItem("spoolsync:prefs", '{"syncFilter":"open"}');
  localStorage.setItem("spoolsync:open-panels", '["spoolio"]');
  const text = exportSettings();
  localStorage.clear();
  const result = importSettings(text);
  expect(result.skipped).toEqual([]);
  expect(result.imported.sort()).toEqual(["spoolsync:open-panels", "spoolsync:prefs"]);
  expect(localStorage.getItem("spoolsync:prefs")).toBe('{"syncFilter":"open"}');
  expect(localStorage.getItem("spoolsync:open-panels")).toBe('["spoolio"]');
});

test("import skips credentials, unknown keys, and invalid values, and names them", () => {
  const result = importSettings(
    JSON.stringify({
      format: "spoolsync-settings",
      version: 1,
      entries: {
        "spoolsync:low-stock-percent": "30",
        "spoolsync:spoolman-token": "planted",
        "spoolsync:tigertag-session": "planted",
        "spoolsync:chart-view": "pie",
        "spoolsync:prefs": '{"nonsense":true}',
        "spoolsync:open-panels": "[1,2]",
        "spoolsync:match-decisions": 42,
        "other-app": "x",
      },
    }),
  );
  expect(result.imported).toEqual(["spoolsync:low-stock-percent"]);
  expect(result.skipped.sort()).toEqual([
    "other-app",
    "spoolsync:chart-view",
    "spoolsync:match-decisions",
    "spoolsync:open-panels",
    "spoolsync:prefs",
    "spoolsync:spoolman-token",
    "spoolsync:tigertag-session",
  ]);
  expect(localStorage.getItem("spoolsync:spoolman-token")).toBeNull();
  expect(localStorage.getItem("other-app")).toBeNull();
});

test("files that are not a settings export are refused with a clear reason", () => {
  expect(() => importSettings("{nope")).toThrow("not valid JSON");
  expect(() => importSettings("[]")).toThrow("not a SpoolSync settings export");
  expect(() => importSettings('{"format":"something-else"}')).toThrow(
    "not a SpoolSync settings export",
  );
  expect(() => importSettings('{"format":"spoolsync-settings","version":9,"entries":{}}')).toThrow(
    "version 9",
  );
  expect(() => importSettings('{"format":"spoolsync-settings","version":1}')).toThrow("no entries");
});

test("a settings export from the CLI imports here, using the shared low-stock setting", () => {
  const result = importSettings(
    JSON.stringify({
      format: "spoolsync-settings",
      version: 1,
      exportedAt: "2026-11-03T12:00:00.000Z",
      entries: { "spoolsync:low-stock-percent": "25" },
      // The CLI's own settings ride along; the browser has no use for them and ignores them.
      cli: {
        spoolio: "/home/ada/spoolio.json",
        "output-dir": "/home/ada/out",
        "low-threshold": 25,
      },
    }),
  );
  expect(result).toEqual({ imported: ["spoolsync:low-stock-percent"], skipped: [] });
  expect(localStorage.getItem("spoolsync:low-stock-percent")).toBe("25");
});

test("the watchlist is listed, forgettable, and portable, but inventory summaries never leave", () => {
  localStorage.setItem("spoolsync:watchlist", '["spoolio:1"]');
  localStorage.setItem(
    "spoolsync:inventory-snapshots",
    '{"spoolio":{"savedAt":"2026-11-03T10:00:00Z","spools":[["1",10,"Secret Blue"]]}}',
  );
  expect(listSavedData().map((item) => item.group.id)).toEqual(["snapshots", "watchlist"]);
  const text = exportSettings();
  expect(Object.keys(JSON.parse(text).entries)).toEqual(["spoolsync:watchlist"]);
  expect(text).not.toContain("Secret Blue");
  expect(forgetGroup("snapshots")).toBe(1);
  expect(forgetGroup("watchlist")).toBe(1);
  expect(listSavedData()).toEqual([]);
});

test("importing a watchlist keeps only valid values and refuses snapshots", () => {
  const document = (entries: Record<string, string>) =>
    JSON.stringify({ format: "spoolsync-settings", version: 1, entries });
  const result = importSettings(
    document({ "spoolsync:watchlist": '["spoolio:1"]', "spoolsync:inventory-snapshots": "{}" }),
  );
  expect(result.imported).toEqual(["spoolsync:watchlist"]);
  expect(result.skipped).toEqual(["spoolsync:inventory-snapshots"]);
  expect(importSettings(document({ "spoolsync:watchlist": '["nowhere:1"]' })).skipped).toEqual([
    "spoolsync:watchlist",
  ]);
});

test("stock history and label options are listed, forgettable, and portable only when valid", () => {
  const history = JSON.stringify({
    spoolman: [{ at: "2026-11-01T00:00:00.000Z", totalGrams: 900, spoolCount: 3 }],
  });
  localStorage.setItem("spoolsync:stock-history", history);
  localStorage.setItem(
    "spoolsync:label-options",
    JSON.stringify({ preset: "small", selection: "low" }),
  );
  localStorage.setItem("spoolsync:cost-view", "vendor");
  expect(listSavedData().map((item) => item.group.id)).toEqual(["preferences", "history"]);

  const exported = JSON.parse(exportSettings()) as { entries: Record<string, string> };
  expect(Object.keys(exported.entries).sort()).toEqual([
    "spoolsync:cost-view",
    "spoolsync:label-options",
    "spoolsync:stock-history",
  ]);

  expect(forgetGroup("history")).toBe(1);
  expect(localStorage.getItem("spoolsync:stock-history")).toBeNull();

  const result = importSettings(
    JSON.stringify({
      format: "spoolsync-settings",
      version: 1,
      entries: {
        "spoolsync:stock-history": history,
        "spoolsync:label-options": JSON.stringify({ preset: "huge", selection: "low" }),
        "spoolsync:cost-view": "nonsense",
      },
    }),
  );
  expect(result.imported).toEqual(["spoolsync:stock-history"]);
  expect(result.skipped.sort()).toEqual(["spoolsync:cost-view", "spoolsync:label-options"]);
});

test("a backup holds the new tare and sidebar settings but never credentials", () => {
  localStorage.setItem("spoolsync:weigh-in", '{"tares":{"bambulab":252}}');
  localStorage.setItem("spoolsync:sidebar", "collapsed");
  localStorage.setItem(
    "spoolsync:saved-views",
    JSON.stringify([{ id: "a", name: "PLA", material: "PLA" }]),
  );
  localStorage.setItem("spoolsync:spoolman-token", "TOKEN");
  localStorage.setItem("spoolsync:since-visit", "{}");
  localStorage.setItem("spoolsync:inventory-snapshots", "{}");
  const text = createBackup(new Date("2026-11-03T12:00:00Z"));
  const document = JSON.parse(text);
  expect(document).toMatchObject({
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: "2026-11-03T12:00:00.000Z",
  });
  expect(Object.keys(document.entries).sort()).toEqual([
    "spoolsync:saved-views",
    "spoolsync:sidebar",
    "spoolsync:weigh-in",
  ]);
  expect(text).not.toContain("TOKEN");
  expect(backupFilename(new Date("2026-11-03T23:00:00Z"))).toBe("spoolsync-backup-2026-11-03.json");
});

test("inspecting a backup reports what would be restored and why the rest is refused", () => {
  const report = inspectBackup(
    JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: "2026-11-03T12:00:00Z",
      entries: {
        "spoolsync:low-stock-percent": "30",
        "spoolsync:spoolman-token": "planted",
        "spoolsync:sidebar": "sideways",
        "spoolsync:chart-view": 5,
        "unknown-key": "x",
      },
    }),
  );
  expect(report.exportedAt).toBe("2026-11-03T12:00:00Z");
  expect(report.accepted).toEqual([{ key: "spoolsync:low-stock-percent", group: "Preferences" }]);
  const reasons = Object.fromEntries(report.skipped.map((skip) => [skip.key, skip.reason]));
  expect(reasons["spoolsync:spoolman-token"]).toContain("never restored");
  expect(reasons["spoolsync:sidebar"]).toContain("not in the form");
  expect(reasons["spoolsync:chart-view"]).toContain("not text");
  expect(reasons["unknown-key"]).toContain("Not a setting");
  // Inspecting changes nothing.
  expect(localStorage.getItem("spoolsync:low-stock-percent")).toBeNull();
});

test("merge keeps other settings while replace makes storage match the backup", () => {
  localStorage.setItem("spoolsync:chart-view", "brand");
  localStorage.setItem("spoolsync:low-stock-percent", "25");
  const backup = JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    entries: { "spoolsync:low-stock-percent": "40" },
  });
  expect(restoreBackup(backup, "merge")).toMatchObject({ removed: [] });
  expect(localStorage.getItem("spoolsync:low-stock-percent")).toBe("40");
  expect(localStorage.getItem("spoolsync:chart-view")).toBe("brand");

  const result = restoreBackup(backup, "replace");
  expect(result.removed).toEqual(["spoolsync:chart-view"]);
  expect(localStorage.getItem("spoolsync:chart-view")).toBeNull();
  expect(localStorage.getItem("spoolsync:low-stock-percent")).toBe("40");
});

test("backups round trip, and the older settings export is accepted too", () => {
  localStorage.setItem("spoolsync:weigh-in", '{"tares":{"esun":240}}');
  const text = createBackup();
  localStorage.clear();
  expect(restoreBackup(text).accepted.map((entry) => entry.key)).toEqual(["spoolsync:weigh-in"]);
  expect(localStorage.getItem("spoolsync:weigh-in")).toBe('{"tares":{"esun":240}}');
  localStorage.clear();
  localStorage.setItem("spoolsync:chart-view", "material");
  const legacy = exportSettings();
  localStorage.clear();
  expect(inspectBackup(legacy).format).toBe("spoolsync-settings");
  expect(restoreBackup(legacy).accepted).toHaveLength(1);
  expect(localStorage.getItem("spoolsync:chart-view")).toBe("material");
});

test("files that are not backups are refused with a reason and change nothing", () => {
  localStorage.setItem("spoolsync:chart-view", "brand");
  const tooMany = Object.fromEntries(
    Array.from({ length: BACKUP_LIMITS.entries + 1 }, (_, index) => [`k${index}`, "x"]),
  );
  const cases: Array<[string, string]> = [
    ["{oops", "not valid JSON"],
    ["[]", "not a SpoolSync backup"],
    [JSON.stringify({ format: "other", version: 1, entries: {} }), "not a SpoolSync backup"],
    [JSON.stringify({ format: BACKUP_FORMAT, version: 9, entries: {} }), "version 9"],
    [JSON.stringify({ format: BACKUP_FORMAT, version: 1 }), "no entries"],
    [JSON.stringify({ format: BACKUP_FORMAT, version: 1, entries: [] }), "no entries"],
    [
      JSON.stringify({ format: BACKUP_FORMAT, version: 1, entries: tooMany }),
      "more than SpoolSync ever writes",
    ],
  ];
  for (const [text, message] of cases)
    expect(() => restoreBackup(text, "replace")).toThrow(message);
  expect(localStorage.getItem("spoolsync:chart-view")).toBe("brand");
});

test("language, table columns, column mappings and health history are saved, portable only when valid", () => {
  localStorage.setItem("spoolsync:language", "de");
  localStorage.setItem("spoolsync:table-columns", JSON.stringify(["name", "vendor", "bogus"]));
  localStorage.setItem(
    "spoolsync:column-maps",
    JSON.stringify({
      "2-0a1b2c3d": { mapping: { vendor: "Brand" }, unit: "g", savedAt: "2026-11-01T00:00:00Z" },
    }),
  );
  localStorage.setItem(
    "spoolsync:health-history",
    JSON.stringify([{ at: "2026-11-01T00:00:00Z", score: 70, spools: 4 }]),
  );
  expect(listSavedData().map((item) => item.group.id)).toEqual(["preferences", "history"]);
  const exported = JSON.parse(exportSettings()) as { entries: Record<string, string> };
  expect(Object.keys(exported.entries).sort()).toEqual([
    "spoolsync:column-maps",
    "spoolsync:health-history",
    "spoolsync:language",
    "spoolsync:table-columns",
  ]);

  localStorage.clear();
  const result = importSettings(
    JSON.stringify({
      format: "spoolsync-settings",
      version: 1,
      entries: {
        "spoolsync:language": "klingon",
        "spoolsync:table-columns": JSON.stringify([
          "source",
          "id",
          "vendor",
          "material",
          "name",
          "color",
          "remaining",
          "location",
          "linked",
        ]),
        "spoolsync:column-maps": "{}",
        "spoolsync:health-history": '[{"at":"nope","score":1,"spools":1}]',
      },
    }),
  );
  expect(result.imported).toEqual([]);
  expect(result.skipped.sort()).toEqual([
    "spoolsync:column-maps",
    "spoolsync:health-history",
    "spoolsync:language",
    "spoolsync:table-columns",
  ]);
  expect(forgetGroup("history")).toBe(0);
});
