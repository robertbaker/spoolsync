import { expect, test } from "bun:test";

import { parseArgs } from "./args";
import { closestOption, editDistance } from "./suggest";

test("edit distance counts insertions, deletions, and substitutions", () => {
  expect(editDistance("abc", "abc")).toBe(0);
  expect(editDistance("--spolman", "--spoolman")).toBe(1);
  expect(editDistance("", "abc")).toBe(3);
  expect(editDistance("kitten", "sitting")).toBe(3);
});

test("only near matches are suggested, and only for long options", () => {
  const known = ["--spoolman", "--output-dir", "--export-csv"];
  expect(closestOption("--spolman", known)).toBe("--spoolman");
  expect(closestOption("--output-dr", known)).toBe("--output-dir");
  expect(closestOption("--completely-different", known)).toBeUndefined();
  expect(closestOption("spolman", known)).toBeUndefined();
});

test("unknown options in the CLI suggest the closest real one", () => {
  expect(() => parseArgs(["--spolman", "a.json", "--spoolio", "b.json"])).toThrow(
    "Unknown option: --spolman. Did you mean --spoolman?",
  );
  expect(() => parseArgs(["--export-cvs", "a.csv"])).toThrow("Did you mean --export-csv?");
  expect(() => parseArgs(["--unknown-option"])).toThrow(/^Unknown option: --unknown-option$/);
});
