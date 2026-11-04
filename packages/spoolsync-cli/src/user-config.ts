import { rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { SourceId } from "@spoolsync/core/core/model";

import { ensureDirectory } from "./ensure-directory";
import type { Options } from "./options";

/** The config key for each source's file option (the long option name without dashes). */
const SOURCE_KEYS: Record<SourceId, string> = {
  spoolman: "spoolman",
  spoolstock: "spoolstock",
  spoolio: "spoolio",
  tigertag: "tigertag",
  threeDfp: "three-dfp",
  bambuddy: "bambuddy",
  filameter: "filameter",
  filadex: "filadex",
  filamentdb: "filamentdb",
  filamentDbApp: "filament-db",
  spoolmaster: "spoolmaster",
  spoolhoarder: "spoolhoarder",
  spoolapp: "spool",
  spoolkeep: "spoolkeep",
};

export interface UserConfigEnvironment {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  home: string;
}

export const defaultEnvironment = (): UserConfigEnvironment => ({
  env: process.env,
  platform: process.platform,
  home: os.homedir(),
});

/**
 * Where the per-user settings file lives: `$SPOOLSYNC_CONFIG_DIR` if set, else
 * `%APPDATA%\spoolsync` on Windows, else `$XDG_CONFIG_HOME/spoolsync` (when absolute) or
 * `~/.config/spoolsync`.
 */
export function userConfigPath(environment: UserConfigEnvironment = defaultEnvironment()): string {
  const { env, platform, home } = environment;
  const override = env["SPOOLSYNC_CONFIG_DIR"];
  if (override) return path.resolve(override, "config.json");
  if (platform === "win32")
    return path.win32.join(
      env["APPDATA"] || path.win32.join(home, "AppData", "Roaming"),
      "spoolsync",
      "config.json",
    );
  const xdg = env["XDG_CONFIG_HOME"];
  const base = xdg && path.posix.isAbsolute(xdg) ? xdg : path.posix.join(home, ".config");
  return path.posix.join(base, "spoolsync", "config.json");
}

/**
 * The options worth keeping as defaults, as config-file keys. Inventory files are saved as absolute
 * paths. Nothing that writes (`--apply`), is per-run (`--confirm`, `--watch`), or is secret
 * (tokens) is ever saved.
 */
export function savableSettings(options: Options): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  for (const [source, file] of options.inputs) settings[SOURCE_KEYS[source]] = path.resolve(file);
  if (options.empty.length) settings["empty"] = [...options.empty];
  if (options.createIn.length) settings["create-in"] = [...options.createIn];
  if (options.resolves.length)
    settings["resolve"] = options.resolves.map(([field, source]) => `${field}=${source}`);
  if (options.outputDir) settings["output-dir"] = path.resolve(options.outputDir);
  if (options.json) settings["format"] = "json";
  if (options.lowThreshold !== undefined) settings["low-threshold"] = options.lowThreshold;
  if (options.spoolmanUrl) settings["spoolman-url"] = options.spoolmanUrl;
  if (options.filamentdbUrl) settings["filamentdb-url"] = options.filamentdbUrl;
  if (options.filamentDbUrl) settings["filament-db-url"] = options.filamentDbUrl;
  if (options.bambuddyUrl) settings["bambuddy-url"] = options.bambuddyUrl;
  if (options.filadexUrl) settings["filadex-url"] = options.filadexUrl;
  if (options.filadexUser) settings["filadex-user"] = options.filadexUser;
  return settings;
}

/** Writes the settings atomically, creating the folder, readable only by the current user. */
export async function saveUserConfig(
  file: string,
  settings: Record<string, unknown>,
): Promise<void> {
  if (!Object.keys(settings).length)
    throw new Error(
      "There is nothing to save. Give the options you want as defaults, such as --output-dir ./updated or --spoolio spoolio.json, along with --save-config.",
    );
  await ensureDirectory(path.dirname(file), 0o700);
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** Deletes the settings file. Returns whether there was one. */
export async function clearUserConfig(file: string): Promise<boolean> {
  try {
    await rm(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Writes text to a file atomically (temporary file, then rename), readable only by the owner. */
export async function writeTextAtomic(file: string, text: string, mode = 0o600): Promise<void> {
  await ensureDirectory(path.dirname(file));
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, text, { mode, flag: "wx" });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
