import { describe, expect, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import {
  DEFAULT_REFERENCE_SETTINGS,
  NO_REFERENCE,
  type AcceptedReference,
  type ReferenceCacheMeta,
  type ReferenceFilament,
  type ReferenceIO,
  type ReferenceResponse,
  type ReferenceSettings,
  type ReferenceSnapshot,
} from "@spoolsync/core/core/reference";
import { makeSpool } from "@spoolsync/core/core/testing";

import {
  ReferenceController,
  type ReferenceSnapshots,
  type ReferenceStore,
} from "./reference-controller";

const result = (source: SourceId, spools: LoadResult["spools"]): LoadResult => ({
  source,
  spools,
  warnings: [],
  loadedAt: "2026-01-01T00:00:00.000Z",
});

function memoryStore(accepted: AcceptedReference[] = []) {
  const state = {
    settings: { ...DEFAULT_REFERENCE_SETTINGS } as ReferenceSettings,
    accepted,
    choices: new Map<string, string>(),
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

const idleIO: ReferenceIO = {
  fetch: async () => {
    throw new Error("no network in this test");
  },
  sleep: async () => {},
  now: () => 1_000_000,
};

const referenceFile = JSON.stringify([
  {
    brand: "Prusament",
    material: "PLA",
    color_name: "Galaxy Black",
    hex: "#1A1A1A",
    diameter: 1.75,
    net_weight: 1000,
    density: 1.24,
    spool_weight: 201,
    nozzle_temp: "215-230",
  },
  {
    brand: "Prusament",
    material: "PLA",
    color_name: "Galaxy Silver",
    hex: "#C0C0C0",
    diameter: 1.75,
    net_weight: 1000,
    density: 1.24,
  },
]);

function setup(accepted: AcceptedReference[] = [], io: ReferenceIO = idleIO) {
  const results = new Map<SourceId, LoadResult>([
    [
      "spoolman",
      result("spoolman", [
        makeSpool("spoolman", "1", { density: null, emptySpoolWeight: null }),
        makeSpool("spoolman", "2", {
          name: "Galaxy Silver",
          colors: ["C0C0C0"],
          density: null,
          diameter: 2.85,
        }),
        makeSpool("spoolman", "3", { vendor: "Nobody", name: "Mystery" }),
      ]),
    ],
  ]);
  const memory = memoryStore(accepted);
  const controller = new ReferenceController(results, memory.store, io);
  controller.refresh();
  return { results, controller, memory };
}

describe("ReferenceController with a file", () => {
  test("has nothing until a catalog is loaded, then matches the inventory", () => {
    const { controller } = setup();
    expect(controller.counts().spools).toBe(0);
    expect(controller.visible()).toEqual([]);
    const info = controller.loadFile("ref.json", referenceFile);
    expect(info).toMatchObject({ providerId: "file", origin: "file", usable: 2, skipped: 0 });
    expect(controller.counts()).toMatchObject({ spools: 3, matched: 2, unmatched: 1 });
    expect(controller.analysis.proposals.map((p) => p.id)).toContain("spoolman:1#density");
  });

  test("an unreadable file throws and leaves the catalog as it was", () => {
    const { controller } = setup();
    controller.loadFile("ref.json", referenceFile);
    expect(() => controller.loadFile("bad.json", "{oops")).toThrow("not valid JSON");
    expect(controller.info?.name).toBe("ref.json");
    expect(controller.counts().matched).toBe(2);
  });

  test("filters list what each would show", () => {
    const { controller } = setup();
    controller.loadFile("ref.json", referenceFile);
    expect(controller.visible().map((i) => i.spoolKey)).toEqual(["spoolman:1", "spoolman:2"]);
    controller.setFilter("missing");
    expect(controller.visible().map((i) => i.spoolKey)).toEqual(["spoolman:1", "spoolman:2"]);
    controller.setFilter("differs");
    expect(controller.visible().map((i) => i.spoolKey)).toEqual(["spoolman:2"]);
    controller.setFilter("unmatched");
    expect(controller.visible().map((i) => i.spoolKey)).toEqual(["spoolman:3"]);
    controller.setFilter("ambiguous");
    expect(controller.visible()).toEqual([]);
    expect(controller.filterCounts()).toMatchObject({
      all: 2,
      missing: 2,
      differs: 1,
      unmatched: 1,
      ambiguous: 0,
    });
  });

  test("accept, reject, reset, and undo, saved as the Sync page reads them", () => {
    const { controller, memory } = setup();
    controller.loadFile("ref.json", referenceFile);
    expect(controller.accept(["spoolman:1#density"])).toBe(1);
    expect(memory.state.accepted).toEqual([
      expect.objectContaining({
        spoolKey: "spoolman:1",
        field: "density",
        before: null,
        after: 1.24,
        providerId: "file",
      }),
    ]);
    expect(controller.accept(["spoolman:1#density"])).toBe(0);
    expect(controller.reject(["spoolman:1#density"])).toBe(1);
    expect(memory.state.accepted).toEqual([]);
    expect(controller.undoLabel()).toBe("rejecting reference data");
    expect(controller.undo()).toBe("rejecting reference data");
    expect(
      controller.status(controller.analysis.proposals.find((p) => p.id === "spoolman:1#density")!),
    ).toBe("accepted");
    expect(controller.reset(["spoolman:1#density"])).toBe(1);
    expect(memory.state.accepted).toEqual([]);
  });

  test("a change the service cannot take is never accepted", () => {
    const { controller } = setup();
    controller.loadFile("ref.json", referenceFile);
    // Spoolman has no nozzle temperature range.
    expect(
      controller.analysis.proposals.find((p) => p.id === "spoolman:1#nozzleTempMin")?.applicable,
    ).toBe(false);
    expect(controller.accept(["spoolman:1#nozzleTempMin"])).toBe(0);
    expect(controller.reject(["spoolman:1#nozzleTempMin"])).toBe(1);
  });

  test("fill all missing accepts fills in view and leaves overwrites", () => {
    const { controller } = setup();
    controller.setPolicy({
      fields: ["density", "diameter", "emptySpoolWeight"],
      overwrite: ["diameter"],
    });
    controller.loadFile("ref.json", referenceFile);
    const overwrite = controller.analysis.proposals.find((p) => p.field === "diameter");
    expect(overwrite).toMatchObject({
      id: "spoolman:2#diameter",
      kind: "overwrite",
      confidence: "review",
    });
    expect(controller.fillAllMissing()).toBe(3);
    expect(controller.status(overwrite!)).toBe("pending");
    expect(controller.overwriteSelected()).toBe(1);
    expect(controller.status(overwrite!)).toBe("accepted");
    expect(controller.counts()).toMatchObject({ accepted: 4, pending: 0 });
    expect(controller.undoLabel()).toBe("overwriting 1 values");
  });

  test("fill all missing respects the filter", () => {
    const { controller } = setup();
    controller.loadFile("ref.json", referenceFile);
    controller.setFilter("unmatched");
    expect(controller.fillAllMissing()).toBe(0);
  });

  test("turning overwrite off drops the proposal and any acceptance of it", () => {
    const { controller, memory } = setup();
    controller.setPolicy({ fields: ["diameter"], overwrite: ["diameter"] });
    controller.loadFile("ref.json", referenceFile);
    controller.accept(["spoolman:2#diameter"]);
    expect(memory.state.accepted).toHaveLength(1);
    controller.setPolicy({ fields: ["diameter"], overwrite: [] });
    expect(memory.state.accepted).toEqual([]);
    expect(controller.dropped).toBe(1);
    expect(memory.state.settings.policy).toEqual({ fields: ["diameter"], overwrite: [] });
  });

  test("clearing choices forgets accepts and rejects", () => {
    const { controller } = setup();
    controller.loadFile("ref.json", referenceFile);
    controller.accept(["spoolman:1#density"]);
    controller.reject(["spoolman:2#density"]);
    expect(controller.clearChoices()).toBe(2);
    expect(controller.counts()).toMatchObject({ accepted: 0, rejected: 0 });
  });
});

describe("ReferenceController choices and held entries", () => {
  const twins = JSON.stringify([
    { brand: "Acme", material: "PLA", color_name: "Red", hex: "FF0000", diameter: 1.75 },
    { brand: "Acme", material: "PLA", color_name: "Red", hex: "FE0000", diameter: 2.85 },
  ]);
  const acme = () =>
    new Map<SourceId, LoadResult>([
      [
        "spoolman",
        result("spoolman", [
          makeSpool("spoolman", "9", {
            vendor: "Acme",
            name: "Red",
            colors: [],
            diameter: null,
            initialWeight: null,
            density: null,
          }),
        ]),
      ],
    ]);

  test("an ambiguous spool needs a choice and a choice persists", () => {
    const memory = memoryStore();
    const controller = new ReferenceController(acme(), memory.store, idleIO);
    controller.refresh();
    controller.loadFile("twins.json", twins);
    expect(controller.counts()).toMatchObject({ ambiguous: 1, needChoice: 1, proposals: 0 });
    controller.setFilter("ambiguous");
    expect(controller.visible()).toHaveLength(1);
    const candidates = controller.visible()[0]!.match.candidates;
    expect(controller.chooseReference("spoolman:9", "not-a-candidate")).toBe(false);
    expect(controller.chooseReference("spoolman:9", candidates[1]!.reference.id)).toBe(true);
    expect(memory.state.choices.get("spoolman:9")).toBe(candidates[1]!.reference.id);
    expect(controller.counts()).toMatchObject({ needChoice: 0 });
    expect(controller.analysis.proposals.every((p) => p.confidence === "review")).toBe(true);
    // The choice survives a new controller on the same storage, like a reload.
    const again = new ReferenceController(acme(), memory.store, idleIO);
    again.refresh();
    again.loadFile("twins.json", twins);
    expect(again.analysis.items[0]!.selected?.reference.id).toBe(candidates[1]!.reference.id);
  });

  test("choosing a different record drops changes accepted from the first", () => {
    const memory = memoryStore();
    const controller = new ReferenceController(acme(), memory.store, idleIO);
    controller.refresh();
    controller.loadFile("twins.json", twins);
    const [first, second] = controller.visible()[0]!.match.candidates;
    controller.chooseReference("spoolman:9", first!.reference.id);
    const proposal = controller.analysis.proposals.find((p) => p.field === "colors")!;
    controller.accept([proposal.id]);
    expect(memory.state.accepted).toHaveLength(1);
    controller.chooseReference("spoolman:9", second!.reference.id);
    expect(memory.state.accepted).toEqual([]);
    expect(controller.undo()).toBe("choosing a reference");
    expect(
      controller.status(controller.analysis.proposals.find((p) => p.field === "colors")!),
    ).toBe("accepted");
    expect(memory.state.accepted).toHaveLength(1);
  });

  test("none of these, and back to automatic", () => {
    const memory = memoryStore();
    const controller = new ReferenceController(acme(), memory.store, idleIO);
    controller.refresh();
    controller.loadFile("twins.json", twins);
    expect(controller.chooseReference("spoolman:9", NO_REFERENCE)).toBe(true);
    expect(controller.chooseReference("spoolman:9", NO_REFERENCE)).toBe(false);
    expect(controller.analysis.items[0]).toMatchObject({ selected: null, chosen: true });
    expect(controller.counts().needChoice).toBe(0);
    expect(controller.clearReference("spoolman:9")).toBe(true);
    expect(controller.clearReference("spoolman:9")).toBe(false);
    expect(controller.counts().needChoice).toBe(1);
  });

  test("a choice for a spool that is gone is pruned", () => {
    const memory = memoryStore();
    memory.state.choices.set("spoolman:404", "x");
    memory.state.choices.set("spoolio:1", "x");
    const controller = new ReferenceController(acme(), memory.store, idleIO);
    controller.refresh();
    controller.loadFile("twins.json", twins);
    // Spoolio is not loaded, so its choice is kept; the missing Spoolman spool's is not.
    expect([...memory.state.choices.keys()]).toEqual(["spoolio:1"]);
  });

  test("accepted changes are held without a catalog, restored with it, and dropped when stale", () => {
    const first = setup();
    first.controller.loadFile("ref.json", referenceFile);
    first.controller.accept(["spoolman:1#density"]);
    const saved = first.memory.state.accepted;
    expect(saved).toHaveLength(1);

    // A new tab with the same data and no catalog yet: held, not discarded.
    const reopened = setup(saved);
    expect(reopened.controller.heldCount()).toBe(1);
    expect(reopened.memory.state.accepted).toEqual(saved);
    reopened.controller.loadFile("ref.json", referenceFile);
    expect(reopened.controller.heldCount()).toBe(0);
    expect(reopened.controller.counts().accepted).toBe(1);

    // A different reference no longer offers that value: the acceptance is dropped.
    const other = setup(saved);
    other.controller.loadFile(
      "other.json",
      JSON.stringify([
        {
          brand: "Prusament",
          material: "PLA",
          color_name: "Galaxy Black",
          hex: "#1A1A1A",
          density: 1.3,
          diameter: 1.75,
          net_weight: 1000,
        },
      ]),
    );
    expect(other.controller.counts().accepted).toBe(0);
    expect(other.controller.dropped).toBe(1);
    expect(other.memory.state.accepted).toEqual([]);
  });

  test("entries for a service that is not loaded are held", () => {
    const orphan: AcceptedReference = {
      spoolKey: "spoolio:Z",
      field: "density",
      before: null,
      after: 1.24,
      providerId: "file",
      referenceId: "x",
    };
    const { controller, memory } = setup([orphan]);
    controller.loadFile("ref.json", referenceFile);
    expect(controller.heldCount()).toBe(1);
    expect(memory.state.accepted).toEqual([orphan]);
  });

  test("unloading the catalog keeps accepted changes for later", () => {
    const { controller, memory } = setup();
    controller.loadFile("ref.json", referenceFile);
    controller.accept(["spoolman:1#density"]);
    controller.unload();
    expect(controller.catalog).toBeNull();
    expect(controller.counts().proposals).toBe(0);
    expect(controller.heldCount()).toBe(1);
    expect(memory.state.accepted).toHaveLength(1);
  });
});

describe("ReferenceController fetching", () => {
  const ok = (body: unknown): ReferenceResponse => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  });
  const providerSettings = {
    urlTemplate: "https://data.example.org/api/filaments",
    mapping: {},
    pagination: { kind: "none" as const },
    ttlHours: 1,
    minIntervalMs: 0,
    attribution: "",
  };
  const page = [
    {
      brand: "Prusament",
      material: "PLA",
      color_name: "Galaxy Black",
      hex: "#1A1A1A",
      diameter: 1.75,
      net_weight: 1000,
      density: 1.24,
    },
  ];

  function fetching(body: () => Promise<ReferenceResponse>) {
    let clock = 1_000_000;
    const calls: string[] = [];
    const io: ReferenceIO = {
      fetch: (url) => {
        calls.push(url);
        return body();
      },
      sleep: async () => {},
      now: () => clock,
    };
    const made = setup([], io);
    made.controller.saveProviderSettings("filamentcolors", providerSettings);
    return { ...made, calls, advance: (ms: number) => (clock += ms) };
  }

  test("an unusable address is refused with what to fix", async () => {
    const { controller } = setup();
    controller.saveProviderSettings("openfilamentdatabase", {
      ...providerSettings,
      urlTemplate: "http://data.example.org/x",
    });
    const outcome = await controller.fetchProvider("openfilamentdatabase");
    expect(outcome).toMatchObject({ kind: "invalid" });
    expect(outcome.kind === "invalid" && outcome.errors[0]).toContain("https");
  });

  test("fetches, keeps the credit line, caches, and reuses a fresh copy", async () => {
    const { controller, memory, calls, advance } = fetching(async () => ok(page));
    const outcome = await controller.fetchProvider("filamentcolors");
    expect(outcome.kind).toBe("ok");
    expect(controller.info).toMatchObject({
      providerId: "filamentcolors",
      origin: "fetch",
      attribution: "FilamentColors (filamentcolors.xyz)",
      usable: 1,
      name: "data.example.org",
    });
    expect(controller.counts().matched).toBeGreaterThan(0);
    expect(Object.keys(memory.state.cache)).toEqual(["filamentcolors"]);
    expect(calls).toHaveLength(1);

    controller.unload();
    const reused = await controller.fetchProvider("filamentcolors");
    expect(reused.kind === "ok" && reused.info.origin).toBe("cache");
    expect(calls).toHaveLength(1);

    const forced = await controller.fetchProvider("filamentcolors", { force: true });
    expect(forced.kind).toBe("ok");
    expect(calls).toHaveLength(2);

    advance(3_600_001);
    expect(controller.cached("filamentcolors")).toBeNull();
    await controller.fetchProvider("filamentcolors");
    expect(calls).toHaveLength(3);
  });

  test("changing the address misses the cache", async () => {
    const { controller, calls } = fetching(async () => ok(page));
    await controller.fetchProvider("filamentcolors");
    controller.saveProviderSettings("filamentcolors", {
      ...providerSettings,
      urlTemplate: "https://other.example.org/api",
    });
    await controller.fetchProvider("filamentcolors");
    expect(calls).toHaveLength(2);
  });

  test("errors are reported without touching the catalog", async () => {
    const { controller } = fetching(async () => {
      throw new TypeError("Failed to fetch");
    });
    controller.loadFile("ref.json", referenceFile);
    const outcome = await controller.fetchProvider("filamentcolors", { force: true });
    expect(outcome.kind === "error" && outcome.message).toContain("CORS");
    expect(controller.info?.name).toBe("ref.json");
    expect(controller.busy).toBe(false);
  });

  test("a newer load makes an older response stale", async () => {
    let release: (response: ReferenceResponse) => void = () => {};
    const { controller } = fetching(
      () => new Promise<ReferenceResponse>((resolve) => (release = resolve)),
    );
    const pending = controller.fetchProvider("filamentcolors", { force: true });
    expect(controller.busy).toBe(true);
    controller.loadFile("ref.json", referenceFile);
    release(ok(page));
    expect(await pending).toEqual({ kind: "stale" });
    expect(controller.info?.name).toBe("ref.json");
    expect(controller.busy).toBe(false);
  });

  test("cancel stops a fetch and ignores whatever arrives", async () => {
    let release: (response: ReferenceResponse) => void = () => {};
    const { controller } = fetching(
      () => new Promise<ReferenceResponse>((resolve) => (release = resolve)),
    );
    const pending = controller.fetchProvider("filamentcolors", { force: true });
    controller.cancel();
    release(ok(page));
    expect(await pending).toEqual({ kind: "stale" });
    expect(controller.catalog).toBeNull();
    expect(controller.progress).toBeNull();
  });
});

describe("ReferenceController snapshot and update checks", () => {
  const HOUR = 3_600_000;
  const swatch = (id: number) => ({
    id,
    manufacturer: { name: "Prusament" },
    color_name: `Galaxy ${id}`,
    filament_type: { name: "PLA" },
    hex_color: "1A1A1A",
  });
  const reply = (body: unknown): ReferenceResponse => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  });

  /** A FilamentColors-shaped service whose total can be changed or taken offline. */
  function world(options: { total?: number; snapshot?: ReferenceSnapshot | null } = {}) {
    const state = {
      total: options.total ?? 5,
      offline: false,
      downloadsFail: false,
      probes: 0,
      downloads: 0,
      now: 100 * HOUR,
    };
    const io: ReferenceIO = {
      now: () => state.now,
      sleep: async () => {},
      async fetch(url) {
        if (state.offline) throw new TypeError("Failed to fetch");
        if (url.endsWith("page_size=1")) {
          state.probes += 1;
          return reply({ count: state.total, results: [{ id: state.total, date_published: "d" }] });
        }
        if (state.downloadsFail) throw new TypeError("Failed to fetch");
        state.downloads += 1;
        return reply({
          count: state.total,
          next: null,
          results: Array.from({ length: state.total }, (_, i) => swatch(i + 1)),
        });
      },
    };
    const snapshotCalls = { count: 0 };
    const snapshots: ReferenceSnapshots = {
      load: async () => {
        snapshotCalls.count += 1;
        return options.snapshot ?? null;
      },
    };
    const memory = memoryStore();
    const controller = new ReferenceController(new Map(), memory.store, io, snapshots);
    return { state, controller, memory, snapshotCalls };
  }

  const snapshotOf = (count: number, at: number, token: string | null): ReferenceSnapshot => ({
    providerId: "filamentcolors",
    generatedAt: at,
    sourceToken: token,
    source: "https://filamentcolors.xyz/api/swatch/?page_size=100",
    attribution: "FilamentColors (filamentcolors.xyz)",
    license: null,
    skipped: 0,
    filaments: Array.from({ length: count }, (_, i) => ({
      id: String(i + 1),
      providerId: "filamentcolors",
      providerLabel: "FilamentColors",
      vendor: "Prusament",
      name: null,
      material: "PLA",
      colorName: `Galaxy ${i + 1}`,
      colorHex: "1A1A1A",
      colorHexes: ["1A1A1A"],
      diameter: null,
      density: null,
      nozzleTempMin: null,
      nozzleTempMax: null,
      bedTempMin: null,
      bedTempMax: null,
      initialWeight: null,
      emptySpoolWeight: null,
      price: null,
      barcode: null,
      url: null,
      attribution: "FilamentColors (filamentcolors.xyz)",
      license: null,
    })),
  });

  test("a fresh snapshot is used without contacting the service, and kept in the browser", async () => {
    const { state, controller, memory } = world({ snapshot: snapshotOf(5, 99 * HOUR, "5:5:d") });
    const outcome = await controller.fetchProvider("filamentcolors");
    expect(outcome.kind === "ok" && outcome.info).toMatchObject({ origin: "snapshot", usable: 5 });
    expect(state.probes + state.downloads).toBe(0);
    await Promise.resolve();
    expect(memory.state.cache["filamentcolors"]).toMatchObject({
      via: "snapshot",
      count: 5,
      sourceToken: "5:5:d",
    });
    expect(memory.state.bodies["filamentcolors"]).toHaveLength(5);
  });

  test("a stale snapshot that is still current costs one small check, then counts as fresh", async () => {
    const { state, controller, memory } = world({ snapshot: snapshotOf(5, 52 * HOUR, "5:5:d") });
    const outcome = await controller.fetchProvider("filamentcolors");
    expect(outcome.kind === "ok" && outcome.info.note).toContain("nothing has changed");
    expect(state).toMatchObject({ probes: 1, downloads: 0 });
    expect(memory.state.cache["filamentcolors"]!.fetchedAt).toBe(100 * HOUR);

    controller.unload();
    state.now += HOUR;
    const again = await controller.fetchProvider("filamentcolors");
    expect(again.kind === "ok" && again.info.origin).toBe("cache");
    expect(state).toMatchObject({ probes: 1, downloads: 0 });
  });

  test("changed data is downloaded once, replaces the snapshot, and records its token", async () => {
    const { state, controller, memory } = world({
      total: 7,
      snapshot: snapshotOf(5, 52 * HOUR, "5:5:d"),
    });
    const outcome = await controller.fetchProvider("filamentcolors");
    expect(outcome.kind === "ok" && outcome.info).toMatchObject({ origin: "fetch", usable: 7 });
    expect(state).toMatchObject({ probes: 1, downloads: 1 });
    expect(memory.state.cache["filamentcolors"]).toMatchObject({
      via: "fetch",
      count: 7,
      sourceToken: "7:7:d",
    });
  });

  test("when the service cannot be reached the copy in hand is used and the person is told", async () => {
    const { state, controller } = world({ snapshot: snapshotOf(5, 52 * HOUR, "5:5:d") });
    state.offline = true;
    const outcome = await controller.fetchProvider("filamentcolors");
    expect(outcome.kind === "ok" && outcome.info).toMatchObject({ origin: "snapshot", usable: 5 });
    expect(outcome.kind === "ok" && outcome.info.note).toContain("Could not check");
  });

  test("without a snapshot or copy it downloads live; a failure there is an error", async () => {
    const { state, controller } = world();
    const outcome = await controller.fetchProvider("filamentcolors");
    expect(outcome.kind === "ok" && outcome.info.origin).toBe("fetch");
    expect(state.downloads).toBe(1);

    const offline = world();
    offline.state.offline = true;
    const failed = await offline.controller.fetchProvider("filamentcolors");
    expect(failed.kind).toBe("error");
  });

  test("a download that fails after the check falls back to the older copy", async () => {
    const { state, controller } = world({ total: 7, snapshot: snapshotOf(5, 52 * HOUR, "5:5:d") });
    state.downloadsFail = true;
    const outcome = await controller.fetchProvider("filamentcolors");
    expect(outcome.kind === "ok" && outcome.info).toMatchObject({ origin: "snapshot", usable: 5 });
    expect(outcome.kind === "ok" && outcome.info.note).toContain("Could not reach");
  });

  test("force downloads regardless; a custom address ignores snapshot and check", async () => {
    const { state, controller, snapshotCalls } = world({
      snapshot: snapshotOf(5, 100 * HOUR, "5:5:d"),
    });
    await controller.fetchProvider("filamentcolors", { force: true });
    expect(state.downloads).toBe(1);
    expect(snapshotCalls.count).toBe(0);

    const custom = world({ snapshot: snapshotOf(5, 100 * HOUR, "5:5:d") });
    custom.controller.saveProviderSettings("filamentcolors", {
      urlTemplate: "https://filamentcolors.xyz/api/swatch/?page_size=50",
      mapping: {},
      pagination: { kind: "next-link", path: "next" },
      ttlHours: 24,
      minIntervalMs: 0,
      attribution: "",
    });
    await custom.controller.fetchProvider("filamentcolors");
    expect(custom.snapshotCalls.count).toBe(0);
    expect(custom.state.probes).toBe(0);
  });
});
