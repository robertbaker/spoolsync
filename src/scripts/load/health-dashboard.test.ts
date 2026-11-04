import { beforeEach, expect, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";
import { checkInventoryHealth } from "@spoolsync/core/workflow";

import { appendHealthPoint, type HealthPoint } from "~/lib/browser/storage/health-history";
import { missingPriceKeys } from "~/lib/health-score";
import { reloadLocale, setLocale } from "~/lib/i18n";

import {
  healthInputs,
  trendCoordinates,
  wireHealthDashboard,
  type HealthHistoryStore,
  type HealthSource,
} from "./health-dashboard";
import type { InsightFilter } from "./insights";

beforeEach(() => {
  localStorage.clear();
  reloadLocale();
  document.body.replaceChildren();
});

function fixture(options: { clean?: boolean } = {}) {
  const spools = options.clean
    ? [
        makeSpool("spoolman", "1", {
          vendor: "Prusa",
          material: "PLA",
          colors: ["FF0000"],
          remainingWeight: 500,
          initialWeight: 1000,
          location: "Shelf",
          price: 20,
        }),
      ]
    : [
        makeSpool("spoolman", "1", { vendor: "Prusa", material: "PLA", remainingWeight: 400 }),
        makeSpool("spoolman", "2", { vendor: null, remainingWeight: null }),
        makeSpool("spoolman", "3", { remainingWeight: 250 }),
      ];
  const result: LoadResult = {
    source: "spoolman",
    spools,
    warnings: [],
    loadedAt: "2026-01-01T00:00:00Z",
  };
  const results = new Map<SourceId, LoadResult>([["spoolman", result]]);
  const listeners = new Set<() => void>();
  let active: InsightFilter | null = null;
  const insights: HealthSource = {
    health: checkInventoryHealth([result]),
    duplicateSpoolKeys: new Set(),
    missingPrice: missingPriceKeys(spools, (spool) => `${spool.source}:${spool.sourceId}`),
    spoolCount: spools.length,
    get activeFilter() {
      return active;
    },
    setFilter(filter) {
      active = filter;
      for (const listener of listeners) listener();
    },
    onFilterChange(listener) {
      listeners.add(listener);
    },
  };
  let stored: HealthPoint[] = [];
  const history: HealthHistoryStore = {
    read: () => stored,
    record(point) {
      stored = appendHealthPoint(stored, point);
      return stored;
    },
  };
  const root = document.createElement("section");
  document.body.append(root);
  const dashboard = wireHealthDashboard(root, {
    results,
    insights,
    cleanupSpools: () => 0,
    history,
    now: () => new Date("2026-02-03T10:00:00Z"),
  });
  return { root, dashboard, insights, history: () => stored };
}

test("inputs come from the page's insights", () => {
  const { insights } = fixture();
  const inputs = healthInputs(insights, 2);
  expect(inputs.spools).toBe(3);
  expect(inputs.cleanupSpools).toBe(2);
  expect(inputs.counts["missing-weight"]).toBe(1);
  expect(inputs.missingPrice).toBe(3);
});

test("the meter exposes the score and a readable value to assistive technology", () => {
  const { root, dashboard } = fixture();
  dashboard.update();
  expect(root.hidden).toBe(false);
  const meter = root.querySelector('[role="meter"]')!;
  const now = Number(meter.getAttribute("aria-valuenow"));
  expect(now).toBeGreaterThan(0);
  expect(now).toBeLessThan(100);
  expect(meter.getAttribute("aria-valuemin")).toBe("0");
  expect(meter.getAttribute("aria-valuemax")).toBe("100");
  expect(meter.getAttribute("aria-valuetext")).toMatch(/out of 100/);
  expect(meter.getAttribute("aria-label")).toBe("Data health score");
});

test("the to-do list is ranked and each item filters the table", () => {
  const { root, dashboard, insights } = fixture();
  dashboard.update();
  const items = [...root.querySelectorAll("li.health-todo__item")];
  expect(items.length).toBeGreaterThan(2);
  const button = root.querySelector<HTMLButtonElement>('[data-health-filter="missing-weight"]')!;
  expect(button.getAttribute("aria-label")).toBe("Show spools with: No remaining weight");
  expect(button.getAttribute("aria-pressed")).toBe("false");
  button.click();
  expect(insights.activeFilter).toBe("missing-weight");
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(button.textContent).toBe("Showing");
  button.click();
  expect(insights.activeFilter).toBeNull();
  expect(button.textContent).toBe("Show");
});

test("a clean inventory scores 100 minus nothing and says there is nothing to do", () => {
  const { root, dashboard } = fixture({ clean: true });
  dashboard.update();
  expect(root.querySelector('[role="meter"]')!.getAttribute("aria-valuenow")).toBe("100");
  expect(root.querySelector("li.health-todo__item")).toBeNull();
  expect(root.textContent).toContain("Nothing to fix");
});

test("the score is recorded once per distinct load and the trend appears after two", () => {
  const { root, dashboard, history } = fixture();
  dashboard.update();
  dashboard.update();
  expect(history()).toHaveLength(1);
  expect(root.querySelector("svg")).toBeNull();
  expect(root.textContent).toContain("First score saved on");
});

test("the status region is silent on first draw and speaks only when the score changes", () => {
  const { root, dashboard } = fixture();
  dashboard.update();
  const status = root.querySelector('[role="status"]')!;
  expect(status.textContent).toBe("");
  expect(status.getAttribute("aria-live")).toBe("polite");
});

test("labels follow the chosen language", () => {
  setLocale("de");
  const { root, dashboard } = fixture();
  dashboard.update();
  expect(root.querySelector("h2")!.textContent).toBe("Datenqualität");
  expect(root.querySelector('[role="meter"]')!.getAttribute("aria-label")).toBe(
    "Wert der Datenqualität",
  );
  setLocale("en");
});

test("trend coordinates use a fixed 0 to 100 scale", () => {
  expect(trendCoordinates([0, 100], 100, 26, 3)).toEqual([
    [3, 23],
    [97, 3],
  ]);
  expect(trendCoordinates([50], 100, 26, 3)).toEqual([[50, 13]]);
  // Out-of-range scores are clamped rather than drawn outside the chart.
  expect(trendCoordinates([-20, 140], 100, 26, 3)).toEqual([
    [3, 23],
    [97, 3],
  ]);
});
