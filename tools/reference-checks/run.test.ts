import { expect, test } from "bun:test";

import { runReferenceChecks } from "./run";

function fixture(files: Record<string, string>) {
  const reads: string[] = [];
  const logs: unknown[][] = [];
  const errors: unknown[][] = [];
  return {
    reads,
    logs,
    errors,
    dependencies: {
      listFiles: async () => Object.keys(files),
      readText: async (name: string) => {
        reads.push(name);
        return files[name]!;
      },
      log: (...values: unknown[]) => {
        logs.push(values);
      },
      error: (...values: unknown[]) => {
        errors.push(values);
      },
    },
  };
}

test("reference checks run through injected I/O and retain expected unsupported-format checks", async () => {
  const f = fixture({
    "notes.txt": "Ignored",
    "SPOOLIO-empty.json": '{"version":1,"filaments":[]}',
    "spoolman.db": "SQLite format 3\0",
    "my-spools-hueforge.csv": "uuid,secondary_type,td\none,PLA,1",
  });
  expect(await runReferenceChecks(f.dependencies)).toEqual({ checks: 13, failures: 0 });
  expect(f.reads).toEqual(["SPOOLIO-empty.json", "spoolman.db", "my-spools-hueforge.csv"]);
  expect(f.errors).toEqual([]);
  expect(f.logs.at(-1)).toEqual(["13 reference checks completed; 0 failures."]);
});

test("reference checks retain earlier conversion counts when a later target rejects the file", async () => {
  const f = fixture({
    "spoolio-fractional.json": JSON.stringify({
      version: 1,
      filaments: [
        {
          id: "one",
          type: "PLA",
          brand: "Generic",
          weightTotal: 1.5,
          weightRemaining: 1,
        },
      ],
    }),
  });
  expect(await runReferenceChecks(f.dependencies)).toEqual({ checks: 4, failures: 1 });
  expect(f.errors[0]![0]).toBe("spoolio-fractional.json");
  expect(String(f.errors[0]![1])).toContain("label weight must be a whole number");
});

test("reference checks continue after invalid input and report the failure", async () => {
  const f = fixture({ "spoolio-broken.json": "not JSON", "spoolman.db": "SQLite format 3\0" });
  expect(await runReferenceChecks(f.dependencies)).toEqual({ checks: 1, failures: 1 });
  expect(f.errors[0]![0]).toBe("spoolio-broken.json");
  expect(f.logs.at(-1)).toEqual(["1 reference checks completed; 1 failures."]);
});

test("reference checks report an empty supported input set without reading unrelated files", async () => {
  const f = fixture({ "notes.txt": "Ignored" });
  await expect(runReferenceChecks(f.dependencies)).rejects.toThrow(
    "No supported reference inventories were found in ref/.",
  );
  expect(f.reads).toEqual([]);
  expect(f.logs.at(-1)).toEqual(["0 reference checks completed; 0 failures."]);
});
