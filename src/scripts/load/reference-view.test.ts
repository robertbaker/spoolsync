import { describe, expect, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import {
  DEFAULT_REFERENCE_SETTINGS,
  type AcceptedReference,
  type ReferenceCacheMeta,
  type ReferenceFilament,
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
    ruledOut: [] as string[],
    cache: {} as Record<string, ReferenceCacheMeta>,
    bodies: {} as Record<string, ReferenceFilament[]>,
    meta() {
      return this.cache;
    },
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
    loadRuledOut: () => [...state.ruledOut],
    saveRuledOut: (keys) => {
      state.ruledOut = [...keys];
    },
    loadCache: () => state.meta(),
    loadCatalog: async (id) => state.bodies[id] ?? null,
    saveCache: async (entry) => {
      const { filaments, ...rest } = entry;
      state.bodies[entry.providerId] = filaments;
      state.cache = {
        ...state.cache,
        [entry.providerId]: {
          ...rest,
          sourceToken: entry.sourceToken ?? null,
          via: entry.via ?? "fetch",
          count: filaments.length,
        },
      };
      return true;
    },
    touchCache: (id, at) => {
      if (state.cache[id]) state.cache[id] = { ...state.cache[id]!, fetchedAt: at };
    },
    clearCache: async (id) => {
      if (id) {
        delete state.cache[id];
        delete state.bodies[id];
      } else {
        state.cache = {};
        state.bodies = {};
      }
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
          makeSpool("spoolman", "2", {
            vendor: "Acme",
            name: "Red",
            colors: [],
            diameter: null,
            initialWeight: null,
          }),
        ],
        warnings: [],
        loadedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  ]);

const referenceFile = JSON.stringify([
  {
    brand: "Prusament",
    material: "PLA",
    color_name: "Black",
    hex: "#1A1A1A",
    diameter: 1.75,
    net_weight: 1000,
    density: 1.24,
  },
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

  test("the two services ship a verified address and need no setup", () => {
    const { root, panel } = open();
    for (const [id, host] of [
      ["openfilamentdatabase", "api.openfilamentdatabase.org"],
      ["filamentcolors", "filamentcolors.xyz"],
    ] as const) {
      panel.controller.setProvider(id);
      panel.update();
      expect(root.textContent).not.toContain("needs an endpoint");
      expect(root.textContent).not.toContain("Needs endpoint configuration");
      expect((root.querySelector(`#reference-${id}-url`) as HTMLInputElement).value).toContain(
        host,
      );
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
    expect(root.textContent).toContain(
      "1 accepted change will appear in the plan on the Sync page.",
    );
    button(root, "undo")!.click();
    expect(state.accepted).toEqual([]);
  });

  const richFile = JSON.stringify([
    {
      brand: "Acme",
      material: "PLA",
      color_name: "Red",
      hex: "#FF0000",
      diameter: 1.75,
      net_weight: 1000,
      barcode: "00191314034277",
      source_url: "https://example.org/records/red",
      image_url: "https://example.org/red.jpg",
      drying_temp: 45,
      drying_time: 6,
      buy_links: [
        { store: "Elsewhere", url: "https://elsewhere.example.org/red", shipsTo: ["US"] },
        { store: "Near Shop", url: "https://near.example.org/red", shipsTo: ["GB"] },
      ],
    },
    {
      brand: "Acme",
      material: "PETG",
      color_name: "Blue",
      hex: "#0000FF",
      barcode: "99999999999999",
    },
  ]);

  test("a catalog shows its date, the source link, the photo and drying advice on a match", () => {
    Object.defineProperty(navigator, "language", { value: "en-GB", configurable: true });
    const { root, panel } = open();
    panel.controller.loadFile("rich.json", richFile);
    panel.update();
    const card = root.querySelector("[data-spool='spoolman:2']")!;
    expect(card.textContent).toContain("View on Reference file");
    expect(card.querySelector("a[href='https://example.org/records/red']")).not.toBeNull();
    expect(card.textContent).toContain("Drying: 45 \u00b0C for 6 h");
    // The shop that lists the visitor's country comes first; the other is marked.
    expect(card.textContent).toContain("Where to buy: Near Shop, Elsewhere (does not list GB)");
    expect(card.querySelector("a[href='https://near.example.org/red']")).not.toBeNull();
    const image = card.querySelector("img")!;
    expect(image.getAttribute("src")).toBe("https://example.org/red.jpg");
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(image.getAttribute("alt")).toContain("Acme");
    // A file is not "checked for updates"; only a service can be.
    expect(button(root, "check-updates")!.hidden).toBe(true);
  });

  test("a barcode finds its record in either UPC or EAN form, and says when there is none", () => {
    const { root, panel } = open();
    panel.controller.loadFile("rich.json", richFile);
    panel.update();
    const input = root.querySelector<HTMLInputElement>("#reference-barcode")!;
    const result = () => root.querySelector("#reference-barcode-result")!.textContent ?? "";
    input.value = "191314034277";
    button(root, "lookup-barcode")!.click();
    expect(result()).toContain("Acme PLA Red");
    expect(result()).toContain("1.75 mm");
    expect(result()).toContain("Drying: 45");
    input.value = "0191314034277";
    button(root, "lookup-barcode")!.click();
    expect(result()).toContain("Acme PLA Red");
    input.value = "5555555555";
    button(root, "lookup-barcode")!.click();
    expect(result()).toContain("No record in this catalog has the barcode 5555555555");
    input.value = "123";
    button(root, "lookup-barcode")!.click();
    expect(result()).toContain("at least 6 digits");
  });

  test("A accepts and R rejects the suggestions of the focused card, but never while typing", () => {
    const { root, panel, state } = open();
    panel.controller.loadFile("ref.json", referenceFile);
    panel.update();
    const press = (target: Element, key: string) =>
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

    const card = root.querySelector("[data-spool='spoolman:1']")!;
    const input = root.querySelector<HTMLInputElement>("input")!;
    press(input, "a");
    expect(state.accepted).toEqual([]);

    press(card.querySelector("button")!, "a");
    expect(state.accepted.map((entry) => entry.spoolKey)).toEqual(["spoolman:1"]);

    // Already decided, so a second press changes nothing; modifier chords are left to the page.
    press(root.querySelector("[data-spool='spoolman:1'] button")!, "a");
    expect(state.accepted).toHaveLength(1);
    root
      .querySelector("[data-spool='spoolman:2'] button")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true }));
    expect(state.accepted).toHaveLength(1);
  });

  test("the review list can be exported as CSV", () => {
    const { root, panel } = open();
    expect(button(root, "export-csv")).toBeUndefined();
    panel.controller.loadFile("ref.json", referenceFile);
    panel.update();
    expect(button(root, "export-csv")!.disabled).toBe(false);
  });

  test("the color finder lists the nearest catalog colors for a spool or a typed color", () => {
    const { root, panel } = open();
    expect(root.querySelector("#color-finder")).toBeNull();
    panel.controller.loadFile("ref.json", referenceFile);
    panel.update();
    const finder = root.querySelector<HTMLDetailsElement>("#color-finder")!;
    expect(finder).not.toBeNull();
    const hex = root.querySelector<HTMLInputElement>("#color-finder-hex")!;
    hex.value = "#FF0000";
    hex.dispatchEvent(new Event("input"));
    const found = [...root.querySelectorAll("[data-key='color-results'] li")];
    expect(found.length).toBe(3);
    expect(found[0]!.textContent).toContain("Acme PLA Red");
    expect(found[0]!.textContent).toContain("looks the same");
    expect(root.querySelector("#color-finder-status")!.textContent).toContain("3 closest colors");
    // The same material, taken from a chosen spool, narrows the search; the typed color is checked.
    hex.value = "nope";
    hex.dispatchEvent(new Event("input"));
    expect(root.querySelector("#color-finder-status")!.textContent).toContain("six hex digits");
    expect(hex.getAttribute("aria-invalid")).not.toBeNull();
    expect(root.querySelectorAll("[data-key='color-results'] li").length).toBe(0);

    const select = root.querySelector<HTMLSelectElement>("#color-finder-spool")!;
    select.value = "spoolman:1";
    select.dispatchEvent(new Event("change"));
    expect(hex.value).toBe("#FF0000");
    expect(root.querySelectorAll("[data-key='color-results'] li").length).toBeGreaterThan(0);
  });

  test("the color finder survives other actions in the panel", () => {
    const { root, panel } = open();
    panel.controller.loadFile("ref.json", referenceFile);
    panel.update();
    const finder = root.querySelector<HTMLDetailsElement>("#color-finder")!;
    finder.open = true;
    const hex = root.querySelector<HTMLInputElement>("#color-finder-hex")!;
    hex.value = "#00FF00";
    hex.dispatchEvent(new Event("input"));
    panel.update();
    expect(root.querySelector("#color-finder")).toBe(finder);
    expect(root.querySelector<HTMLInputElement>("#color-finder-hex")!.value).toBe("#00FF00");
  });

  test("catalog corrections are offered only when a certain match differs, and copy no spool data", async () => {
    const one = (diameter: number) =>
      new Map<SourceId, LoadResult>([
        [
          "spoolman",
          {
            source: "spoolman",
            spools: [
              makeSpool("spoolman", "secret-id", {
                vendor: "Prusament",
                material: "PLA",
                name: "Black",
                colors: ["1A1A1A"],
                diameter,
                density: 1.24,
                initialWeight: 1000,
                remainingWeight: 321,
              }),
            ],
            warnings: [],
            loadedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      ]);
    const agree = open(one(1.75));
    agree.panel.controller.loadFile("ref.json", referenceFile);
    agree.panel.update();
    expect(button(agree.root, "copy-corrections")!.disabled).toBe(true);

    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    });
    const differ = open(one(2.85));
    differ.panel.controller.loadFile("ref.json", referenceFile);
    differ.panel.update();
    const copy = button(differ.root, "copy-corrections")!;
    expect(copy.disabled).toBe(false);
    expect(copy.textContent).toContain("1 record");
    copy.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(copied).toHaveLength(1);
    expect(copied[0]).toContain("# Possible catalog corrections");
    expect(copied[0]).toMatch(/Diameter[^*]*\*\*: catalog says 1\.75; my spool says 2\.85/);
    expect(copied[0]).not.toContain("secret-id");
    expect(copied[0]).not.toContain("321");
    expect(copied[0]).not.toContain("spoolman");
  });

  test("an ambiguous spool asks for a choice, never picks one", () => {
    const { root, panel, state } = open();
    panel.controller.loadFile("ref.json", referenceFile);
    panel.update();
    const card = root.querySelector("[data-spool='spoolman:2']")!;
    expect(card.textContent).toContain("Needs a choice");
    expect(card.textContent).toContain("Choose the matching record (2)");
    expect(card.querySelector("details")?.hasAttribute("open")).toBe(true);
    const use = [...card.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Use this",
    )!;
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

describe("reference panel language", () => {
  test("the review controls follow the chosen language, and English stays the default", async () => {
    const { setLocale, reloadLocale } = await import("~/lib/i18n");
    try {
      setLocale("de");
      const { root, panel } = open();
      panel.controller.loadFile("ref.json", referenceFile);
      panel.update();
      expect(button(root, "fill-missing")!.textContent).toBe("Alle fehlenden füllen");
      expect(button(root, "export-csv")!.textContent).toBe("Als CSV exportieren");
      expect(button(root, "filter-all")!.textContent).toContain("Alles zu prüfen");
      expect(root.textContent).toContain("Spulen");
      expect(root.querySelector("#color-finder summary")!.textContent).toBe(
        "Ähnliche Farben finden",
      );
      expect(root.textContent).not.toContain("Fill all missing");
    } finally {
      localStorage.clear();
      reloadLocale();
    }
    const { root, panel } = open();
    panel.controller.loadFile("ref.json", referenceFile);
    panel.update();
    expect(button(root, "fill-missing")!.textContent).toBe("Fill all missing");
  });
});
