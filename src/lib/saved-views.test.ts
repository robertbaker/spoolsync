import { beforeEach, expect, test } from "bun:test";

import { makeSpool } from "@spoolsync/core/core/testing";

import {
  EMPTY_VIEW,
  MAX_VIEWS,
  MAX_VIEW_PARAM,
  VIEW_PARAM,
  MAX_VIEW_NAME,
  addView,
  cycleView,
  decodeViewParam,
  deleteView,
  describeSettings,
  encodeViewParam,
  groupSpools,
  matchesRange,
  parseGrams,
  readViews,
  renameView,
  sameSettings,
  sanitizeSettings,
  sanitizeViews,
  saveViews,
  updateView,
  viewShareUrl,
} from "./saved-views";

beforeEach(() => localStorage.clear());

const pla200 = { ...EMPTY_VIEW, material: "PLA", maxGrams: 200 };

test("sanitizing drops unknown values, swaps a reversed range, and lower-cases the search", () => {
  const settings = sanitizeSettings({
    search: "  Galaxy   BLACK ",
    lowOnly: "yes",
    insight: "<script>",
    sort: { key: "bogus", direction: "asc" },
    group: "nope",
    material: "x".repeat(500),
    minGrams: 300,
    maxGrams: 100,
  });
  expect(settings.search).toBe("galaxy black");
  expect(settings.lowOnly).toBe(false);
  expect(settings.insight).toBeNull();
  expect(settings.sort).toBeNull();
  expect(settings.group).toBe("none");
  expect(settings.material.length).toBe(100);
  expect([settings.minGrams, settings.maxGrams]).toEqual([100, 300]);
  expect(sanitizeSettings(null)).toEqual(EMPTY_VIEW);
  expect(sanitizeSettings({ minGrams: -1, maxGrams: Number.NaN })).toEqual(EMPTY_VIEW);
  expect(
    sanitizeSettings({ sort: { key: "remaining", direction: "desc" }, insight: "watched" }),
  ).toMatchObject({ sort: { key: "remaining", direction: "desc" }, insight: "watched" });
});

test("parsing grams accepts blanks and decimal commas, and rejects the rest", () => {
  expect(parseGrams("")).toBeNull();
  expect(parseGrams("  ")).toBeNull();
  expect(parseGrams("200")).toBe(200);
  expect(parseGrams("12,5")).toBe(12.5);
  expect(parseGrams("0")).toBe(0);
  expect(parseGrams("-3")).toBe("invalid");
  expect(parseGrams("abc")).toBe("invalid");
  expect(parseGrams("1e9")).toBe("invalid");
});

test("adding a view validates the name and keeps names unique ignoring case", () => {
  const first = addView([], "  PLA under 200 g ", pla200, () => "a");
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(first.view).toMatchObject({ id: "a", name: "PLA under 200 g", material: "PLA" });
  expect(addView(first.views, "pla UNDER 200 g", EMPTY_VIEW).ok).toBe(false);
  expect(addView(first.views, "   ", EMPTY_VIEW)).toEqual({
    ok: false,
    error: "Give the view a name.",
  });
  const long = addView(first.views, "n".repeat(MAX_VIEW_NAME + 1), EMPTY_VIEW);
  expect(long.ok).toBe(false);
});

test("the list is capped", () => {
  let views = [] as ReturnType<typeof sanitizeViews>;
  for (let i = 0; i < MAX_VIEWS; i += 1) {
    const result = addView(views, `view ${i}`, EMPTY_VIEW, () => `id${i}`);
    if (!result.ok) throw new Error(result.error);
    views = result.views;
  }
  const over = addView(views, "one more", EMPTY_VIEW);
  expect(over.ok).toBe(false);
  expect(sanitizeViews(views.concat(views).map((v, i) => ({ ...v, id: `x${i}`, name: `n${i}` }))))
    .toHaveLength(MAX_VIEWS);
});

test("renaming, updating, and deleting", () => {
  const a = addView([], "One", EMPTY_VIEW, () => "a");
  if (!a.ok) throw new Error("setup");
  const b = addView(a.views, "Two", pla200, () => "b");
  if (!b.ok) throw new Error("setup");

  expect(renameView(b.views, "b", "one").ok).toBe(false);
  expect(renameView(b.views, "missing", "x")).toMatchObject({ ok: false });
  const renamed = renameView(b.views, "b", "Two renamed");
  expect(renamed.ok && renamed.views.map((v) => v.name)).toEqual(["One", "Two renamed"]);
  // Keeping the same name (changing only its case) is allowed.
  expect(renameView(b.views, "b", "TWO").ok).toBe(true);

  const updated = updateView(b.views, "a", { ...EMPTY_VIEW, lowOnly: true });
  expect(updated.ok && updated.view).toMatchObject({ id: "a", name: "One", lowOnly: true });
  expect(updateView(b.views, "zzz", EMPTY_VIEW).ok).toBe(false);

  expect(deleteView(b.views, "a").map((v) => v.id)).toEqual(["b"]);
  expect(deleteView(b.views, "zzz")).toHaveLength(2);
});

test("stored views are sanitized on read and survive broken storage", () => {
  expect(readViews()).toEqual([]);
  localStorage.setItem("spoolsync:saved-views", "{not json");
  expect(readViews()).toEqual([]);
  localStorage.setItem(
    "spoolsync:saved-views",
    JSON.stringify([
      { id: "a", name: "Good", material: "PETG", group: "vendor" },
      { id: "a", name: "Duplicate id" },
      { id: "b", name: "good" },
      { id: "", name: "No id" },
      { id: "c", name: "" },
      "text",
      null,
    ]),
  );
  const views = readViews();
  expect(views).toHaveLength(1);
  expect(views[0]).toMatchObject({ id: "a", name: "Good", material: "PETG", group: "vendor" });

  expect(saveViews([])).toBe(true);
  expect(localStorage.getItem("spoolsync:saved-views")).toBeNull();
  const added = addView([], "Kept", pla200, () => "k");
  if (!added.ok) throw new Error("setup");
  expect(saveViews(added.views)).toBe(true);
  expect(readViews()).toEqual(added.views);
});

test("weight bounds are inclusive in grams, and spools without a weight fail any bound", () => {
  const settings = { material: "pla", minGrams: 50, maxGrams: 200 };
  const spool = (material: string | null, remainingWeight: number | null) =>
    ({ material, remainingWeight }) as const;
  expect(matchesRange(spool("PLA", 200), settings)).toBe(true);
  expect(matchesRange(spool("PLA+", 50), settings)).toBe(true);
  expect(matchesRange(spool("PLA", 200.5), settings)).toBe(false);
  expect(matchesRange(spool("PLA", 49), settings)).toBe(false);
  expect(matchesRange(spool("PETG", 100), settings)).toBe(false);
  expect(matchesRange(spool(null, 100), settings)).toBe(false);
  expect(matchesRange(spool("PLA", null), settings)).toBe(false);
  expect(matchesRange(spool("PLA", Number.NaN), settings)).toBe(false);
  // Without weight bounds an unweighed spool still passes.
  expect(matchesRange(spool("PLA", null), { ...settings, minGrams: null, maxGrams: null })).toBe(
    true,
  );
  expect(matchesRange(spool(null, null), EMPTY_VIEW)).toBe(true);
  expect(matchesRange(spool("PLA", 0), { material: "", minGrams: null, maxGrams: 10 })).toBe(true);
});

test("grouping keeps order inside sections, merges case, and puts blanks last", () => {
  const spools = [
    makeSpool("spoolman", "1", { vendor: "Prusament" }),
    makeSpool("spoolman", "2", { vendor: null }),
    makeSpool("spoolman", "3", { vendor: "esun" }),
    makeSpool("spoolman", "4", { vendor: "Esun" }),
    makeSpool("spoolman", "5", { vendor: "  " }),
    makeSpool("spoolman", "6", { vendor: "Prusament" }),
  ];
  const sections = groupSpools(spools, "vendor");
  expect(sections.map((s) => [s.label, s.spools.map((x) => x.sourceId)])).toEqual([
    ["esun", ["3", "4"]],
    ["Prusament", ["1", "6"]],
    ["No brand", ["2", "5"]],
  ]);
  expect(groupSpools(spools, "none")).toEqual([{ label: "", spools }]);
  expect(groupSpools([], "vendor")).toEqual([]);
  expect(groupSpools(spools, "source").map((s) => s.label)).toEqual(["Spoolman"]);
});

test("describing and comparing settings", () => {
  expect(describeSettings(EMPTY_VIEW)).toBe("all spools");
  expect(describeSettings(pla200)).toBe('material "PLA", under 200 g left');
  expect(
    describeSettings({ ...EMPTY_VIEW, minGrams: 10, maxGrams: 20, group: "vendor", lowOnly: true }),
  ).toBe("10–20 g left, running low, by brand");
  expect(sameSettings(pla200, { ...pla200, search: "  " })).toBe(true);
  expect(sameSettings(pla200, EMPTY_VIEW)).toBe(false);
});

test("a view round-trips through its share parameter, including non-Latin text", () => {
  const settings = {
    ...EMPTY_VIEW,
    search: "黒 galaxy",
    lowOnly: true,
    insight: "duplicates",
    sort: { key: "remaining" as const, direction: "desc" as const },
    group: "vendor" as const,
    material: "PLA+",
    minGrams: 10,
    maxGrams: 250.5,
  };
  const encoded = encodeViewParam(settings);
  expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodeViewParam(encoded)).toEqual(settings);
  expect(decodeViewParam(encodeViewParam(EMPTY_VIEW))).toEqual(EMPTY_VIEW);
});

test("damaged, oversized or hostile share parameters decode to nothing or to a clean view", () => {
  expect(decodeViewParam(null)).toBeNull();
  expect(decodeViewParam("")).toBeNull();
  expect(decodeViewParam("%%%")).toBeNull();
  expect(decodeViewParam("bm90LWpzb24")).toBeNull();
  expect(decodeViewParam("a".repeat(MAX_VIEW_PARAM + 1))).toBeNull();
  const forge = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  expect(decodeViewParam(forge({ v: 2, s: "x" }))).toBeNull();
  expect(decodeViewParam(forge([1, 2]))).toBeNull();
  const hostile = decodeViewParam(
    forge({ v: 1, s: "<img src=x onerror=1>", i: "__proto__", o: ["nope", "up"], g: "evil", a: 9e9, b: -4 }),
  )!;
  expect(hostile).toMatchObject({ insight: null, sort: null, group: "none", minGrams: null, maxGrams: null });
});

test("share links keep only the view parameter on the page's own path", () => {
  const url = new URL(viewShareUrl("https://spoolsync.example/load?sample=1&view=old#top", pla200));
  expect(url.origin + url.pathname).toBe("https://spoolsync.example/load");
  expect([...url.searchParams.keys()]).toEqual([VIEW_PARAM]);
  expect(url.hash).toBe("");
  expect(decodeViewParam(url.searchParams.get(VIEW_PARAM))).toEqual(pla200);
});

test("stepping through views passes the no-view stop and wraps both ways", () => {
  const views = [
    { id: "a", name: "A", ...pla200 },
    { id: "b", name: "B", ...pla200 },
  ];
  expect(cycleView(views, "", 1)).toBe("a");
  expect(cycleView(views, "a", 1)).toBe("b");
  expect(cycleView(views, "b", 1)).toBe("");
  expect(cycleView(views, "", -1)).toBe("b");
  expect(cycleView(views, "a", -1)).toBe("");
  expect(cycleView(views, "gone", 1)).toBe("a");
  expect(cycleView([], "", 1)).toBe("");
});
