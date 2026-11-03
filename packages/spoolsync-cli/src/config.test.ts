import { describe, expect, test } from "bun:test";
import path from "node:path";

import { parseArgs } from "./args";
import { expandConfig } from "./config";

const files = (map: Record<string, string>) => ({
  readText(filename: string): string {
    const text = map[filename];
    if (text === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" as const });
    return text;
  },
});

describe("expandConfig", () => {
  test("returns the arguments untouched when there is no --config", () => {
    const args = ["--spoolio", "a.json"];
    expect(expandConfig(args, files({}))).toBe(args);
  });

  test("turns keys into options, resolving paths against the config file", () => {
    const expanded = expandConfig(
      ["--config", "conf/spoolsync.json", "--json"],
      files({
        "conf/spoolsync.json": JSON.stringify({
          spoolio: "data/spoolio.json",
          "output-dir": "/abs/out",
          resolve: ["material=spoolio", "name=spoolio"],
          "create-in": "spoolio",
          apply: false,
          summary: true,
          "spoolman-url": "http://spoolman.local",
        }),
      }),
    );
    expect(expanded).toEqual([
      `--spoolio=${path.join(path.resolve("conf"), "data/spoolio.json")}`,
      "--output-dir=/abs/out",
      "--resolve=material=spoolio",
      "--resolve=name=spoolio",
      "--create-in=spoolio",
      "--summary",
      "--spoolman-url=http://spoolman.local",
      "--json",
    ]);
  });

  test("command-line options replace the same option from the file, including aliases", () => {
    const expanded = expandConfig(
      ["--config=c.json", "--output-dir", "mine", "--3dfp", "x.csv", "--resolve", "name=spoolio"],
      files({
        "c.json": JSON.stringify({
          "output-dir": "theirs",
          "three-dfp": "y.csv",
          resolve: ["material=spoolio"],
          spoolio: "s.json",
        }),
      }),
    );
    expect(expanded.some((arg) => arg.includes("theirs"))).toBe(false);
    expect(expanded.some((arg) => arg.includes("y.csv"))).toBe(false);
    expect(expanded.some((arg) => arg.startsWith("--resolve=material"))).toBe(false);
    expect(expanded.filter((arg) => arg.startsWith("--spoolio="))).toHaveLength(1);
    expect(expanded.slice(-6)).toEqual([
      "--output-dir",
      "mine",
      "--3dfp",
      "x.csv",
      "--resolve",
      "name=spoolio",
    ]);
  });

  test("refuses secrets, unknown keys, wrong types, and unreadable files", () => {
    const read = (config: unknown) =>
      expandConfig(["--config", "c.json"], files({ "c.json": JSON.stringify(config) }));
    expect(() => read({ "spoolman-token": "abc" })).toThrow("looks like a secret");
    expect(() => read({ password: "x" })).toThrow("environment");
    expect(() => read({ "output-dr": "x" })).toThrow('Did you mean "output-dir"?');
    expect(() => read({ unrelated: 1 })).toThrow('unknown key "unrelated"');
    expect(() => read({ apply: "yes" })).toThrow("must be true or false");
    expect(() => read({ resolve: [1] })).toThrow("list of text values");
    expect(() => read({ "output-dir": "" })).toThrow("must be a text value");
    expect(() => read([])).toThrow("must contain a JSON object");
    expect(() => expandConfig(["--config", "c.json"], files({ "c.json": "{nope" }))).toThrow(
      "not valid JSON",
    );
    expect(() => expandConfig(["--config", "gone.json"], files({}))).toThrow("was not found");
    expect(() => expandConfig(["--config"], files({}))).toThrow("requires a value");
    expect(() => expandConfig(["--config=a", "--config", "b"], files({}))).toThrow("only be");
  });
});

test("parseArgs combines a real config file with command-line options", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const directory = await mkdtemp(path.join(tmpdir(), "spoolsync-config-"));
  try {
    await writeFile(
      path.join(directory, "spoolsync.json"),
      JSON.stringify({
        spoolkeep: "keep.json",
        spoolio: "spoolio.json",
        "output-dir": "updated",
        "create-in": ["spoolio"],
      }),
    );
    const options = parseArgs(["--config", path.join(directory, "spoolsync.json"), "--json"]);
    expect(options.inputs.get("spoolkeep")).toBe(path.join(directory, "keep.json"));
    expect(options.inputs.get("spoolio")).toBe(path.join(directory, "spoolio.json"));
    expect(options.outputDir).toBe(path.join(directory, "updated"));
    expect(options.createIn).toEqual(["spoolio"]);
    expect(options.json).toBe(true);

    const overridden = parseArgs([
      "--config",
      path.join(directory, "spoolsync.json"),
      "--output-dir",
      "elsewhere",
    ]);
    expect(overridden.outputDir).toBe("elsewhere");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
