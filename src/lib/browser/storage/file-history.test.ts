import { beforeEach, expect, test } from "bun:test";

import { clearFileHistory, forgetFile, readFileHistory, recordFile } from "./file-history";

beforeEach(() => localStorage.clear());

const entry = (name: string, spools = 3) => ({
  name,
  size: 1234,
  spools,
  loadedAt: "2026-11-03T10:00:00.000Z",
});

test("remembers the last file per service and can forget one or all", () => {
  expect(readFileHistory()).toEqual({});
  recordFile("spoolio", entry("a.json"));
  recordFile("spoolkeep", entry("k.json", 5));
  recordFile("spoolio", entry("b.json", 7));
  expect(readFileHistory()).toEqual({
    spoolio: entry("b.json", 7),
    spoolkeep: entry("k.json", 5),
  });
  forgetFile("spoolio");
  expect(Object.keys(readFileHistory())).toEqual(["spoolkeep"]);
  clearFileHistory();
  expect(localStorage.getItem("spoolsync:file-history")).toBeNull();
});

test("drops damaged or unknown entries instead of failing", () => {
  localStorage.setItem(
    "spoolsync:file-history",
    JSON.stringify({
      spoolio: { name: "", size: 1, spools: 1, loadedAt: "2026-11-03T10:00:00Z" },
      spoolkeep: { name: "ok.json", size: "big", spools: 1, loadedAt: "2026-11-03T10:00:00Z" },
      spoolman: { name: "x.json", size: 1, spools: 1, loadedAt: "not a date" },
      filameter: { name: "good.json", size: 9, spools: 2, loadedAt: "2026-11-03T10:00:00Z" },
      notAService: { name: "y.json", size: 1, spools: 1, loadedAt: "2026-11-03T10:00:00Z" },
    }),
  );
  expect(Object.keys(readFileHistory())).toEqual(["filameter"]);
  localStorage.setItem("spoolsync:file-history", "{broken");
  expect(readFileHistory()).toEqual({});
});
