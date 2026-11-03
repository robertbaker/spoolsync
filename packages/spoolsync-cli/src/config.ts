import { readFileSync } from "node:fs";
import path from "node:path";

import { closestOption } from "./suggest";

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
  "spoolmaster",
  "spoolhoarder",
  "spool",
  "spoolkeep",
] as const;
const PATH_KEYS = new Set<string>([...SOURCE_KEYS, "output-dir", "export-csv"]);
const STRING_KEYS = new Set<string>([
  ...PATH_KEYS,
  "spoolman-url",
  "filamentdb-url",
  "filadex-url",
  "filadex-user",
]);
const LIST_KEYS = new Set(["resolve", "confirm", "reject", "create-in", "empty"]);
const BOOLEAN_KEYS = new Set(["apply", "json", "summary"]);
const ALLOWED_KEYS = [...STRING_KEYS, ...LIST_KEYS, ...BOOLEAN_KEYS];

/** Flags that name the same source, so a command-line flag replaces its config counterpart. */
const ALIASES: Record<string, string> = {
  "3dfp": "three-dfp",
  "spool-hoarder": "spoolhoarder",
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
 * Expands `--config <file>` into the options it describes. Options given on the command line
 * replace the same option from the file, so a config file holds defaults that a run can override.
 * Paths in the file are relative to the file. Secrets are refused: tokens and passwords belong in
 * environment variables, because config files tend to be committed and shared.
 */
export function expandConfig(
  args: string[],
  dependencies: ConfigDependencies = defaultDependencies,
): string[] {
  const rest: string[] = [];
  let configFile: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--config" || arg.startsWith("--config=")) {
      if (configFile !== undefined) throw new Error("--config may only be provided once");
      const inline = arg.startsWith("--config=") ? arg.slice("--config=".length) : undefined;
      const next = inline ?? args[index + 1];
      if (!next || (inline === undefined && next.startsWith("-")))
        throw new Error("--config requires a value");
      configFile = next;
      if (inline === undefined) index++;
    } else rest.push(arg);
  }
  if (configFile === undefined) return args;

  const config = readConfig(configFile, dependencies);
  const given = new Set(
    rest.filter((arg) => arg.startsWith("--")).map((arg) => canonical(arg.slice(2).split("=")[0]!)),
  );
  const base = path.dirname(path.resolve(configFile));
  const expanded: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (/token|password|secret|api-?key/i.test(key))
      fail(
        configFile,
        `"${key}" looks like a secret. Keep tokens and passwords out of config files; set SPOOLMAN_TOKEN, FILAMENTDB_TOKEN, or FILADEX_PASSWORD in the environment instead.`,
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
    const resolvePath = (text: string) => (path.isAbsolute(text) ? text : path.join(base, text));
    if (BOOLEAN_KEYS.has(key)) {
      if (typeof value !== "boolean") fail(configFile, `"${key}" must be true or false.`);
      if (value) expanded.push(`--${key}`);
    } else if (LIST_KEYS.has(key)) {
      const items = typeof value === "string" ? [value] : value;
      if (!Array.isArray(items) || items.some((item) => typeof item !== "string" || !item))
        fail(configFile, `"${key}" must be a text value or a list of text values.`);
      for (const item of items as string[]) expanded.push(`--${key}=${item}`);
    } else {
      if (typeof value !== "string" || !value) fail(configFile, `"${key}" must be a text value.`);
      expanded.push(`--${key}=${PATH_KEYS.has(key) ? resolvePath(value as string) : value}`);
    }
  }
  return [...expanded, ...rest];
}
