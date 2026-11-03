import { describe, expect, test } from "bun:test";

import {
  CLEANUP_RULE_IDS,
  type AcceptedCleanup,
  type CleanupSettings,
} from "@spoolsync/core/core/cleanup";
import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import type { CleanupStore } from "./cleanup-controller";
import { displayValue, wireCleanupPanel } from "./cleanup-view";

function memory() {
  const state = {
    settings: { enabled: [...CLEANUP_RULE_IDS] } as CleanupSettings,
    saved: [] as AcceptedCleanup[],
  };
  const store: CleanupStore = {
    loadSettings: () => state.settings,
    saveSettings: (settings) => {
      state.settings = settings;
    },
    loadAccepted: () => state.saved,
    saveAccepted: (list) => {
      state.saved = [...list];
    },
  };
  return { state, store };
}

const loaded = (): Map<SourceId, LoadResult> =>
  new Map([
    [
      "spoolman",
      {
        source: "spoolman",
        spools: [
          makeSpool("spoolman", "1", { vendor: "esun", name: "red" }),
          makeSpool("spoolman", "2", { price: -4 }),
        ],
        warnings: [],
        loadedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  ]);

const button = (root: HTMLElement, key: string) =>
  [...root.querySelectorAll<HTMLButtonElement>("button[data-key]")].find(
    (element) => element.getAttribute("data-key") === key,
  );

describe("displayValue", () => {
  test("shows empty values, units, and colors the way the rest of the page does", () => {
    expect(displayValue("vendor", null)).toBe("(empty)");
    expect(displayValue("vendor", "")).toBe("(empty)");
    expect(displayValue("vendor", "eSUN")).toBe("eSUN");
    expect(displayValue("remainingWeight", 250)).toBe("250 g");
    expect(displayValue("price", 12.5)).toBe("12.5");
    expect(displayValue("colors", ["FF0000", "00FF00"])).toBe("#FF0000, #00FF00");
    expect(displayValue("price", "$24,99")).toBe("$24,99");
  });
});

describe("cleanup panel", () => {
  test("stays hidden until something is loaded", () => {
    const root = document.createElement("div");
    const panel = wireCleanupPanel(root, new Map(), memory().store);
    panel.update();
    expect(root.hidden).toBe(true);
  });

  test("lists suggestions with before and after and accepts one on request", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const { store, state } = memory();
    const panel = wireCleanupPanel(root, loaded(), store, () => "2026-06-01");
    panel.update();
    expect(root.hidden).toBe(false);
    expect(root.querySelector("summary")?.textContent).toBe("Clean up data (2 suggestions)");
    panel.open();
    panel.update();

    const row = root.querySelector('[data-proposal="spoolman:1#vendor"]');
    expect(row?.querySelector("del")?.textContent).toBe("esun");
    expect(row?.querySelector("ins")?.textContent).toBe("eSUN");
    expect(root.textContent).toContain("Values to check (1)");
    expect(root.textContent).toContain("Price -4 is negative.");

    button(root, "accept-spoolman:1#vendor")!.click();
    expect(state.saved.map((entry) => `${entry.spoolKey}#${entry.field}`)).toEqual([
      "spoolman:1#vendor",
    ]);
    expect(button(root, "accept-spoolman:1#vendor")?.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector("summary")?.textContent).toContain("1 accepted");

    button(root, "undo")!.click();
    expect(state.saved).toEqual([]);
    expect(button(root, "undo")?.disabled).toBe(true);
    root.remove();
  });

  test("select all safe accepts every safe suggestion and rule toggles are remembered", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const { store, state } = memory();
    const panel = wireCleanupPanel(root, loaded(), store, () => "2026-06-01");
    panel.open();
    panel.update();
    button(root, "accept-safe")!.click();
    expect(state.saved).toHaveLength(2);
    expect(button(root, "accept-safe")?.disabled).toBe(true);

    const casing = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (input) => input.getAttribute("data-key") === "rule-casing",
    )!;
    casing.checked = false;
    casing.dispatchEvent(new Event("change"));
    expect(state.settings.enabled).not.toContain("casing");
    root.remove();
  });
});
