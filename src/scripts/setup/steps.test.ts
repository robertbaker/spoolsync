import { beforeEach, expect, test } from "bun:test";

import {
  buildSteps,
  clampStep,
  dismissSetup,
  isSetupDismissed,
  normalizeSelection,
  resetSetupDismissal,
  shouldAutoOpen,
} from "./steps";

beforeEach(() => localStorage.clear());

test("selection keeps known services once, in Load page order", () => {
  expect(normalizeSelection(["spoolio", "bogus", "spoolman", "spoolio"])).toEqual([
    "spoolman",
    "spoolio",
  ]);
  expect(normalizeSelection([])).toEqual([]);
});

test("steps are choose, one guide per chosen app, then load", () => {
  expect(buildSteps([])).toEqual([{ kind: "choose" }, { kind: "load" }]);
  expect(buildSteps(["filadex", "spoolman"])).toEqual([
    { kind: "choose" },
    { kind: "guide", source: "spoolman" },
    { kind: "guide", source: "filadex" },
    { kind: "load" },
  ]);
});

test("clamps the step into range", () => {
  const steps = buildSteps(["spoolio"]);
  expect(clampStep(-3, steps)).toBe(0);
  expect(clampStep(99, steps)).toBe(2);
  expect(clampStep(1.9, steps)).toBe(1);
  expect(clampStep(Number.NaN, steps)).toBe(0);
  expect(clampStep(5, [])).toBe(0);
});

test("dismissal is remembered until reset", () => {
  expect(isSetupDismissed()).toBe(false);
  dismissSetup();
  expect(isSetupDismissed()).toBe(true);
  resetSetupDismissal();
  expect(isSetupDismissed()).toBe(false);
});

test("opens on its own only for an empty, undismissed, unprompted visit", () => {
  const base = { loadedCount: 0, dismissed: false, search: "" };
  expect(shouldAutoOpen(base)).toBe(true);
  expect(shouldAutoOpen({ ...base, loadedCount: 2 })).toBe(false);
  expect(shouldAutoOpen({ ...base, dismissed: true })).toBe(false);
  for (const search of ["?sample=1", "?tour=2", "?spool=a:1", "?panel=spoolio"])
    expect(shouldAutoOpen({ ...base, search })).toBe(false);
  expect(shouldAutoOpen({ ...base, search: "?utm=x" })).toBe(true);
  expect(shouldAutoOpen({ ...base, automated: true })).toBe(false);
});
