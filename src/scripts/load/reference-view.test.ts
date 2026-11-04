import { describe, expect, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import {
  DEFAULT_REFERENCE_SETTINGS,
  type AcceptedReference,
  type ReferenceCacheEntry,
  type ReferenceIO,
  type ReferenceSettings,
} from "@spoolsync/core/core/reference";
import { makeSpool } from "@spoolsync/core/core/testing";

import type { ReferenceStore } from "./reference-controller";
import { wireReferencePanel } from "./reference-view";

function memory() {
  const state = {
    settings: { ...DEFAULT_REFERENCE_SETTINGS } as ReferenceSettings,
    accepted: [] as AcceptedReference[],
    choices: new Map<string, string>(),
    cache: {} as Record<string, ReferenceCacheEntry>,
  };
  const store: ReferenceStore = {
    loadSettings: () => state.settings,
    saveSettings: (settings) => {
      state.settings = settings;
    },
    loadAccepted: () => state.accepted,
    saveAccepted: (list) => {
      state.accepted = [...list];
    },
    loadChoices: () => new Map(state.choices),
    saveChoices: (choices) => {
      state.choices = new Map(choices);
    },
    loadCache: () => state.cache,
    saveCache: (entry) => {
      state.cache = { ...state.cache, [entry.providerId]: entry };
      return true;
    },
    clearCache: () => {
      state.cache = {};
    },
  };
  return { state, store };
}

const io: ReferenceIO = {
  fetch: async () => {
    throw new Error("no network in this test");
  },
  sleep: async () => {},
  now: () => 1_000_000,
};

const loaded = (): Map<SourceId, LoadResult> =>
  new Map([
    [
      "spoolman",
      {
        source: "spoolman",
        spools: [
          makeSpool("spoolman", "1", { density: null, colors: ["FF0000"], name: "Black" }),
          makeSpool("spoolman", "2", { vendor: "Acme", name: "Red", colors: [], diameter: null, initialWeight: null }),
        ],
        warnings: [],
        loadedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  ]);

const referenceFile = JSON.stringify([
  { brand: "Prusament", material: "PLA", color_name: "Black", hex: "#1A1A1A", diameter: 1.75, net_weight: 1000, density: 1.24 },
  { brand: "Acme", material: "PLA", color_name: "Red", hex: "#FF0000", diameter: 1.75 },
  { brand: "Acme", material: "PLA", color_name: "Red", hex: "#FE0000", diameter: 2.85 },
]);

const button = (root: HTMLElement, key: string) =>
  [...root.querySelectorAll<HTMLButtonElement>("button[data-key]")].find(
    (element) => element.getAttribute("data-key") === key,
  );

function open(results = loaded()) {
  const root = document.createElement("div");
  document.body.append(root);
  const { store, state } = memory();
  const panel = wireReferencePanel(root, results, store, io);
  panel.open();
  panel.update();
  return { root, panel, state };
}

describe("reference panel", () => {
  test("stays hidden until something is loaded", () => {
    const root = document.createElement("div");
    const panel = wireReferencePanel(root, new Map(), memory().store, io);
    panel.update();
    expect(root.hidden).toBe(true);
    expect(root.querySelector("details[data-panel='reference']")).not.toBeNull();
  });

  test("opens as a data-panel details so the palette can land on it", () => {
    const { root } = open();
    const details = root.querySelector<HTMLDetailsElement>("details[data-panel='reference']")!;
    expect(root.hidden).toBe(false);
    expect(details.open).toBe(true);
    expect(root.textContent).toContain("Load a reference file, or fetch a catalog, to start.");
  });

  test("shows the file source with its format help, and says nothing is uploaded", () => {
    const { root } = open();
    expect(root.querySelector("input[type='file']")).not.toBeNull();
    expect(root.textContent).toContain("File format");
    expect(root.textContent).toContain("nothing is uploaded");
  });

  test("the two services say they need an endpoint and what is missing", () => {
    const { root, panel } = open();
    for (const [id, name] of [
      ["openfilamentdatabase", "Open Filament Database"],
      ["filamentcolors", "FilamentColors"],
    ] as const) {
      panel.controller.setProvider(id);
      panel.update();
      expect(root.textContent).toContain(`${name} needs an endpoint before it can be used`);
      expect(root.textContent).toContain("Needs endpoint configuration");
      expect(root.textContent).toContain("What is still missing");
      expect(root.textContent).toContain("unverified");
      expect(root.querySelector(`#reference-${id}-url`)).not.toBeNull();
      expect(button(root, `fetch-${id}`)).toBeDefined();
    }
  });

  test("fetching with invalid settings explains instead of requesting", async () => {
    const { root, panel } = open();
    panel.controller.setProvider("filamentcolors");
    panel.update();
    const url = root.querySelector<HTMLInputElement>("#reference-filamentcolors-url")!;
    url.value = "http://insecure.example.org/api";
    url.dispatchEvent(new Event("input"));
    button(root, "fetch-filamentcolors")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.textContent).toContain("Only https:// addresses are allowed");
  });

  test("shows the credit line and cards for a loaded catalog, and accepting saves a choice", () => {
    const { root, panel, state } = open();
    panel.controller.loadFile("ref.json", referenceFile);
    panel.update();
    expect(root.textContent).toContain("Reference file: 3 filaments from ref.json");
    expect(root.textContent).toContain("Credit: Reference file ref.json.");
    expect(root.textContent).toContain("License: not stated by the source");
    const cards = root.querySelectorAll("[data-spool]");
    expect(cards.length).toBe(2);

    // The red spool is called Black: the color check and the name check both speak up.
    expect(root.textContent).toContain("Does not match");
    expect(root.textContent).toContain("Your color name points to Black");

    const accept = button(root, "accept-spoolman:1#density")!;
    expect(accept.getAttribute("aria-pressed")).toBe("false");
    accept.click();
    expect(state.accepted.map((entry) => entry.field)).toEqual(["density"]);
    expect(button(root, "accept-spoolman:1#density")!.getAttribute("aria-pressed")).toBe("true");
    expect(root.textContent).toContain("1 accepted change will appear in the plan on the Sync page.");
    button(root, "undo")!.click();
    expect(state.accepted).toEqual([]);
  });

  test("an ambiguous spool asks for a choice, never picks one", () => {
    const { root, panel, state } = open();
    panel.controller.loadFile("ref.json", referenceFile);
    panel.update();
    const card = root.querySelector("[data-spool='spoolman:2']")!;
    expect(card.textContent).toContain("Needs a choice");
    expect(card.textContent).toContain("Choose the matching record (2)");
    expect(card.querySelector("details")?.hasAttribute("open")).toBe(true);
    const use = [...card.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Use this")!;
    use.click();
    expect(state.choices.get("spoolman:2")).toBeDefined();
    expect(root.querySelector("[data-spool='spoolman:2']")?.textContent).toContain("Chosen by you");
  });

  test("filters narrow the list and fill all missing accepts only what is in view", () => {
    const { root, panel, state } = open();
    panel.controller.loadFile("ref.json", referenceFile);
    panel.update();
    button(root, "filter-ambiguous")!.click();
    expect(root.querySelectorAll("[data-spool]").length).toBe(1);
    expect(button(root, "fill-missing")!.disabled).toBe(true);
    button(root, "filter-all")!.click();
    button(root, "fill-missing")!.click();
    expect(state.accepted.length).toBeGreaterThan(0);
    expect(state.accepted.every((entry) => entry.spoolKey === "spoolman:1")).toBe(true);
  });

  test("unloading the catalog keeps accepted changes and says so", () => {
    const { root, panel, state } = open();
    panel.controller.loadFile("ref.json", referenceFile);
    panel.update();
    button(root, "accept-spoolman:1#density")!.click();
    button(root, "unload-reference")!.click();
    expect(root.textContent).toContain("1 accepted change from an earlier visit is kept");
    expect(state.accepted).toHaveLength(1);
  });
});
