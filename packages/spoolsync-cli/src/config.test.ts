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

  test("numeric keys become options and must be numbers", () => {
    const read = (config: unknown) =>
      expandConfig(["--config", "c.json"], files({ "c.json": JSON.stringify(config) }));
    expect(read({ "low-threshold": 30, summary: true })).toEqual([
      "--low-threshold=30",
      "--summary",
    ]);
    expect(() => read({ "low-threshold": "30" })).toThrow("must be a number");
  });

  test("refuses secrets, unknown keys, wrong types, and unreadable files", () => {
    const read = (config: unknown) =>
      expandConfig(["--config", "c.json"], files({ "c.json": JSON.stringify(config) }));
    expect(() => read({ "spoolman-token": "abc" })).toThrow("looks like a secret");
    expect(() => read({ password: "x" })).toThrow("environment");
    expect(() => read({ "output-dr": "x" })).toThrow('Did you mean "output-dir"?');
    expect(() => read({ unrelated: 1 })).toThrow('unknown key "unrelated"');
    expect(() => read({ summary: "yes" })).toThrow("must be true or false");
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

describe("the per-user settings file", () => {
  const USER = "/home/ada/.config/spoolsync/config.json";
  const withUser = (config: unknown, args: string[], extra: Record<string, string> = {}) => {
    const notes: string[] = [];
    const expanded = expandConfig(args, files({ [USER]: JSON.stringify(config), ...extra }), {
      userConfig: { path: USER },
      onNote: (message) => notes.push(message),
    });
    return { expanded, notes };
  };

  test("supplies defaults beneath the command line", () => {
    const { expanded } = withUser(
      { "output-dir": "out", "low-threshold": 30, "create-in": ["spoolio"] },
      ["--spoolio", "a.json", "--output-dir", "mine"],
    );
    expect(expanded.some((arg) => arg.includes("out") && arg.startsWith("--output-dir="))).toBe(
      false,
    );
    expect(expanded).toContain("--low-threshold=30");
    expect(expanded).toContain("--create-in=spoolio");
    expect(expanded.slice(-4)).toEqual(["--spoolio", "a.json", "--output-dir", "mine"]);
  });

  test("saved inventories apply only when the command line names none", () => {
    const saved = {
      spoolio: "/data/spoolio.json",
      spoolkeep: "/data/keep.json",
      "output-dir": "/out",
    };
    const none = withUser(saved, ["--summary"]);
    expect(none.expanded).toContain("--spoolio=/data/spoolio.json");
    expect(none.expanded).toContain("--spoolkeep=/data/keep.json");
    expect(none.notes).toHaveLength(1);
    expect(none.notes[0]).toContain("saved in /home/ada/.config/spoolsync/config.json");

    // Naming any inventory means the saved set is left out, so it never joins your comparison.
    const some = withUser(saved, ["--spoolman", "m.json", "--summary"]);
    expect(some.expanded.some((arg) => arg.startsWith("--spoolio="))).toBe(false);
    expect(some.expanded.some((arg) => arg.startsWith("--spoolkeep="))).toBe(false);
    expect(some.expanded).toContain("--output-dir=/out");
    expect(some.notes).toEqual([]);
  });

  test("an explicit --config file beats the user file", () => {
    const { expanded } = withUser(
      { "output-dir": "/user-out", "low-threshold": 10, summary: true, reorder: true },
      ["--config", "p.json"],
      {
        "p.json": JSON.stringify({
          "output-dir": "/project-out",
          summary: false,
          reorder: false,
        }),
      },
    );
    expect(expanded).toContain("--output-dir=/project-out");
    expect(expanded).not.toContain("--output-dir=/user-out");
    expect(expanded).not.toContain("--summary");
    expect(expanded).not.toContain("--reorder");
    expect(expanded).toContain("--low-threshold=10");
  });

  test("--no-user-config skips it, and a missing file is simply nothing saved", () => {
    const skipped = withUser({ "output-dir": "/out" }, ["--no-user-config", "--summary"]);
    expect(skipped.expanded).toEqual(["--summary"]);
    const missing = expandConfig(["--summary"], files({}), { userConfig: { path: USER } });
    expect(missing).toEqual(["--summary"]);
  });

  test("a bad user file is reported by name, secrets included", () => {
    expect(() => withUser({ "spoolman-token": "x" }, ["--summary"])).toThrow(USER);
    expect(() => withUser({ "output-dr": "x" }, ["--summary"])).toThrow(
      'Did you mean "output-dir"?',
    );
    expect(() =>
      expandConfig(["--summary"], files({ [USER]: "{nope" }), { userConfig: { path: USER } }),
    ).toThrow("not valid JSON");
  });
});

describe("config safety", () => {
  const read = (config: unknown) =>
    expandConfig(["--config", "c.json"], files({ "c.json": JSON.stringify(config) }));

  test("a config file can never turn writes on", () => {
    for (const apply of [true, false])
      expect(() => read({ apply })).toThrow("cannot be saved as a default setting");
    expect(() => read({ apply: true })).toThrow('Delete the "apply" key from c.json');
  });

  test("the secret hint names every credential variable, including FILAMENT_DB_API_KEY", () => {
    expect(() => read({ password: "x" })).toThrow("FILAMENT_DB_API_KEY");
    expect(() => read({ "spoolman-url": "http://u:p@host" })).toThrow("FILAMENT_DB_API_KEY");
  });

  test("service URLs with credentials in the query string are refused", () => {
    for (const query of [
      "token=abc",
      "api_key=abc",
      "apikey=1",
      "secret=x",
      "password=p",
      "auth=z",
    ])
      expect(() => read({ "spoolman-url": `http://s.local/?${query}` })).toThrow(
        "contains credentials",
      );
    expect(() => read({ "spoolman-url": "http://s.local/?page=2" })).not.toThrow();
  });

  test("rules from a stronger layer replace config rules for the other cleanup option", () => {
    const expanded = expandConfig(
      ["--config", "c.json", "--cleanup-report=casing"],
      files({ "c.json": JSON.stringify({ cleanup: "whitespace" }) }),
    );
    expect(expanded).toEqual(["--cleanup", "--cleanup-report=casing"]);
    expect(() =>
      parseArgs(expanded.concat("--spoolio", "a.json", "--spoolkeep", "b.json")),
    ).not.toThrow();
  });
});
