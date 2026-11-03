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

  test("accepts the Mac and iOS app sources as read-only inputs", () => {
    const options = parseArgs([
      "--spoolmaster",
      "stock.xlsx",
      "--spool-hoarder",
      "hoarder.csv",
      "--spool",
      "backup.json",
      "--spoolkeep",
      "keep.json",
    ]);
    expect(Object.fromEntries(options.inputs)).toEqual({
      spoolmaster: "stock.xlsx",
      spoolhoarder: "hoarder.csv",
      spoolapp: "backup.json",
      spoolkeep: "keep.json",
    });
    for (const source of ["spoolmaster", "spoolhoarder", "spoolapp", "spoolkeep"])
      expect(() => parseArgs([...files, "--empty", source])).toThrow("read-only");
    expect(pairArg("spoolapp:a,spoolkeep:b")).toBe(pairArg("spoolkeep:b,spoolapp:a"));
  });

  test("--export-csv allows a single inventory but not comparison options", () => {
    const options = parseArgs(["--spoolkeep", "keep.json", "--export-csv", "all.csv"]);
    expect(options.exportCsv).toBe("all.csv");
    expect(() => parseArgs(["--spoolkeep", "keep.json"])).toThrow("at least two");
    expect(() => parseArgs(["--export-csv", "all.csv"])).toThrow("at least one inventory");
    expect(() =>
      parseArgs(["--spoolkeep", "keep.json", "--export-csv", "a.csv", "--output-dir", "out"]),
    ).toThrow("single inventory");
    expect(() =>
      parseArgs(["--spoolkeep", "k.json", "--export-csv", "a.csv", "--export-csv", "b.csv"]),
    ).toThrow("only be provided once");
    expect(parseArgs([...files, "--export-csv", "all.csv"]).exportCsv).toBe("all.csv");
  });

  test("--watch needs file inputs and refuses to write to a service", () => {
    const fileInputs = ["--spoolio", "a.json", "--spoolkeep", "b.json"];
    expect(parseArgs([...fileInputs, "--watch"]).watch).toBe(true);
    expect(() => parseArgs([...fileInputs, "--watch", "--spoolman-url", "http://x"])).toThrow(
      "--*-url",
    );
    expect(() =>
      parseArgs(["--spoolman-url", "http://x", "--empty", "spoolio", "--watch"]),
    ).toThrow("--*-url");
    expect(() =>
      parseArgs([...fileInputs, "--filamentdb-url", "http://x", "--apply", "--watch"]),
    ).toThrow("--watch cannot be combined with --apply");
    expect(() => parseArgs(["--empty", "spoolio,filameter", "--watch"])).toThrow(
      "at least one file input",
    );
  });

  test("--quiet only applies with --watch", () => {
    const fileInputs = ["--spoolio", "a.json", "--spoolkeep", "b.json"];
    expect(parseArgs([...fileInputs, "--watch", "--quiet"]).quiet).toBe(true);
    expect(parseArgs(fileInputs).quiet).toBe(false);
    expect(() => parseArgs([...fileInputs, "--quiet"])).toThrow("only applies with --watch");
  });

  test("--reorder is report-only and works with a single inventory", () => {
    expect(parseArgs(["--spoolkeep", "k.json", "--reorder"]).reorder).toBe(true);
    expect(() => parseArgs(["--spoolkeep", "k.json", "--reorder", "--output-dir", "o"])).toThrow(
      "--reorder only reports",
    );
    expect(() => parseArgs(["--spoolkeep", "k.json"])).toThrow("--reorder for what is running low");
  });

  test("--low-threshold takes whole percents and applies to the low-stock reports", () => {
    expect(
      parseArgs(["--spoolkeep", "k.json", "--reorder", "--low-threshold", "30"]).lowThreshold,
    ).toBe(30);
    expect(
      parseArgs(["--spoolkeep", "k.json", "--summary", "--low-threshold=5"]).lowThreshold,
    ).toBe(5);
    for (const bad of ["0", "91", "12.5", "abc", "-3"])
      expect(() =>
        parseArgs(["--spoolkeep", "k.json", "--reorder", `--low-threshold=${bad}`]),
      ).toThrow("whole number of percent from 1 to 90");
    expect(() =>
      parseArgs(["--spoolkeep", "k.json", "--spoolio", "s.json", "--low-threshold", "20"]),
    ).toThrow("applies to --summary and --reorder");
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

  test("--format selects text or json and --json is an alias for --format json", () => {
    expect(parseArgs(files).json).toBe(false);
    expect(parseArgs([...files, "--format", "json"]).json).toBe(true);
    expect(parseArgs([...files, "--format=json"]).json).toBe(true);
    expect(parseArgs([...files, "--format", "text"]).json).toBe(false);
    expect(parseArgs([...files, "--json", "--format", "json"]).json).toBe(true);
  });

  test("--format rejects unknown values, repeats, and a conflict with --json", () => {
    expect(() => parseArgs([...files, "--format", "yaml"])).toThrow(
      'Unknown format "yaml". Choose one of: text, json.',
    );
    expect(() => parseArgs([...files, "--format"])).toThrow("--format requires a value");
    expect(() => parseArgs([...files, "--format", "json", "--format=text"])).toThrow(
      "--format may only be provided once",
    );
    expect(() => parseArgs([...files, "--json", "--format", "text"])).toThrow(
      "cannot be combined with --format text",
    );
    expect(() => parseArgs([...files, "--formta", "json"])).toThrow("Did you mean --format?");
  });
});
