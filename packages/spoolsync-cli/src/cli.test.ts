import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildXlsx } from "../../spoolsync-core/src/adapters/shared/xlsx-fixture";
import { createFakeSpoolman } from "../../spoolsync-core/src/adapters/spoolman/fake-server";
import { version } from "../package.json";

/**
 * Spawns the CLI with a throwaway settings folder. Bun does not pass runtime changes to
 * `process.env` on to children, so the variable is given explicitly; this keeps every test away
 * from a real person's saved settings.
 */
const spawnIsolated = ((command: string[], options: { env?: Record<string, string> } = {}) =>
  Bun.spawn(command, {
    ...options,
    env: {
      ...process.env,
      ...options.env,
      SPOOLSYNC_CONFIG_DIR: process.env["SPOOLSYNC_CONFIG_DIR"] ?? "",
    },
  } as never)) as typeof Bun.spawn;

/**
 * Stops a running `--watch`. Windows cannot deliver a catchable SIGINT to another process
 * (`kill("SIGINT")` terminates it; Ctrl+C in a console is the only route), so there the CLI is told
 * to stop by a line on its input, which is the route `stopOnQuit` provides for exactly this.
 */
function stopWatching(child: { kill(signal?: NodeJS.Signals): void; stdin?: unknown }) {
  if (process.platform === "win32") {
    const stdin = child.stdin as { write(text: string): unknown; flush?(): unknown };
    stdin.write("q\n");
    void stdin.flush?.();
  } else child.kill("SIGINT");
}

let directory: string;
const compiled = process.env["SPOOLSYNC_CLI_PATH"];
const cli = compiled ? path.resolve(compiled) : path.join(import.meta.dir, "cli.ts");
const runtime = compiled ? "node" : process.execPath;

test("a spool deleted after planning cannot modify a surviving spool's filament", async () => {
  const filament = { id: 10, material: "PLA", name: "Blue", density: 1.24, diameter: 1.75 };
  const fake = createFakeSpoolman({
    filaments: [filament],
    spools: [
      { id: 51, filament },
      { id: 52, filament },
    ],
  });
  let reads = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (
        request.method === "GET" &&
        new URL(request.url).pathname === "/api/v1/spool" &&
        ++reads === 2
      )
        fake.spools.delete(51);
      const body = request.method === "GET" ? undefined : await request.text();
      return fake.fetchImpl(request.url, { method: request.method, ...(body ? { body } : {}) });
    },
  });
  try {
    await writeFile(
      path.join(directory, "spoolio.json"),
      JSON.stringify({
        version: 1,
        filaments: [{ id: "donor", spoolmanId: 51, type: "PETG", colorName: "Blue" }],
      }),
    );
    const child = spawnIsolated(
      [
        runtime,
        cli,
        "--spoolman-url",
        server.url.toString(),
        "--spoolio",
        path.join(directory, "spoolio.json"),
        "--resolve",
        "material=spoolio",
        "--apply",
        "--json",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(1);
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].ok).toBe(false);
    expect(result.applied[0].message).toContain("no longer exists");
    expect(fake.spools.get(52)!.filament.material).toBe("PLA");
    expect(fake.requests.filter((request) => request.method === "PATCH")).toEqual([]);
  } finally {
    await server.stop(true);
  }
});

test("compares a SpoolMaster .xlsx workbook against a writable file inventory", async () => {
  await writeFile(
    path.join(directory, "stock.xlsx"),
    buildXlsx([
      {
        name: "Stock",
        rows: [
          [
            "Brand",
            "Material",
            "Color",
            "Color code",
            "Initial Weight (g)",
            "Remaining Weight (g)",
          ],
          ["Elegoo", "PLA", "Blue", "#0000FF", 1000, 400],
        ],
      },
    ]),
  );
  const child = spawnIsolated(
    [
      runtime,
      cli,
      "--spoolmaster",
      path.join(directory, "stock.xlsx"),
      "--spoolio",
      path.join(directory, "spoolio.json"),
      "--create-in",
      "spoolio",
      "--output-dir",
      path.join(directory, "updated"),
      "--json",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  expect(JSON.parse(stdout)).toBeObject();
  const written = JSON.parse(
    await readFile(path.join(directory, "updated", "spoolio.json"), "utf8"),
  );
  expect(written.filaments).toHaveLength(1);
  expect(written.filaments[0]).toMatchObject({
    brand: "Elegoo",
    type: "PLA",
    weightRemaining: 400,
  });
});

test("--export-csv writes every loaded spool, alone or alongside a comparison", async () => {
  await writeFile(
    path.join(directory, "keep.json"),
    JSON.stringify([{ id: "k1", brand: "Creality", family: "PLA", color: "Blue", newQuantity: 1 }]),
  );
  const run = async (...args: string[]) => {
    const child = spawnIsolated([runtime, cli, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  };

  const single = path.join(directory, "single.csv");
  const alone = await run("--spoolkeep", path.join(directory, "keep.json"), "--export-csv", single);
  expect(alone).toMatchObject({ code: 0, stderr: "" });
  expect(alone.stdout).toContain(`Exported 1 spool to ${single}`);
  const csv = await readFile(single, "utf8");
  expect(csv).toContain("service,id,vendor,material,name");
  expect(csv).toContain("SpoolKeep,k1,Creality,PLA,Blue");

  const both = path.join(directory, "both.csv");
  const combined = await run(
    "--spoolkeep",
    path.join(directory, "keep.json"),
    "--spoolio",
    path.join(directory, "spoolio.json"),
    "--export-csv",
    both,
    "--json",
  );
  expect(combined).toMatchObject({ code: 0, stderr: "" });
  expect(JSON.parse(combined.stdout).csvExport).toBe(both);
  expect((await readFile(both, "utf8")).trim().split("\r\n")).toHaveLength(2);

  // An export can never overwrite one of the inputs.
  const refused = await run(
    "--spoolkeep",
    path.join(directory, "keep.json"),
    "--export-csv",
    path.join(directory, "keep.json"),
  );
  expect(refused.code).not.toBe(0);
  expect(refused.stderr).toContain("would overwrite an input inventory");
  expect(JSON.parse(await readFile(path.join(directory, "keep.json"), "utf8"))).toHaveLength(1);
});

test("--summary reports counts per inventory without planning changes", async () => {
  await writeFile(
    path.join(directory, "keep.json"),
    JSON.stringify([
      { id: "k1", brand: "Creality", family: "PLA", color: "Blue", newQuantity: 2 },
      { id: "k2", brand: "Prusa", family: "PETG", color: "Red", newQuantity: 0, usedQuantity: 0 },
    ]),
  );
  const run = async (...args: string[]) => {
    const child = spawnIsolated([runtime, cli, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  };
  const text = await run("--spoolkeep", path.join(directory, "keep.json"), "--summary");
  expect(text.code).toBe(0);
  expect(text.stdout).toContain(
    "spoolkeep: 3 spools (1 archived), 2 brands, 2 materials, 0 g remaining (3 spools without a known weight)",
  );
  expect(text.stdout).not.toContain("Dry run");

  const json = await run(
    "--spoolkeep",
    path.join(directory, "keep.json"),
    "--spoolio",
    path.join(directory, "spoolio.json"),
    "--summary",
    "--json",
  );
  expect(json.code).toBe(0);
  const report = JSON.parse(json.stdout);
  expect(report.inventories.map((item: { source: string }) => item.source)).toEqual([
    "spoolio",
    "spoolkeep",
  ]);

  const conflict = await run(
    "--spoolkeep",
    path.join(directory, "keep.json"),
    "--summary",
    "--output-dir",
    path.join(directory, "out"),
  );
  expect(conflict.code).not.toBe(0);
  expect(conflict.stderr).toContain("--summary only reports what is loaded");
});

test("load failures say what to do: missing files, and files given to the wrong flag", async () => {
  await writeFile(
    path.join(directory, "keep.json"),
    JSON.stringify([{ id: "k1", brand: "Creality", family: "PLA", newQuantity: 1 }]),
  );
  const run = async (...args: string[]) => {
    const child = spawnIsolated([runtime, cli, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    return { stderr, code };
  };
  const wrongFlag = await run(
    "--spoolio",
    path.join(directory, "keep.json"),
    "--spoolman",
    path.join(directory, "spoolman-spools.json"),
  );
  expect(wrongFlag.code).not.toBe(0);
  expect(wrongFlag.stderr).toContain("looks like a SpoolKeep export; try --spoolkeep instead");

  const missing = await run(
    "--spoolio",
    path.join(directory, "nope.json"),
    "--spoolman",
    path.join(directory, "spoolman-spools.json"),
  );
  expect(missing.code).not.toBe(0);
  expect(missing.stderr).toContain("file not found. Check the path");

  const typo = await run("--spolman", "a.json", "--spoolio", "b.json");
  expect(typo.stderr).toContain("Unknown option: --spolman. Did you mean --spoolman?");
});

test("--config supplies defaults that the command line can override", async () => {
  await writeFile(
    path.join(directory, "keep.json"),
    JSON.stringify([{ id: "k1", brand: "Creality", family: "PLA", newQuantity: 1 }]),
  );
  await mkdir(path.join(directory, "conf"));
  await writeFile(
    path.join(directory, "conf", "spoolsync.json"),
    JSON.stringify({ spoolkeep: "../keep.json", summary: true }),
  );
  const run = async (...args: string[]) => {
    const child = spawnIsolated([runtime, cli, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  };
  const fromConfig = await run("--config", path.join(directory, "conf", "spoolsync.json"));
  expect(fromConfig).toMatchObject({ code: 0, stderr: "" });
  expect(fromConfig.stdout).toContain("spoolkeep: 1 spool");

  const secret = path.join(directory, "conf", "secret.json");
  await writeFile(secret, JSON.stringify({ "spoolman-token": "abc" }));
  const refused = await run("--config", secret);
  expect(refused.code).not.toBe(0);
  expect(refused.stderr).toContain("looks like a secret");
});

test("--completion prints a script for each supported shell and rejects others", async () => {
  const run = async (...args: string[]) => {
    const child = spawnIsolated([runtime, cli, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  };
  for (const shell of ["bash", "zsh", "fish"]) {
    const result = await run("--completion", shell);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("spoolsync");
    expect(result.stdout).toContain("export-csv");
  }
  const unknown = await run("--completion", "powershell");
  expect(unknown.code).not.toBe(0);
  expect(unknown.stderr).toContain('Unknown shell "powershell"');
});

test("--watch re-runs when an input file is saved and stops cleanly on SIGINT", async () => {
  const keep = path.join(directory, "keep.json");
  await writeFile(keep, JSON.stringify([{ id: "k1", brand: "A", family: "PLA", newQuantity: 1 }]));
  const child = spawnIsolated([runtime, cli, "--spoolkeep", keep, "--summary", "--watch"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  let stdout = "";
  let stderr = "";
  const pump = async (stream: ReadableStream<Uint8Array>, append: (text: string) => void) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) append(decoder.decode(chunk, { stream: true }));
  };
  void pump(child.stdout, (text) => (stdout += text));
  void pump(child.stderr, (text) => (stderr += text));
  const until = async (condition: () => boolean, what: string) => {
    const deadline = Date.now() + 15_000;
    while (!condition()) {
      if (Date.now() > deadline)
        throw new Error(`Timed out waiting for ${what}.\n${stdout}\n${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  try {
    await until(() => stderr.includes("Watching 1 file"), "the first run");
    expect(stdout).toContain("spoolkeep: 1 spool");

    // Save by replacing the file, as many editors do.
    const replacement = path.join(directory, "keep.json.tmp");
    await writeFile(
      replacement,
      JSON.stringify([
        { id: "k1", brand: "A", family: "PLA", newQuantity: 1 },
        { id: "k2", brand: "B", family: "PETG", newQuantity: 2 },
      ]),
    );
    await rename(replacement, keep);
    await until(() => stdout.includes("spoolkeep: 3 spools"), "the second run");
    expect(stderr).toContain("keep.json changed; running again");

    // A broken save is reported and watching continues.
    await writeFile(keep, "{not json");
    await until(() => stderr.includes("spoolsync: Could not load spoolkeep"), "the error report");
    await writeFile(
      keep,
      JSON.stringify([{ id: "k9", brand: "Z", family: "PLA", newQuantity: 1 }]),
    );
    await until(
      () => stdout.includes("spoolkeep: 1 spool") && stdout.match(/^spoolkeep: /gm)!.length > 2,
      "recovery",
    );
  } finally {
    stopWatching(child);
  }
  expect(await child.exited).toBe(0);
});

test("--watch --quiet stays silent when a save does not change the result", async () => {
  const keep = path.join(directory, "keep.json");
  const spools = [{ id: "k1", brand: "A", family: "PLA", newQuantity: 1 }];
  await writeFile(keep, JSON.stringify(spools));
  const child = spawnIsolated(
    [runtime, cli, "--spoolkeep", keep, "--summary", "--watch", "--quiet"],
    {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  let stdout = "";
  let stderr = "";
  const pump = async (stream: ReadableStream<Uint8Array>, append: (text: string) => void) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) append(decoder.decode(chunk, { stream: true }));
  };
  void pump(child.stdout, (text) => (stdout += text));
  void pump(child.stderr, (text) => (stderr += text));
  const until = async (condition: () => boolean, what: string) => {
    const deadline = Date.now() + 15_000;
    while (!condition()) {
      if (Date.now() > deadline)
        throw new Error(`Timed out waiting for ${what}.\n${stdout}\n${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  try {
    await until(() => stdout.includes("spoolkeep: 1 spool"), "the first run");
    // Same content, rewritten: the run happens but prints nothing.
    await writeFile(keep, JSON.stringify(spools, null, 2));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(stdout.split("spoolkeep:").length).toBe(2);
    expect(stderr).not.toContain("changed; running again");
    // A real change is printed.
    await writeFile(keep, JSON.stringify([...spools, { id: "k2", brand: "B", family: "PETG" }]));
    await until(() => stdout.includes("spoolkeep: 2 spools"), "the changed result");
    expect(stderr).toContain("keep.json changed; running again");
  } finally {
    stopWatching(child);
  }
  expect(await child.exited).toBe(0);
});

test("--summary flags spools that are running low", async () => {
  await writeFile(
    path.join(directory, "low.json"),
    JSON.stringify({
      version: 1,
      filaments: [
        { id: "a", type: "PLA", brand: "A", weightTotal: 1000, weightRemaining: 150 },
        { id: "b", type: "PLA", brand: "A", weightTotal: 1000, weightRemaining: 900 },
        { id: "c", type: "PETG", brand: "B", weightTotal: 1000, weightRemaining: 100 },
      ],
    }),
  );
  const child = spawnIsolated(
    [runtime, cli, "--spoolio", path.join(directory, "low.json"), "--summary"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  expect(code).toBe(0);
  expect(stdout).toContain(
    "spoolio: 3 spools, 2 brands, 2 materials, 1,150 g remaining; 2 running low",
  );
});

test("--reorder prints a shopping list of spools that are running low", async () => {
  await writeFile(
    path.join(directory, "low.json"),
    JSON.stringify({
      version: 1,
      filaments: [
        {
          id: "a",
          type: "PLA",
          brand: "Prusa",
          colorName: "Blue",
          weightTotal: 1000,
          weightRemaining: 150,
        },
        {
          id: "b",
          type: "PLA",
          brand: "Prusa",
          colorName: "Red",
          weightTotal: 1000,
          weightRemaining: 900,
        },
        {
          id: "c",
          type: "PETG",
          brand: "Polymaker",
          colorName: "Teal",
          weightTotal: 1000,
          weightRemaining: 40,
        },
      ],
    }),
  );
  const run = async (...args: string[]) => {
    const child = spawnIsolated([runtime, cli, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  };
  const text = await run("--spoolio", path.join(directory, "low.json"), "--reorder");
  expect(text.code).toBe(0);
  expect(text.stdout.trim().split("\n")).toEqual([
    "Running low (2):",
    "- Polymaker PETG Teal: 40 g left (4%)",
    "- Prusa PLA Blue: 150 g left (15%)",
  ]);

  const json = await run("--spoolio", path.join(directory, "low.json"), "--reorder", "--json");
  const report = JSON.parse(json.stdout);
  expect(report.reorder.map((item: { name: string }) => item.name)).toEqual(["Teal", "Blue"]);

  const conflict = await run(
    "--spoolio",
    path.join(directory, "low.json"),
    "--reorder",
    "--output-dir",
    path.join(directory, "out"),
  );
  expect(conflict.code).not.toBe(0);
  expect(conflict.stderr).toContain("--reorder only reports what is loaded");
});

test("--low-threshold changes what --summary and --reorder call low", async () => {
  await writeFile(
    path.join(directory, "thr.json"),
    JSON.stringify({
      version: 1,
      filaments: [
        {
          id: "a",
          type: "PLA",
          brand: "A",
          colorName: "Quarter",
          weightTotal: 1000,
          weightRemaining: 250,
        },
        {
          id: "b",
          type: "PLA",
          brand: "A",
          colorName: "Tenth",
          weightTotal: 1000,
          weightRemaining: 100,
        },
      ],
    }),
  );
  const run = async (...args: string[]) => {
    const child = spawnIsolated([runtime, cli, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  };
  const file = path.join(directory, "thr.json");
  expect((await run("--spoolio", file, "--summary")).stdout).toContain("1 running low");
  expect((await run("--spoolio", file, "--summary", "--low-threshold", "30")).stdout).toContain(
    "2 running low",
  );
  expect((await run("--spoolio", file, "--summary", "--low-threshold", "5")).stdout).not.toContain(
    "running low",
  );
  const reorder = await run("--spoolio", file, "--reorder", "--low-threshold", "30");
  expect(reorder.stdout).toContain("Running low (2):");
  const bad = await run("--spoolio", file, "--summary", "--low-threshold", "150");
  expect(bad.code).not.toBe(0);
  expect(bad.stderr).toContain("whole number of percent from 1 to 90");
});

test("saved settings are remembered between runs and can be overridden, ignored, and cleared", async () => {
  const settingsDir = path.join(directory, ".settings");
  const keep = path.join(directory, "keep.json");
  await writeFile(keep, JSON.stringify([{ id: "k1", brand: "A", family: "PLA", newQuantity: 1 }]));
  const run = async (...args: string[]) => {
    const child = spawnIsolated([runtime, cli, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: directory,
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  };

  const where = await run("--config-path");
  expect(where.stdout.trim()).toBe(path.join(settingsDir, "config.json"));

  // Nothing saved yet: a bare run needs inventories.
  expect((await run("--summary")).code).not.toBe(0);

  const saved = await run("--spoolkeep", "keep.json", "--low-threshold", "30", "--save-config");
  expect(saved).toMatchObject({ code: 0, stderr: "" });
  expect(saved.stdout).toContain("Saved 2 settings to");
  const file = JSON.parse(await readFile(path.join(settingsDir, "config.json"), "utf8"));
  expect(file).toEqual({ spoolkeep: keep, "low-threshold": 30 });

  // A bare run now uses the saved inventory and threshold, and says so on stderr only.
  const remembered = await run("--summary");
  expect(remembered.code).toBe(0);
  expect(remembered.stdout).toContain("spoolkeep: 1 spool");
  expect(remembered.stderr).toContain("Using the inventories saved in");

  // --show-config says which layer supplies what.
  const shown = await run("--show-config", "--summary");
  expect(shown.code).toBe(0);
  expect(shown.stdout).toContain(`Settings file: ${path.join(settingsDir, "config.json")}`);
  expect(shown.stdout).toContain(`settings file:\n  --spoolkeep=${keep}\n  --low-threshold=30`);
  expect(shown.stdout).toContain("command line:\n  --summary");
  const overridden = await run("--show-config", "--low-threshold", "10", "--summary");
  expect(overridden.stdout).not.toContain("--low-threshold=30");
  expect(overridden.stdout).toContain("command line:\n  --low-threshold 10 --summary");
  expect((await run("--show-config", "--no-user-config")).stdout).toContain(
    "ignored by --no-user-config",
  );

  // Naming an inventory means the saved set is left out.
  const other = await run("--spoolio", "spoolio.json", "--summary");
  expect(other.stdout).toContain("spoolio: 0 spools");
  expect(other.stdout).not.toContain("spoolkeep");

  const ignored = await run("--no-user-config", "--summary");
  expect(ignored.code).not.toBe(0);

  const cleared = await run("--clear-config");
  expect(cleared.stdout).toContain("Removed");
  expect((await run("--clear-config")).stdout).toContain("No saved settings");
  expect((await run("--summary")).code).not.toBe(0);

  const nothing = await run("--save-config");
  expect(nothing.code).not.toBe(0);
  expect(nothing.stderr).toContain("nothing to save");
  const combined = await run("--spoolkeep", "keep.json", "--save-config", "--apply");
  expect(combined.code).not.toBe(0);
});

test("settings can be exported to a file, imported back, and shared with the browser's format", async () => {
  const run = async (...args: string[]) => {
    const child = spawnIsolated([runtime, cli, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: directory,
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  };
  const settingsFile = path.join(directory, ".settings", "config.json");
  // Defaults can be saved without any inventory at all.
  const saved = await run("--output-dir", "out", "--low-threshold", "30", "--save-config");
  expect(saved).toMatchObject({ code: 0, stderr: "" });

  const exported = await run("--export-settings", "mine.json");
  expect(exported).toMatchObject({ code: 0, stderr: "" });
  const document = JSON.parse(await readFile(path.join(directory, "mine.json"), "utf8"));
  expect(document.entries).toEqual({ "spoolsync:low-stock-percent": "30" });
  expect(document.cli["low-threshold"]).toBe(30);

  // Importing replaces what is saved, from the CLI's own export.
  await run("--clear-config");
  const imported = await run("--import-settings", "mine.json");
  expect(imported.code).toBe(0);
  expect(JSON.parse(await readFile(settingsFile, "utf8"))).toEqual(document.cli);

  // A file exported by the browser supplies the shared setting, and the rest is reported.
  await writeFile(
    path.join(directory, "web.json"),
    JSON.stringify({
      format: "spoolsync-settings",
      version: 1,
      entries: { "spoolsync:low-stock-percent": "15", "spoolsync:prefs": '{"lowOnly":true}' },
    }),
  );
  const fromWeb = await run("--import-settings", "web.json");
  expect(fromWeb.code).toBe(0);
  expect(fromWeb.stderr).toContain("Skipped 1 settings the CLI does not use: spoolsync:prefs");
  expect(JSON.parse(await readFile(settingsFile, "utf8"))).toEqual({ "low-threshold": 15 });

  // Bad files and bad flags are refused without touching what is saved.
  await writeFile(
    path.join(directory, "bad.json"),
    '{"format":"spoolsync-settings","version":1,"cli":{"spoolman-token":"x"}}',
  );
  const bad = await run("--import-settings", "bad.json");
  expect(bad.code).not.toBe(0);
  expect(bad.stderr).toContain("looks like a secret");
  expect(JSON.parse(await readFile(settingsFile, "utf8"))).toEqual({ "low-threshold": 15 });
  expect((await run("--import-settings")).stderr).toContain("requires a file name");
  expect((await run("--export-settings", "a.json", "--import-settings", "b.json")).code).not.toBe(
    0,
  );
});

for (const failRefresh of [true, false]) {
  test(`JSON preserves remote writes when ${failRefresh ? "refresh" : "file commit"} fails`, async () => {
    const output = path.join(directory, "updated");
    const fake = createFakeSpoolman();
    let wrote = false;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (wrote && request.method === "GET" && url.pathname === "/api/v1/spool") {
          if (failRefresh) return new Response("refresh unavailable", { status: 503 });
          await rm(path.join(output, "spoolio.json"));
          await mkdir(path.join(output, "spoolio.json"));
        }
        const body = request.method === "GET" ? undefined : await request.text();
        const response = await fake.fetchImpl(request.url, {
          method: request.method,
          ...(body ? { body } : {}),
        });
        if (request.method === "POST" && url.pathname === "/api/v1/spool") wrote = true;
        return response;
      },
    });
    try {
      await mkdir(output);
      await writeFile(path.join(output, "spoolio.json"), "previous export");
      await writeFile(
        path.join(directory, "spoolio.json"),
        JSON.stringify({
          version: 1,
          filaments: [
            { id: "donor", brand: "Example", type: "PLA", colorName: "Blue", weightTotal: 1000 },
          ],
        }),
      );
      const child = spawnIsolated(
        [
          runtime,
          cli,
          "--spoolman-url",
          server.url.toString(),
          "--spoolio",
          path.join(directory, "spoolio.json"),
          "--create-in",
          "spoolman",
          "--apply",
          "--output-dir",
          output,
          "--json",
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code).toBe(1);
      expect(stderr).toBe("");
      const result = JSON.parse(stdout);
      expect(result.error.message).toContain(
        failRefresh ? "inventory refresh failed" : "Could not finish writing exports",
      );
      expect(result.applied).toHaveLength(1);
      expect(result.applied[0].ok).toBe(true);
      expect(fake.spools.size).toBe(1);
      expect(result.written).toEqual([]);
      if (failRefresh)
        expect(await readFile(path.join(output, "spoolio.json"), "utf8")).toBe("previous export");
      expect((await readdir(output)).some((name) => name.startsWith(".spoolsync-"))).toBe(false);
      expect(
        fake.requests.filter((request) => request.method === "POST" && request.path === "/spool"),
      ).toHaveLength(1);
    } finally {
      await server.stop(true);
    }
  });
}

test("version works without inputs and matches the package metadata", () => {
  for (const flag of ["--version", "-V"]) {
    const result = Bun.spawnSync([runtime, cli, flag]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe(version);
  }
  const json = Bun.spawnSync([runtime, cli, "--version", "--json"]);
  expect(json.exitCode).toBe(0);
  expect(JSON.parse(json.stdout.toString())).toEqual({ version });
});

test("version rejects accidentally combined workflow arguments", () => {
  const result = Bun.spawnSync([runtime, cli, "--version", "--apply", "--json"]);
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stdout.toString()).error.message).toContain(
    "cannot be combined with --apply",
  );
});

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "spoolsync-cli-"));
  // Spawned CLIs inherit this, so no test can read or write a real person's settings file.
  process.env["SPOOLSYNC_CONFIG_DIR"] = path.join(directory, ".settings");
  await writeFile(path.join(directory, "spoolman-spools.json"), "[]");
  await writeFile(path.join(directory, "spoolio.json"), '{"version":1,"filaments":[]}');
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function run(...args: string[]) {
  const child = spawnIsolated(
    [
      runtime,
      cli,
      "--spoolman",
      path.join(directory, "spoolman-spools.json"),
      "--spoolio",
      path.join(directory, "spoolio.json"),
      ...args,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

test("JSON dry runs leave inputs unchanged", async () => {
  const result = await run("--json");
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ groups: 0, written: [], exportWarnings: [] });
  expect(result.stderr).toBe("");
  expect(await readFile(path.join(directory, "spoolman-spools.json"), "utf8")).toBe("[]");
});

test("creates a new inventory from an empty target and exports it", async () => {
  await writeFile(
    path.join(directory, "spoolio.json"),
    JSON.stringify({
      version: 1,
      filaments: [
        { id: "donor", brand: "Example", type: "PLA", colorName: "Blue", weightTotal: 1000 },
      ],
    }),
  );
  const output = path.join(directory, "new-inventory");
  const result = await run(
    "--empty",
    "filameter",
    "--create-in",
    "filameter",
    "--output-dir",
    output,
    "--json",
  );
  expect(result.code).toBe(0);
  const summary = JSON.parse(result.stdout);
  expect(summary.changes.filameter.creates).toBe(1);
  expect(summary.written).toContain(path.join(output, "filameter.json"));
  expect(summary.exportWarnings).toContainEqual({
    source: "filameter",
    message:
      "CSV: CSV contains filament fields only. Use JSON to preserve backup metadata and document IDs.",
  });
  const backup = JSON.parse(await readFile(path.join(output, "filameter.json"), "utf8"));
  expect(backup.regular).toHaveLength(1);
});

test("output cannot overwrite an input inventory", async () => {
  const result = await run("--output-dir", directory);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("would overwrite an input inventory");
  expect(await readFile(path.join(directory, "spoolman-spools.json"), "utf8")).toBe("[]");
});

test("unknown match records fail before exporting", async () => {
  const result = await run("--confirm", "spoolman:missing,spoolio:missing");
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("unknown record: spoolio:missing");
});

test("native IDs containing group separators remain distinct when creating targets", async () => {
  await writeFile(
    path.join(directory, "spoolman-spools.json"),
    JSON.stringify([{ id: 1, filament: { id: 1, material: "PLA" } }]),
  );
  await writeFile(
    path.join(directory, "spoolio.json"),
    JSON.stringify({
      version: 1,
      filaments: [
        { id: "a", spoolmanId: 1, type: "PLA" },
        { id: "a+spoolman:1", type: "PETG" },
      ],
    }),
  );
  const result = await run("--empty", "filameter", "--create-in", "filameter", "--json");
  expect(result.code).toBe(0);
  const creates = JSON.parse(result.stdout).plannedChanges.filameter;
  expect(creates).toHaveLength(2);
  expect(new Set(creates.map((change: { groupId: string }) => change.groupId)).size).toBe(2);
  expect(
    creates.map((change: { values: { material: string } }) => change.values.material).sort(),
  ).toEqual(["PETG", "PLA"]);
});

for (const rejected of [false, true]) {
  test(`${rejected ? "cross-ID rejection" : "incompatible confirmations"} fails before writing exports`, async () => {
    await writeFile(
      path.join(directory, "spoolman-spools.json"),
      JSON.stringify([{ id: 1, filament: { id: 1, material: "PLA" } }]),
    );
    await writeFile(
      path.join(directory, "spoolio.json"),
      JSON.stringify({
        version: 1,
        filaments: [{ id: "a", ...(rejected ? { spoolmanId: 1 } : {}) }, { id: "b" }],
      }),
    );
    const output = path.join(directory, "updated");
    const decision = rejected
      ? ["--reject", "spoolman:1,spoolio:a"]
      : ["--confirm", "spoolman:1,spoolio:a", "--confirm", "spoolman:1,spoolio:b"];
    const result = await run("--json", "--output-dir", output, ...decision);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).error.message).toContain(
      rejected ? "Could not reject" : "Could not confirm",
    );
    expect(await Bun.file(path.join(output, "spoolio.json")).exists()).toBe(false);
  });
}

test("terminal match suggestions include pairs that can be confirmed", async () => {
  await writeFile(
    path.join(directory, "spoolman-spools.json"),
    JSON.stringify([
      {
        id: 1,
        filament: {
          id: 1,
          material: "PLA",
          name: "Blue",
          color_hex: "0000FF",
          vendor: { id: 1, name: "Example" },
        },
      },
    ]),
  );
  await writeFile(
    path.join(directory, "spoolio.json"),
    JSON.stringify({
      version: 1,
      filaments: [
        { id: "donor", brand: "Example", type: "PLA", colorName: "Blue", colorHex: "0000FF" },
      ],
    }),
  );
  const result = await run();
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Match suggestion:");
  expect(result.stdout).toContain("--confirm <pair>");
  const plan = await run("--json");
  const pair = JSON.parse(plan.stdout).suggestions[0].pair.join(",");
  expect(result.stdout).toContain(pair);
  const confirmed = await run("--json", "--confirm", pair);
  expect(confirmed.code).toBe(0);
  expect(JSON.parse(confirmed.stdout).groups).toBe(1);
  expect(JSON.parse(confirmed.stdout).suggestions).toEqual([]);
});

test("load failures identify the source and filename", async () => {
  await writeFile(path.join(directory, "spoolio.json"), "invalid json");
  const result = await run();
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("Could not load spoolio inventory");
  expect(result.stderr).toContain(path.join(directory, "spoolio.json"));
});

test("JSON load failures return a structured error and nonzero exit code", async () => {
  await writeFile(path.join(directory, "spoolio.json"), "invalid json");
  const result = await run("--json");
  expect(result.code).toBe(1);
  expect(JSON.parse(result.stdout).error.message).toContain("Could not load spoolio inventory");
  expect(result.stderr).toBe("");
});

test("JSON argument failures also return structured errors", async () => {
  const result = await run("--json", "--unknown-option");
  expect(result.code).toBe(1);
  expect(JSON.parse(result.stdout)).toEqual({
    error: { message: "Unknown option: --unknown-option" },
  });
});

for (const [source, text] of [
  ["spoolman", "id,filament.id,filament.id\n1,2,3"],
  ["spoolstock", "short_id,short_id\na,b"],
  ["bambuddy", "material,material\nPLA,PETG"],
] as const) {
  test(`JSON ${source} duplicate-header errors do not leak parser warnings`, async () => {
    const filename = path.join(
      directory,
      source === "spoolman" ? "spoolman-spools.json" : "duplicate.csv",
    );
    await writeFile(filename, text);
    const result = await run("--json", ...(source === "spoolman" ? [] : [`--${source}`, filename]));
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).error.message).toContain("duplicate column names");
  });
}

test("exports file inventories to a separate directory", async () => {
  const output = path.join(directory, "updated");
  const result = await run("--json", "--output-dir", output);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout).written).toHaveLength(2);
  expect(JSON.parse(await readFile(path.join(output, "spoolio.json"), "utf8")).filaments).toEqual(
    [],
  );
  expect((await readdir(output)).some((name) => name.startsWith(".spoolsync-"))).toBe(false);
});

test("invalid output destinations preserve all previous exports", async () => {
  const output = path.join(directory, "updated");
  await mkdir(path.join(output, "spoolio.json"), { recursive: true });
  const previous = path.join(output, "spoolman-spools.json");
  await writeFile(previous, "previous export");
  const result = await run("--json", "--output-dir", output);
  expect(result.code).toBe(1);
  expect(JSON.parse(result.stdout).error.message).toContain("not a regular file");
  expect(await readFile(previous, "utf8")).toBe("previous export");
});

const similarPair = async () => {
  await writeFile(
    path.join(directory, "spoolman-spools.json"),
    JSON.stringify([
      {
        id: 1,
        filament: {
          id: 1,
          material: "PLA",
          name: "Blue",
          color_hex: "0000FF",
          vendor: { id: 1, name: "Example" },
        },
      },
    ]),
  );
  await writeFile(
    path.join(directory, "spoolio.json"),
    JSON.stringify({
      version: 1,
      filaments: [
        {
          id: "donor",
          brand: "Example",
          type: "PLA",
          colorName: "Blue",
          colorHex: "0000FF",
          weightTotal: 1000,
          weightRemaining: 150,
        },
      ],
    }),
  );
};

test("--format json prints the versioned compare report with pending matches on stdout only", async () => {
  await similarPair();
  const formatted = await run("--format", "json");
  expect(formatted.code).toBe(0);
  expect(formatted.stderr).toBe("");
  const report = JSON.parse(formatted.stdout);
  const schema = JSON.parse(
    await readFile(path.join(import.meta.dir, "..", "schema", "report.schema.json"), "utf8"),
  );
  expect(report.schemaVersion).toBe(1);
  expect(report.report).toBe("compare");
  for (const key of schema.$defs.compareReport.required) expect(report).toHaveProperty(key);
  expect(Object.keys(report.inventories)).toEqual(["spoolman", "spoolio"]);
  expect(report.pendingMatches).toHaveLength(1);
  expect(report.pendingMatches[0].answerWith).toBe(report.suggestions[0].pair.join(","));
  expect(report.pendingMatches[0].pair).toEqual(report.suggestions[0].pair);
  expect(formatted.stdout).not.toMatch(/token|password/i);
  // Same output as the --json alias and as --format=json, byte for byte.
  expect((await run("--json")).stdout).toBe(formatted.stdout);
  expect((await run("--format=json")).stdout).toBe(formatted.stdout);
  // Text stays the default and --format text is explicit.
  const text = await run("--format", "text");
  expect(text.stdout).toContain("Match suggestion:");
  expect(text.stdout).toBe((await run()).stdout);
});

test("--format json applies to --summary and --reorder reports", async () => {
  await similarPair();
  const summary = JSON.parse((await run("--summary", "--format", "json")).stdout);
  expect(summary).toMatchObject({ schemaVersion: 1, report: "inventory", written: [] });
  expect(summary.inventories.map((item: { source: string }) => item.source)).toEqual([
    "spoolman",
    "spoolio",
  ]);
  const reorder = JSON.parse((await run("--reorder", "--format", "json")).stdout);
  expect(reorder).toMatchObject({ schemaVersion: 1, report: "inventory" });
  expect(reorder.reorder).toEqual([
    expect.objectContaining({ service: "spoolio", remainingGrams: 150, fraction: 0.15 }),
  ]);
  expect(reorder).not.toHaveProperty("inventories");
});

test("--format validates its value and combinations, and failures stay in the chosen format", async () => {
  const unknown = await run("--format", "xml");
  expect(unknown.code).toBe(1);
  expect(unknown.stderr).toContain('Unknown format "xml". Choose one of: text, json.');
  const conflict = await run("--json", "--format", "text");
  expect(conflict.code).toBe(1);
  expect(JSON.parse(conflict.stdout).error.message).toContain(
    "cannot be combined with --format text",
  );
  expect((await run("--format", "text", "--json")).code).toBe(1);
  const missing = await run("--format");
  expect(missing.stderr).toContain("--format requires a value");
  const twice = await run("--format", "json", "--format", "text");
  expect(JSON.parse(twice.stdout).error.message).toContain("--format may only be provided once");
  expect((await run("--formt", "json")).stderr).toContain("Did you mean --format?");
});

test("the settings and --config files can choose the format", async () => {
  await similarPair();
  const config = path.join(directory, "format.json");
  await writeFile(config, JSON.stringify({ format: "json" }));
  expect(JSON.parse((await run("--config", config)).stdout).schemaVersion).toBe(1);
  expect((await run("--config", config, "--format", "text")).stdout).toContain("Match suggestion:");
  await writeFile(config, JSON.stringify({ json: true }));
  expect((await run("--config", config, "--format", "text")).stdout).toContain("Match suggestion:");
  await writeFile(config, JSON.stringify({ format: "yaml" }));
  expect((await run("--config", config)).stderr).toContain('Unknown format "yaml"');
});

test("completion scripts offer --format and list exactly the known options", async () => {
  const { KNOWN_OPTIONS } = await import("./parse-args");
  for (const shell of ["bash", "zsh", "fish"]) {
    const { stdout, code } = await run("--completion", shell);
    expect(code).toBe(0);
    expect(stdout).toContain("json");
    const names =
      shell === "fish"
        ? [...stdout.matchAll(/^complete -c spoolsync -l (\S+)/gm)].map((match) => `--${match[1]}`)
        : shell === "zsh"
          ? [...stdout.matchAll(/^ {4}'(--[\w-]+)\[/gm)].map((match) => match[1]!)
          : (/compgen -W "(--[^"]*)" -- "\$cur"\)\)\n {2}fi/.exec(stdout)?.[1] ?? "").split(" ");
    expect(new Set(names)).toEqual(new Set(KNOWN_OPTIONS));
  }
});

async function watchSession(args: string[]) {
  const child = spawnIsolated([runtime, cli, ...args, "--watch"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const state = { stdout: "", stderr: "" };
  const pump = async (stream: ReadableStream<Uint8Array>, append: (text: string) => void) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) append(decoder.decode(chunk, { stream: true }));
  };
  void pump(child.stdout, (text) => (state.stdout += text));
  void pump(child.stderr, (text) => (state.stderr += text));
  const until = async (condition: () => boolean, what: string) => {
    const deadline = Date.now() + 15_000;
    while (!condition()) {
      if (Date.now() > deadline)
        throw new Error(`Timed out waiting for ${what}.\n${state.stdout}\n${state.stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const stop = async () => {
    stopWatching(child);
    return child.exited;
  };
  return { state, until, stop };
}

const spoolioFile = (...filaments: Array<Record<string, unknown>>) =>
  JSON.stringify({ version: 1, filaments });

test("--watch prints what changed since the previous run in text", async () => {
  const io = path.join(directory, "spoolio.json");
  await writeFile(
    io,
    spoolioFile(
      { id: "a", brand: "A", type: "PLA", weightTotal: 1000, weightRemaining: 500 },
      { id: "b", brand: "B", type: "PETG", weightTotal: 1000, weightRemaining: 100 },
    ),
  );
  const watch = await watchSession(["--spoolio", io, "--summary"]);
  try {
    await watch.until(() => watch.state.stderr.includes("Watching 1 file"), "the first run");
    expect(watch.state.stdout).not.toContain("Changes since");
    await writeFile(
      io,
      spoolioFile(
        { id: "a", brand: "A", type: "PLA", weightTotal: 1000, weightRemaining: 450 },
        { id: "c", brand: "C", type: "ABS", weightTotal: 1000, weightRemaining: 900 },
      ),
    );
    await watch.until(() => watch.state.stdout.includes("Changes since the last run:"), "the diff");
    const { stdout } = watch.state;
    expect(stdout).toContain("  + added spoolio:c (C ABS)");
    expect(stdout).toContain("  - removed spoolio:b (B PETG)");
    expect(stdout).toContain("  ~ spoolio:a (A PLA): 500 g -> 450 g remaining");
  } finally {
    expect(await watch.stop()).toBe(0);
  }
});

test("--watch --format json adds changesSinceLastRun, and --quiet hides identical runs", async () => {
  await similarPair();
  const io = path.join(directory, "spoolio.json");
  const original = await readFile(io, "utf8");
  await writeFile(io, spoolioFile());
  const watch = await watchSession([
    "--spoolman",
    path.join(directory, "spoolman-spools.json"),
    "--spoolio",
    io,
    "--format",
    "json",
    "--quiet",
  ]);
  const documents = () =>
    watch.state.stdout
      .split(/\n(?=\{)/)
      .filter(Boolean)
      .map((text) => JSON.parse(text));
  try {
    await watch.until(() => documents().length === 1, "the first run");
    expect(documents()[0]).not.toHaveProperty("changesSinceLastRun");
    // Rewriting the same content prints nothing.
    await writeFile(io, spoolioFile(), "utf8");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(documents()).toHaveLength(1);
    // A matching spool appears: it is added and a new possible match is pending.
    await writeFile(io, original);
    await watch.until(() => documents().length === 2, "the second run");
    const changes = documents()[1].changesSinceLastRun;
    expect(changes.added.map((item: { key: string }) => item.key)).toEqual(["spoolio:donor"]);
    expect(changes.removed).toEqual([]);
    expect(changes.newPendingMatches).toEqual(
      documents()[1].pendingMatches.map((item: { answerWith: string }) => item.answerWith),
    );
    expect(changes.newPendingMatches).toHaveLength(1);
    // The remaining weight changes.
    await writeFile(io, original.replace('"weightRemaining":150', '"weightRemaining":120'));
    await watch.until(() => documents().length === 3, "the third run");
    expect(documents()[2].changesSinceLastRun.remainingWeight).toEqual([
      { key: "spoolio:donor", label: "Example PLA Blue", fromGrams: 150, toGrams: 120 },
    ]);
    expect(documents()[2].changesSinceLastRun.newPendingMatches).toEqual([]);
  } finally {
    expect(await watch.stop()).toBe(0);
  }
});

test("--fail-on-mismatch exits 1 only when the reference disagrees with a spool", async () => {
  const reference = path.join(directory, "reference.json");
  await writeFile(
    reference,
    JSON.stringify([
      {
        brand: "Prusament",
        material: "PLA",
        color_name: "Galaxy Black",
        hex: "#1A1A1A",
        diameter: 1.75,
      },
    ]),
  );
  const inventory = (diameter: number) =>
    JSON.stringify({
      version: 1,
      filaments: [
        {
          id: "a",
          brand: "Prusament",
          type: "PLA",
          colorName: "Galaxy Black",
          colorHex: "#1A1A1A",
          diameter,
          weightTotal: 1000,
          weightRemaining: 500,
        },
      ],
    });
  const spoolio = path.join(directory, "spoolio.json");
  const run = async () => {
    const child = spawnIsolated(
      [runtime, cli, "--spoolio", spoolio, "--reference-report", reference, "--fail-on-mismatch"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    return { stdout, code };
  };

  await writeFile(spoolio, inventory(1.75));
  const same = await run();
  expect(same.code).toBe(0);
  expect(same.stdout).toContain("Reference check passed");

  await writeFile(spoolio, inventory(2.85));
  const different = await run();
  expect(different.code).toBe(1);
  expect(different.stdout).toContain("Reference check failed");
});

test("--apply saves a rollback file first, and --restore-rollback puts the values back", async () => {
  const filament = { id: 10, material: "PLA", name: "Blue", density: 1.24, diameter: 1.75 };
  const fake = createFakeSpoolman({ filaments: [filament], spools: [{ id: 51, filament }] });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = request.method === "GET" ? undefined : await request.text();
      return fake.fetchImpl(request.url, { method: request.method, ...(body ? { body } : {}) });
    },
  });
  const run = async (...args: string[]) => {
    const child = spawnIsolated([runtime, cli, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  };
  try {
    await writeFile(
      path.join(directory, "spoolio.json"),
      JSON.stringify({
        version: 1,
        filaments: [{ id: "donor", spoolmanId: 51, type: "PETG", colorName: "Blue" }],
      }),
    );
    const address = server.url.toString();
    const rollbacks = path.join(directory, "rollbacks");
    const applied = await run(
      "--spoolman-url",
      address,
      "--spoolio",
      path.join(directory, "spoolio.json"),
      "--resolve",
      "material=spoolio",
      "--rollback-dir",
      rollbacks,
      "--apply",
      "--json",
    );
    expect({ code: applied.code, stderr: applied.stderr }).toEqual({ code: 0, stderr: "" });
    expect(fake.spools.get(51)!.filament.material).toBe("PETG");
    const report = JSON.parse(applied.stdout);
    expect(report.rollbackFiles).toHaveLength(1);
    const [file] = report.rollbackFiles as string[];
    expect(path.dirname(file!)).toBe(rollbacks);
    const saved = JSON.parse(await readFile(file!, "utf8"));
    expect(saved).toMatchObject({ format: "spoolsync-rollback", source: "spoolman" });
    expect(saved.updates[0].changes).toContainEqual(
      expect.objectContaining({ field: "material", before: "PLA", after: "PETG" }),
    );

    // Without --apply the restore is a dry run.
    const dry = await run("--restore-rollback", file!, "--spoolman-url", address);
    expect(dry.code).toBe(0);
    expect(dry.stdout).toContain("can be put back");
    expect(dry.stdout).toContain("Dry run only");
    expect(fake.spools.get(51)!.filament.material).toBe("PETG");

    const restored = await run(
      "--restore-rollback",
      file!,
      "--spoolman-url",
      address,
      "--rollback-dir",
      rollbacks,
      "--apply",
      "--json",
    );
    expect({ code: restored.code, stderr: restored.stderr }).toEqual({ code: 0, stderr: "" });
    expect(fake.spools.get(51)!.filament.material).toBe("PLA");
    const restoredReport = JSON.parse(restored.stdout);
    expect(restoredReport).toMatchObject({ report: "rollback", source: "spoolman", spools: 1 });
    expect(restoredReport.rollbackFile).toBeString();

    // A second restore finds nothing left to put back.
    const again = await run("--restore-rollback", file!, "--spoolman-url", address, "--json");
    expect(JSON.parse(again.stdout)).toMatchObject({ fields: 0, spools: 0 });

    // --no-rollback writes without a file.
    fake.spools.get(51)!.filament.material = "PLA";
    const before = (await readdir(rollbacks)).length;
    const bare = await run(
      "--spoolman-url",
      address,
      "--spoolio",
      path.join(directory, "spoolio.json"),
      "--resolve",
      "material=spoolio",
      "--rollback-dir",
      rollbacks,
      "--no-rollback",
      "--apply",
      "--json",
    );
    expect(bare.code).toBe(0);
    expect(JSON.parse(bare.stdout).rollbackFiles).toBeUndefined();
    expect((await readdir(rollbacks)).length).toBe(before);
  } finally {
    await server.stop(true);
  }
});

test("a rollback file that cannot be saved stops the write", async () => {
  const filament = { id: 10, material: "PLA", name: "Blue", density: 1.24, diameter: 1.75 };
  const fake = createFakeSpoolman({ filaments: [filament], spools: [{ id: 51, filament }] });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = request.method === "GET" ? undefined : await request.text();
      return fake.fetchImpl(request.url, { method: request.method, ...(body ? { body } : {}) });
    },
  });
  try {
    await writeFile(
      path.join(directory, "spoolio.json"),
      JSON.stringify({
        version: 1,
        filaments: [{ id: "donor", spoolmanId: 51, type: "PETG", colorName: "Blue" }],
      }),
    );
    // A file where the rollback folder should be makes saving impossible.
    const blocked = path.join(directory, "blocked");
    await writeFile(blocked, "not a folder");
    const child = spawnIsolated(
      [
        runtime,
        cli,
        "--spoolman-url",
        server.url.toString(),
        "--spoolio",
        path.join(directory, "spoolio.json"),
        "--resolve",
        "material=spoolio",
        "--rollback-dir",
        blocked,
        "--apply",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    expect(code).toBe(1);
    expect(stderr).toContain("nothing was written to Spoolman");
    expect(stderr).toContain("--no-rollback");
    expect(fake.spools.get(51)!.filament.material).toBe("PLA");
  } finally {
    await server.stop(true);
  }
});
