import { describe, expect, test } from "bun:test";

import { parseArgs, pairArg } from "./args";

const files = ["--spoolman", "spools.json", "--spoolio", "inventory.json"];

describe("CLI arguments", () => {
  test("output directories require an actual file-export target", () => {
    const remote = ["--spoolman-url", "http://localhost", "--spoolstock", "source.csv"];
    expect(() => parseArgs([...remote, "--output-dir", "updated"])).toThrow(
      "requires a writable file input",
    );
    expect(parseArgs([...remote, "--empty", "spoolio", "--output-dir", "updated"]).outputDir).toBe(
      "updated",
    );
  });
  test("inline values beginning with a dash stay values and do not consume the next flag", () => {
    const options = parseArgs([
      "--spoolman=--inventory.json",
      "--spoolio=inventory.json",
      "--output-dir=-updated",
      "--json",
    ]);
    expect(options.inputs.get("spoolman")).toBe("--inventory.json");
    expect(options.outputDir).toBe("-updated");
    expect(options.json).toBe(true);
  });

  test("separate values containing equals signs are preserved literally", () => {
    const options = parseArgs([
      "--spoolman",
      "inventory=name.json",
      "--spoolio",
      "inventory.json",
      "--output-dir",
      "folder=name",
    ]);
    expect(options.inputs.get("spoolman")).toBe("inventory=name.json");
    expect(options.outputDir).toBe("folder=name");
  });
  test("rejects repeated connection and output options", () => {
    for (const flag of ["--output-dir", "--spoolman-url", "--spoolman-token"])
      expect(() => parseArgs([...files, flag, "first", `${flag}=second`])).toThrow(
        `${flag} may only be provided once`,
      );
  });

  test("does not silently ignore a token supplied without a remote server", () => {
    expect(() => parseArgs([...files, "--spoolman-token", "secret"])).toThrow(
      "requires --spoolman-url",
    );
  });
  test("accepts empty targets for creating records and counts them as loaded", () => {
    const options = parseArgs([
      "--spoolman",
      "spools.json",
      "--empty",
      "spoolio,filameter",
      "--empty",
      "spoolio",
      "--create-in",
      "spoolio,filameter",
    ]);
    expect(options.empty).toEqual(["spoolio", "filameter"]);
    expect(options.createIn).toEqual(["spoolio", "filameter"]);
  });

  test("rejects conflicting and read-only empty targets", () => {
    expect(() => parseArgs([...files, "--empty", "spoolio"])).toThrow("not both");
    expect(() => parseArgs(["--spoolman-url", "http://localhost", "--empty", "spoolman"])).toThrow(
      "not both",
    );
    expect(() => parseArgs([...files, "--empty", "spoolstock"])).toThrow("read-only");
    expect(() => parseArgs([...files, "--empty", "unknown"])).toThrow("Unknown source");
  });
  test("accepts equals syntax without losing equals signs in values", () => {
    const options = parseArgs([
      "--spoolman=spools.json",
      "--spoolio=inventory.json",
      "--resolve=material=spoolman",
      "--output-dir=folder=name",
    ]);
    expect(options.inputs.get("spoolman")).toBe("spools.json");
    expect(options.resolves).toEqual([["material", "spoolman"]]);
    expect(options.outputDir).toBe("folder=name");
    expect(() => parseArgs([...files, "--output-dir="])).toThrow("requires a value");
    expect(() => parseArgs([...files, "--json=false"])).toThrow("Unknown option");
  });

  test("rejects conflicting resolution sources and deduplicates identical choices", () => {
    expect(() =>
      parseArgs([...files, "--resolve", "material=spoolman", "--resolve", "material=spoolio"]),
    ).toThrow("Conflicting resolutions for material");
    expect(
      parseArgs([...files, "--resolve", "material=spoolman", "--resolve", "material=spoolman"])
        .resolves,
    ).toEqual([["material", "spoolman"]]);
  });
  test("accepts remote Spoolman as a resolution source and creation target", () => {
    const options = parseArgs([
      "--spoolman-url",
      "http://localhost:7912",
      "--spoolio",
      "inventory.json",
      "--resolve",
      "material=spoolman",
      "--create-in",
      "spoolman",
      "--apply",
    ]);
    expect(options.resolves).toEqual([["material", "spoolman"]]);
    expect(options.createIn).toEqual(["spoolman"]);
    expect(options.apply).toBe(true);
  });

  test("rejects missing values before short flags", () => {
    expect(() => parseArgs(["--spoolman", "-h"])).toThrow("requires a value");
  });

  test("treats inherited object property names as unknown options", () => {
    expect(() => parseArgs(["constructor", "file.json", ...files])).toThrow("Unknown option");
  });

  test("validates decisions before loading inventory files", () => {
    expect(() => parseArgs([...files, "--confirm", "invalid"])).toThrow("Invalid pair");
    expect(() => parseArgs([...files, "--confirm", "spoolman:1,filameter:2"])).toThrow(
      "loaded filameter",
    );
    expect(() =>
      parseArgs([
        ...files,
        "--confirm",
        "spoolman:1,spoolio:2",
        "--reject",
        "spoolio:2,spoolman:1",
      ]),
    ).toThrow("both confirmed and rejected");
  });

  test("requires distinct sources and unambiguous IDs", () => {
    expect(() => pairArg("spoolman:1,spoolman:2")).toThrow("different inventory sources");
    expect(() => pairArg("spoolman:1|2,spoolio:3")).toThrow("cannot contain |");
    expect(pairArg("spoolman:1,spoolio:2")).toBe(pairArg("spoolio:2,spoolman:1"));
  });

  test("keeps remote writes opt-in and disallows ambiguous Spoolman input", () => {
    expect(parseArgs(files).apply).toBe(false);
    expect(() => parseArgs([...files, "--apply"])).toThrow("requires --spoolman-url");
    expect(() => parseArgs([...files, "--spoolman-url", "http://localhost:7912"])).toThrow(
      "not both",
    );
  });
});
