import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseArgs } from "./args";
import {
  clearUserConfig,
  savableSettings,
  saveUserConfig,
  userConfigPath,
  type UserConfigEnvironment,
} from "./user-config";

const environment = (overrides: Partial<UserConfigEnvironment> = {}): UserConfigEnvironment => ({
  env: {},
  platform: "linux",
  home: "/home/ada",
  ...overrides,
});

test("the settings file lives in the usual per-user folder for each platform", () => {
  expect(userConfigPath(environment())).toBe("/home/ada/.config/spoolsync/config.json");
  expect(userConfigPath(environment({ platform: "darwin" }))).toBe(
    "/home/ada/.config/spoolsync/config.json",
  );
  expect(userConfigPath(environment({ env: { XDG_CONFIG_HOME: "/custom/xdg" } }))).toBe(
    "/custom/xdg/spoolsync/config.json",
  );
  // A relative XDG_CONFIG_HOME is invalid by the spec and ignored.
  expect(userConfigPath(environment({ env: { XDG_CONFIG_HOME: "relative" } }))).toBe(
    "/home/ada/.config/spoolsync/config.json",
  );
  expect(
    userConfigPath(
      environment({
        platform: "win32",
        home: "C:\\Users\\Ada",
        env: { APPDATA: "C:\\Users\\Ada\\AppData\\Roaming" },
      }),
    ),
  ).toBe("C:\\Users\\Ada\\AppData\\Roaming\\spoolsync\\config.json");
  expect(userConfigPath(environment({ platform: "win32", home: "C:\\Users\\Ada" }))).toBe(
    "C:\\Users\\Ada\\AppData\\Roaming\\spoolsync\\config.json",
  );
  expect(userConfigPath(environment({ env: { SPOOLSYNC_CONFIG_DIR: "/tmp/elsewhere" } }))).toBe(
    path.resolve("/tmp/elsewhere", "config.json"),
  );
});

test("only durable, non-secret options are saved, with absolute paths", () => {
  const options = parseArgs([
    "--spoolio",
    "data/spoolio.json",
    "--spoolkeep",
    "keep.json",
    "--create-in",
    "spoolio",
    "--resolve",
    "material=spoolio",
    "--output-dir",
    "out",
    "--cleanup=casing,whitespace",
    "--reference",
    "ref.json",
    "--fail-on-mismatch",
    "--rollback-dir",
    "rollbacks",
    "--no-rollback",
    "--confirm",
    "spoolio:a,spoolkeep:b",
    "--save-config",
    "--json",
  ]);
  const settings = savableSettings(options);
  expect(settings).toEqual({
    spoolio: path.resolve("data/spoolio.json"),
    spoolkeep: path.resolve("keep.json"),
    "create-in": ["spoolio"],
    resolve: ["material=spoolio"],
    "output-dir": path.resolve("out"),
    cleanup: "whitespace,casing",
    reference: path.resolve("ref.json"),
    "fail-on-mismatch": true,
    "rollback-dir": path.resolve("rollbacks"),
    "no-rollback": true,
    format: "json",
  });
  expect(JSON.stringify(settings)).not.toContain("token");
  const secrets = parseArgs([
    "--spoolman-url",
    "http://s",
    "--spoolman-token",
    "SECRET",
    "--spoolio",
    "a.json",
  ]);
  const saved = savableSettings(secrets);
  expect(JSON.stringify(saved)).not.toContain("SECRET");
  expect(saved["spoolman-url"]).toBe("http://s");
});

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "spoolsync-user-config-"));
});
afterEach(() => rm(directory, { recursive: true, force: true }));

test("saving creates the folder, writes atomically, and keeps the file private", async () => {
  const file = path.join(directory, "nested", "spoolsync", "config.json");
  await saveUserConfig(file, { "output-dir": "/out", "low-threshold": 30 });
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
    "output-dir": "/out",
    "low-threshold": 30,
  });
  expect(await readdir(path.dirname(file))).toEqual(["config.json"]);
  if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);

  // Saving again replaces the file whole.
  await saveUserConfig(file, { spoolio: "/a.json" });
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ spoolio: "/a.json" });

  expect(clearUserConfig(file)).resolves.toBe(true);
  expect(clearUserConfig(file)).resolves.toBe(false);
});

test("saving nothing is an error that says what to do", async () => {
  expect(saveUserConfig(path.join(directory, "c.json"), {})).rejects.toThrow("nothing to save");
  await writeFile(path.join(directory, "keep.txt"), "x");
  expect(await readdir(directory)).toEqual(["keep.txt"]);
});
