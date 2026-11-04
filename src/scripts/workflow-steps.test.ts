import { beforeEach, expect, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";

import { reloadLocale, setLocale } from "~/lib/i18n";

import { INVENTORIES_CHANGED_EVENT } from "./load/state";
import { countLoaded, wireWorkflowSteps, workflowProgress } from "./workflow-steps";

const loaded = (source: SourceId): LoadResult => ({
  source,
  spools: [],
  warnings: [],
  loadedAt: "2026-01-01",
});

test("counts the services that have a stored inventory and survives broken storage", () => {
  const stored = new Set<SourceId>(["spoolman", "spoolio"]);
  expect(countLoaded((source) => (stored.has(source) ? loaded(source) : null))).toBe(2);
  expect(
    countLoaded(() => {
      throw new Error("storage blocked");
    }),
  ).toBe(0);
});

test("Load is current with nothing loaded and the later steps wait", () => {
  const steps = workflowProgress("load", 0);
  expect(steps.map((step) => step.state)).toEqual(["current", "todo", "todo"]);
  expect(steps[0]!.meta).toBe("Add exports or connect");
  expect(steps[1]!.meta).toBe("Needs two inventories");
});

test("one inventory is not enough to review", () => {
  const steps = workflowProgress("load", 1);
  expect(steps[0]!.meta).toBe("1 inventory loaded");
  expect(steps[1]!.meta).toBe("Load one more to compare");
});

test("Review is current on the Sync page and Load is marked done", () => {
  const steps = workflowProgress("review", 3);
  expect(steps.map((step) => step.state)).toEqual(["done", "current", "todo"]);
  expect(steps[0]!.meta).toBe("3 inventories loaded");
  expect(steps[2]!.meta).toBe("Write or download");
});

test("Apply current marks Review done only when there was something to compare", () => {
  expect(workflowProgress("apply", 2).map((step) => step.state)).toEqual(["done", "done", "current"]);
  expect(workflowProgress("apply", 0).map((step) => step.state)).toEqual(["todo", "todo", "current"]);
});

beforeEach(() => {
  sessionStorage.clear();
  location.hash = "";
  document.body.innerHTML = `
    <nav data-workflow-steps data-page="review">
      <ol>
        <li data-step="load"><a href="/load"><span data-step-meta></span></a></li>
        <li data-step="review"><a href="/sync"><span data-step-meta></span></a></li>
        <li data-step="apply"><a href="/sync#tour-apply"><span data-step-meta></span></a></li>
      </ol>
      <span data-workflow-live></span>
    </nav>`;
});

test("wiring reads storage, updates when inventories change, and follows the hash", () => {
  const stop = wireWorkflowSteps();
  const state = (id: string) => document.querySelector<HTMLElement>(`[data-step="${id}"]`)!.dataset["state"];
  expect(state("review")).toBe("current");
  expect(document.querySelector('[data-step="review"] a')!.getAttribute("aria-current")).toBe("step");
  expect(state("load")).toBe("todo");

  sessionStorage.setItem("spoolsync:load:spoolman", JSON.stringify(loaded("spoolman")));
  document.dispatchEvent(new Event(INVENTORIES_CHANGED_EVENT));
  expect(state("load")).toBe("done");
  expect(document.querySelector("[data-workflow-live]")!.textContent).toBe("1 inventory loaded");

  location.hash = "#tour-apply";
  window.dispatchEvent(new Event("hashchange"));
  expect(state("apply")).toBe("current");
  expect(document.querySelector('[data-step="review"] a')!.hasAttribute("aria-current")).toBe(false);
  stop();
});

test("wiring is a no-op without the stepper", () => {
  document.body.innerHTML = "";
  expect(() => wireWorkflowSteps()()).not.toThrow();
});

test("the step names and status lines follow the chosen language, and redraw when it changes", () => {
  document.body.innerHTML = `
    <nav data-workflow-steps data-page="load">
      <ol>
        <li data-step="load"><a href="/load"><span class="workflow-steps__label">Load</span><span data-step-meta></span></a></li>
        <li data-step="review"><a href="/sync"><span class="workflow-steps__label">Review</span><span data-step-meta></span></a></li>
        <li data-step="apply"><a href="/sync#tour-apply"><span class="workflow-steps__label">Apply</span><span data-step-meta></span></a></li>
      </ol>
      <span data-workflow-live></span>
    </nav>`;
  localStorage.clear();
  reloadLocale();
  const stop = wireWorkflowSteps();
  const label = (id: string) =>
    document.querySelector(`[data-step="${id}"] .workflow-steps__label`)!.textContent;
  expect(label("load")).toBe("Load");
  setLocale("de");
  expect(label("load")).toBe("Laden");
  expect(label("review")).toBe("Prüfen");
  expect(document.querySelector("[data-workflow-live]")!.textContent).toBe(
    "Exporte hinzufügen oder verbinden",
  );
  stop();
  setLocale("en");
});
