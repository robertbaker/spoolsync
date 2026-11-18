import { expect, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import { parseArgs } from "./args";
import { runInteractiveChoices, type InteractivePrompts } from "./interactive";
import { createCliPlan } from "./planning";
import { defaultDependencies, type CliDependencies, type CliOutput } from "./runtime";
import { runWorkflow } from "./workflow";

function fakePrompts(
  answers: {
    selects?: Array<string | symbol>;
    multiselects?: Array<string[] | symbol>;
    confirms?: Array<boolean | symbol>;
    texts?: Array<string | symbol>;
  } = {},
  messages: string[] = [],
): InteractivePrompts {
  const selects = [...(answers.selects ?? [])];
  const multiselects = [...(answers.multiselects ?? [])];
  const confirms = [...(answers.confirms ?? [])];
  const texts = [...(answers.texts ?? [])];
  const cancelSymbol = Symbol("cancel");
  return {
    intro() {},
    outro() {},
    note(message, title) {
      messages.push(`${title ?? ""}\n${message}`);
    },
    cancel() {},
    info() {},
    async select() {
      return (selects.shift() ?? "skip") as never;
    },
    async multiselect() {
      return (multiselects.shift() ?? []) as never;
    },
    async confirm(options) {
      messages.push(options.message);
      return confirms.shift() ?? false;
    },
    async text() {
      return texts.shift() ?? "";
    },
    isCancel: (value): value is symbol => typeof value === "symbol" || value === cancelSymbol,
  };
}

test("interactive mode confirms match suggestions and resolves field conflicts", async () => {
  const options = parseArgs(["--spoolman", "a.json", "--spoolio", "b.json", "-i"]);
  expect(options.interactive).toBe(true);

  const loaded = new Map<SourceId, LoadResult>([
    [
      "spoolman",
      {
        source: "spoolman",
        spools: [
          makeSpool("spoolman", "1", {
            vendor: "Prusa",
            material: "PLA",
            name: "Galaxy Black",
            colors: ["#111111"],
            remainingWeight: 800,
          }),
        ],
        warnings: [],
        loadedAt: "now",
      },
    ],
    [
      "spoolio",
      {
        source: "spoolio",
        spools: [
          makeSpool("spoolio", "2", {
            vendor: "Prusa",
            material: "PLA",
            name: "Galaxy Black",
            colors: ["#111111"],
            remainingWeight: 750,
          }),
        ],
        warnings: [],
        loadedAt: "now",
      },
    ],
  ]);

  const initialPlan = createCliPlan(options, loaded);
  expect(initialPlan.matches.suggestions).toHaveLength(1);

  const messages: string[] = [];
  const result = await runInteractiveChoices(
    options,
    loaded,
    initialPlan,
    undefined,
    fakePrompts(
      {
        selects: ["confirm", "spoolman"],
        multiselects: [[]],
        confirms: [true],
        texts: ["./updated"],
      },
      messages,
    ),
  );

  expect(result.cancelled).toBe(false);
  expect(result.options.confirm).toEqual(["spoolman:1,spoolio:2"]);
  expect(result.options.resolves).toEqual([["remainingWeight", "spoolman"]]);
  expect(result.options.outputDir).toBe("./updated");
  expect(result.planning.summary.unresolved).toHaveLength(0);
  expect(result.planning.summary.changes["spoolio"]?.updates).toBe(1);
  expect(messages).toContain(
    "Loaded inventories\nSpoolman (spoolman)  1 spool\nSpoolio (spoolio)  1 spool",
  );
  const exportNote = messages.find((message) => message.startsWith("Planned file exports\n"));
  expect(exportNote).toBeDefined();
  expect(exportNote).toMatch(/\d+ updates?, \d+ creates?/);
});

test("interactive mode cancels cleanly without writing", async () => {
  const options = parseArgs(["--spoolman", "a.json", "--spoolio", "b.json", "--interactive"]);
  const loaded = new Map<SourceId, LoadResult>([
    [
      "spoolman",
      {
        source: "spoolman",
        spools: [
          makeSpool("spoolman", "1", {
            vendor: "Prusa",
            material: "PLA",
            name: "Blue",
            colors: ["#0000ff"],
          }),
        ],
        warnings: [],
        loadedAt: "now",
      },
    ],
    [
      "spoolio",
      {
        source: "spoolio",
        spools: [
          makeSpool("spoolio", "2", {
            vendor: "Prusa",
            material: "PLA",
            name: "Blue",
            colors: ["#0000ff"],
          }),
        ],
        warnings: [],
        loadedAt: "now",
      },
    ],
  ]);

  const initialPlan = createCliPlan(options, loaded);
  const cancelSym = Symbol("cancel");
  const result = await runInteractiveChoices(
    options,
    loaded,
    initialPlan,
    undefined,
    fakePrompts({ selects: [cancelSym] }),
  );

  expect(result.cancelled).toBe(true);
});

test("interactive mode refuses non-TTY terminals and incompatible flags", async () => {
  expect(() => parseArgs(["--spoolman", "a.json", "--spoolio", "b.json", "-i", "--json"])).toThrow(
    "--interactive cannot be combined with --json",
  );
  expect(() =>
    parseArgs(["--spoolman", "a.json", "--spoolio", "b.json", "-i", "--summary"]),
  ).toThrow("--interactive cannot be combined with report-only options");

  const options = parseArgs(["--spoolman", "a.json", "--spoolio", "b.json", "-i"]);
  const output: CliOutput = {
    log() {},
    warn() {},
    error() {},
    setExitCode() {},
  };
  const deps: CliDependencies = {
    ...defaultDependencies,
    readText: async () => "",
    readBytes: async () => new Uint8Array(),
    loadInventoryFile: async (source) => ({ source, spools: [], warnings: [], loadedAt: "now" }),
    remoteServices: () => [],
    isInteractiveTTY: () => false,
  };

  await expect(runWorkflow(options, deps, output)).rejects.toThrow(
    "--interactive requires an interactive terminal",
  );
});

test("interactive mode can skip all remaining match suggestions", async () => {
  const options = parseArgs(["--spoolman", "a.json", "--spoolio", "b.json", "-i"]);
  const loaded = new Map<SourceId, LoadResult>([
    [
      "spoolman",
      {
        source: "spoolman",
        spools: [
          makeSpool("spoolman", "1", {
            vendor: "Prusa",
            material: "PLA",
            name: "Black",
            colors: ["#111111"],
          }),
          makeSpool("spoolman", "2", {
            vendor: "Prusa",
            material: "PETG",
            name: "Orange",
            colors: ["#ff6600"],
          }),
        ],
        warnings: [],
        loadedAt: "now",
      },
    ],
    [
      "spoolio",
      {
        source: "spoolio",
        spools: [
          makeSpool("spoolio", "10", {
            vendor: "Prusa",
            material: "PLA",
            name: "Black",
            colors: ["#111111"],
          }),
          makeSpool("spoolio", "20", {
            vendor: "Prusa",
            material: "PETG",
            name: "Orange",
            colors: ["#ff6600"],
          }),
        ],
        warnings: [],
        loadedAt: "now",
      },
    ],
  ]);

  const initialPlan = createCliPlan(options, loaded);
  expect(initialPlan.matches.suggestions).toHaveLength(2);

  let selectCalls = 0;
  const prompts = fakePrompts({ multiselects: [[]] });
  prompts.select = (async () => {
    selectCalls++;
    return "skip-all";
  }) as InteractivePrompts["select"];

  const result = await runInteractiveChoices(options, loaded, initialPlan, undefined, prompts);
  expect(result.cancelled).toBe(false);
  expect(selectCalls).toBe(1);
  expect(result.options.confirm).toEqual([]);
  expect(result.options.reject).toEqual([]);
});

test("interactive mode can skip all remaining conflicting fields", async () => {
  const options = parseArgs([
    "--spoolman",
    "a.json",
    "--spoolio",
    "b.json",
    "--confirm",
    "spoolman:1,spoolio:2",
    "-i",
  ]);
  const loaded = new Map<SourceId, LoadResult>([
    [
      "spoolman",
      {
        source: "spoolman",
        spools: [
          makeSpool("spoolman", "1", {
            vendor: "Prusa",
            material: "PLA",
            name: "Black",
            remainingWeight: 800,
          }),
        ],
        warnings: [],
        loadedAt: "now",
      },
    ],
    [
      "spoolio",
      {
        source: "spoolio",
        spools: [
          makeSpool("spoolio", "2", {
            vendor: "Prusament",
            material: "PETG",
            name: "Jet Black",
            remainingWeight: 600,
          }),
        ],
        warnings: [],
        loadedAt: "now",
      },
    ],
  ]);

  const initialPlan = createCliPlan(options, loaded);
  expect(initialPlan.summary.unresolved.length).toBeGreaterThan(1);

  let selectCalls = 0;
  const prompts = fakePrompts({ multiselects: [[]] });
  prompts.select = (async () => {
    selectCalls++;
    return "__skip_all__";
  }) as InteractivePrompts["select"];

  const result = await runInteractiveChoices(options, loaded, initialPlan, undefined, prompts);
  expect(result.cancelled).toBe(false);
  expect(selectCalls).toBe(1);
  expect(result.options.resolves).toEqual([]);
});
