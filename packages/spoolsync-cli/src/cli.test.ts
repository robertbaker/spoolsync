import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createFakeSpoolman } from "../../spoolsync-core/src/adapters/spoolman/fake-server";
import { version } from "../package.json";

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
    const child = Bun.spawn(
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
      const child = Bun.spawn(
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
  await writeFile(path.join(directory, "spoolman-spools.json"), "[]");
  await writeFile(path.join(directory, "spoolio.json"), '{"version":1,"filaments":[]}');
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function run(...args: string[]) {
  const child = Bun.spawn(
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
