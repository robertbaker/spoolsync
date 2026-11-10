import { readFileSync } from "node:fs";
import path from "node:path";

import {
  isLowStockPercent,
  MAX_LOW_STOCK_PERCENT,
  MIN_LOW_STOCK_PERCENT,
} from "@spoolsync/core/core/stock";

import { closestOption } from "./suggest";
import { urlCredential } from "./url-credentials";

/** Environment variables that carry credentials; named in the messages that refuse them in files. */
export const CREDENTIAL_ENVIRONMENT_VARIABLES = [
  "SPOOLMAN_TOKEN",
  "FILAMENTDB_TOKEN",
  "FILAMENT_DB_API_KEY",
  "BAMBUDDY_API_KEY",
  "FILADEX_PASSWORD",
] as const;

const credentialVariableList = `${CREDENTIAL_ENVIRONMENT_VARIABLES.slice(0, -1).join(", ")}, or ${CREDENTIAL_ENVIRONMENT_VARIABLES.at(-1)}`;

/** Config keys are the long option names without dashes. Source keys hold file paths. */
const SOURCE_KEYS = [
  "spoolman",
  "spoolstock",
  "spoolio",
  "tigertag",
  "three-dfp",
  "bambuddy",
  "filameter",
  "filadex",
  "filamentdb",
  "filament-db",
  "spoolmaster",
  "spoolhoarder",
  "spool",
  "spoolkeep",
] as const;
const PATH_KEYS = new Set<string>([
  ...SOURCE_KEYS,
  "output-dir",
  "export-csv",
  "reference",
  "reference-report",
  "rollback-dir",
]);
const URL_KEYS = new Set([
  "spoolman-url",
  "filamentdb-url",
  "filament-db-url",
  "bambuddy-url",
  "filadex-url",
]);
const STRING_KEYS = new Set<string>([...PATH_KEYS, "format", ...URL_KEYS, "filadex-user"]);
const NUMBER_KEYS = new Set(["low-threshold"]);
const LIST_KEYS = new Set(["resolve", "confirm", "reject", "create-in", "empty"]);
const BOOLEAN_KEYS = new Set(["json", "summary", "reorder", "fail-on-mismatch", "no-rollback"]);
/** Boolean, or text naming the rules to run. */
const CLEANUP_KEYS = ["cleanup", "cleanup-report"];
const ALLOWED_KEYS = [
  ...STRING_KEYS,
  ...NUMBER_KEYS,
  ...LIST_KEYS,
  ...BOOLEAN_KEYS,
  ...CLEANUP_KEYS,
];

/** Flags that name the same source, so a command-line flag replaces its config counterpart. */
const ALIASES: Record<string, string> = {
  "3dfp": "three-dfp",
  "spool-hoarder": "spoolhoarder",
  // `--json` is `--format json`, so each replaces the other from a weaker layer.
  json: "format",
};
const canonical = (name: string) => ALIASES[name] ?? name;

export interface ConfigDependencies {
  readText(filename: string): string;
}

const defaultDependencies: ConfigDependencies = {
  readText: (filename) => readFileSync(filename, "utf8"),
};

function fail(file: string, message: string): never {
  throw new Error(`Config file "${file}": ${message}`);
}

function readConfig(file: string, dependencies: ConfigDependencies): Record<string, unknown> {
  let text: string;
  try {
    text = dependencies.readText(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(`Config file "${file}" was not found. Check the path passed to --config.`);
    throw new Error(
      `Could not read config file "${file}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    fail(file, `is not valid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    fail(file, 'must contain a JSON object, such as { "output-dir": "./updated" }.');
  return parsed as Record<string, unknown>;
}

/**
 * Options that choose which inventories to load. A saved set of these only applies when none are
 * given.
 */
const INPUT_KEYS = new Set<string>([
  ...SOURCE_KEYS,
  "empty",
  "spoolman-url",
  "filamentdb-url",
  "filament-db-url",
  "bambuddy-url",
  "filadex-url",
]);

export interface ConfigSettings {
  /** The per-user settings file, applied beneath `--config` and the command line. */
  userConfig?: { path: string };
  /** Told when saved settings change what a run does, so the person is not surprised. */
  onNote?: (message: string) => void;
  /** Reports each option a layer contributes, for `--show-config`. */
  trace?: (entry: { layer: ConfigLayer; option: string }) => void;
}

export type ConfigLayer = "command line" | "--config file" | "settings file";

/** Turns one config file into command-line options, skipping anything already given. */
function optionsFromFile(
  configFile: string,
  config: Record<string, unknown>,
  given: ReadonlySet<string>,
  skipInputs: boolean,
  /** A stronger layer already named cleanup rules, which win over rules named here. */
  strongerRules = false,
): string[] {
  const base = path.dirname(path.resolve(configFile));
  const expanded: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (/token|password|secret|api-?key/i.test(key))
      fail(
        configFile,
        `"${key}" looks like a secret. Keep tokens and passwords out of config files; set ${credentialVariableList} in the environment instead.`,
      );
    // A shared, imported or saved file must never switch writes on.
    if (key === "apply")
      fail(
        configFile,
        `"apply" cannot be saved as a default setting. Delete the "apply" key from ${configFile}; writing to a service is turned on only by passing --apply on the command line.`,
      );
    if (!ALLOWED_KEYS.includes(key)) {
      const suggestion = closestOption(
        `--${key}`,
        ALLOWED_KEYS.map((name) => `--${name}`),
      );
      fail(
        configFile,
        `unknown key "${key}"${suggestion ? `. Did you mean "${suggestion.slice(2)}"?` : "."}`,
      );
    }
    if (given.has(canonical(key))) continue;
    if (skipInputs && INPUT_KEYS.has(key)) continue;
    const resolvePath = (text: string) => (path.isAbsolute(text) ? text : path.join(base, text));
    if (key === "cleanup" || key === "cleanup-report") {
      // true turns it on with every rule; text names the rules, like `--cleanup=casing,whitespace`.
      // Rules from a stronger layer replace these (the option stays on), since both options share one set.
      if (typeof value === "string" && value)
        expanded.push(strongerRules ? `--${key}` : `--${key}=${value}`);
      else if (typeof value !== "boolean")
        fail(configFile, `"${key}" must be true, false, or a list of cleanup rules as text.`);
      else if (value) expanded.push(`--${key}`);
    } else if (BOOLEAN_KEYS.has(key)) {
      if (typeof value !== "boolean") fail(configFile, `"${key}" must be true or false.`);
      if (value) expanded.push(`--${key}`);
    } else if (NUMBER_KEYS.has(key)) {
      if (typeof value !== "number" || !Number.isFinite(value))
        fail(configFile, `"${key}" must be a number.`);
      if (key === "low-threshold" && !isLowStockPercent(value))
        fail(
          configFile,
          `"${key}" must be a whole number of percent from ${MIN_LOW_STOCK_PERCENT} to ${MAX_LOW_STOCK_PERCENT}, such as 20.`,
        );
      expanded.push(`--${key}=${value}`);
    } else if (LIST_KEYS.has(key)) {
      const items = typeof value === "string" ? [value] : value;
      if (!Array.isArray(items) || items.some((item) => typeof item !== "string" || !item))
        fail(configFile, `"${key}" must be a text value or a list of text values.`);
      for (const item of items as string[]) expanded.push(`--${key}=${item}`);
    } else {
      if (typeof value !== "string" || !value) fail(configFile, `"${key}" must be a text value.`);
      if (URL_KEYS.has(key)) {
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(value);
        } catch {
          fail(configFile, `"${key}" must be a valid http:// or https:// URL.`);
        }
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
          fail(configFile, `"${key}" must use http:// or https://.`);
        const credential = urlCredential(parsedUrl);
        if (credential)
          fail(
            configFile,
            `"${key}" contains credentials in the URL (${credential}). Keep tokens and passwords out of config files; set ${credentialVariableList} in the environment instead.`,
          );
      }
      expanded.push(`--${key}=${PATH_KEYS.has(key) ? resolvePath(value as string) : value}`);
    }
  }
  return expanded;
}

/** Validates a config object (unknown keys, secrets, wrong types) without using its options. */
export function checkConfig(file: string, config: Record<string, unknown>): void {
  optionsFromFile(file, config, new Set(), false);
}

const namesCleanupRules = (args: readonly string[]) =>
  args.some((arg) => /^--cleanup(?:-report)?=/.test(arg));

const givenFlags = (args: readonly string[]) =>
  new Set(
    args.filter((arg) => arg.startsWith("--")).map((arg) => canonical(arg.slice(2).split("=")[0]!)),
  );

/**
 * Expands `--config <file>` and the per-user settings file into the options they describe. The
 * layers, strongest first: the command line, `--config`, the user file. An option given by a
 * stronger layer replaces the same option from a weaker one. Saved inventories (from the user file)
 * apply only when the stronger layers name none, so a saved set never silently joins a comparison
 * you spelled out. Paths in a file are relative to that file. Secrets are refused: tokens and
 * passwords belong in environment variables, because config files tend to be shared.
 * `--no-user-config` skips the user file.
 */
export function expandConfig(
  args: string[],
  dependencies: ConfigDependencies = defaultDependencies,
  settings: ConfigSettings = {},
): string[] {
  const rest: string[] = [];
  let configFile: string | undefined;
  let useUserConfig = true;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--no-user-config") useUserConfig = false;
    else if (arg === "--config" || arg.startsWith("--config=")) {
      if (configFile !== undefined) throw new Error("--config may only be provided once");
      const inline = arg.startsWith("--config=") ? arg.slice("--config=".length) : undefined;
      const next = inline ?? args[index + 1];
      if (!next || (inline === undefined && next.startsWith("-")))
        throw new Error("--config requires a value");
      configFile = next;
      if (inline === undefined) index++;
    } else rest.push(arg);
  }

  let result = rest;
  const configKeys = new Set<string>();
  if (configFile !== undefined) {
    const config = readConfig(configFile, dependencies);
    for (const key of Object.keys(config)) configKeys.add(canonical(key));
    const fromConfig = optionsFromFile(
      configFile,
      config,
      givenFlags(rest),
      false,
      namesCleanupRules(rest),
    );
    for (const option of fromConfig) settings.trace?.({ layer: "--config file", option });
    result = [...fromConfig, ...rest];
  }

  if (rest.length) settings.trace?.({ layer: "command line", option: rest.join(" ") });

  const user = useUserConfig ? settings.userConfig : undefined;
  if (user) {
    const config = readUserConfig(user.path, dependencies);
    if (config) {
      const given = new Set([...givenFlags(result), ...configKeys]);
      const hasInputs = [...given].some((flag) => INPUT_KEYS.has(flag));
      const expanded = optionsFromFile(
        user.path,
        config,
        given,
        hasInputs,
        namesCleanupRules(result),
      );
      const savedInputs = expanded.some((option) =>
        INPUT_KEYS.has(canonical(option.slice(2).split("=")[0]!)),
      );
      if (savedInputs)
        settings.onNote?.(
          `Using the inventories saved in ${user.path} (--no-user-config ignores it).`,
        );
      for (const option of expanded) settings.trace?.({ layer: "settings file", option });
      result = [...expanded, ...result];
    }
  }
  // Nothing to expand: hand back the very same arguments.
  return result === rest && useUserConfig && args.length === rest.length ? args : result;
}

/** The per-user settings file, or `undefined` when it does not exist yet. */
function readUserConfig(
  file: string,
  dependencies: ConfigDependencies,
): Record<string, unknown> | undefined {
  try {
    return readConfig(file, dependencies);
  } catch (error) {
    // A missing file just means nothing was saved; any other problem is worth reporting.
    if (error instanceof Error && error.message.includes("was not found")) return undefined;
    throw error;
  }
}
