import path from "node:path";

import { isLowStockPercent } from "@spoolsync/core/core/stock";

import { checkConfig } from "./config";

/** The document the browser's "Export settings" writes, so the two can exchange what they share. */
const FORMAT = "spoolsync-settings";
const VERSION = 1;
const LOW_STOCK_KEY = "spoolsync:low-stock-percent";

const SAVABLE_PATH_KEYS = new Set([
  "spoolman",
  "spoolstock",
  "spoolio",
  "tigertag",
  "three-dfp",
  "bambuddy",
  "printstudio",
  "filameter",
  "filadex",
  "filamentdb",
  "filament-db",
  "spoolmaster",
  "spoolhoarder",
  "spool",
  "spoolkeep",
  "output-dir",
  "reference",
  "rollback-dir",
]);

const SAVABLE_KEYS = new Set([
  ...SAVABLE_PATH_KEYS,
  "empty",
  "create-in",
  "resolve",
  "format",
  "json",
  "low-threshold",
  "cleanup",
  "fail-on-mismatch",
  "no-rollback",
  "spoolman-url",
  "filamentdb-url",
  "filament-db-url",
  "bambuddy-url",
  "printstudio-url",
  "filadex-url",
  "filadex-user",
]);

/**
 * A settings export from the CLI. Its `entries` use the browser's keys for what both understand
 * (the low-stock threshold), and `cli` carries the CLI's own file, which a browser ignores.
 */
export function buildExportDocument(
  settings: Record<string, unknown> | null,
  now: Date = new Date(),
): string {
  const entries: Record<string, string> = {};
  const threshold = settings?.["low-threshold"];
  if (isLowStockPercent(threshold)) entries[LOW_STOCK_KEY] = String(threshold);
  return `${JSON.stringify(
    {
      format: FORMAT,
      version: VERSION,
      exportedAt: now.toISOString(),
      entries,
      ...(settings ? { cli: settings } : {}),
    },
    null,
    2,
  )}\n`;
}

export interface ImportedSettings {
  /** The settings to save as the CLI's settings file. */
  settings: Record<string, unknown>;
  /** Entries in the document that the CLI has no use for, such as a browser's panel layout. */
  skipped: string[];
}

/**
 * Reads a settings export from either the CLI or the browser. A `cli` section is used as is (after
 * the same checks a config file gets, so secrets and unknown keys are refused). Otherwise the
 * browser's low-stock threshold becomes `low-threshold`. Everything else is reported as skipped.
 */
export function parseImportDocument(text: string, source = "the settings file"): ImportedSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new Error(`${source} is not valid JSON. Choose a file exported from SpoolSync.`);
  }
  const document = parsed as {
    format?: unknown;
    version?: unknown;
    entries?: unknown;
    cli?: unknown;
  };
  if (!document || typeof document !== "object" || document.format !== FORMAT)
    throw new Error(`${source} is not a SpoolSync settings export.`);
  if (document.version !== VERSION)
    throw new Error(
      `${source} is export version ${String(document.version)}, which this CLI cannot read.`,
    );

  const entries =
    document.entries && typeof document.entries === "object" && !Array.isArray(document.entries)
      ? (document.entries as Record<string, unknown>)
      : {};
  let settings: Record<string, unknown> = {};
  if (document.cli !== undefined) {
    if (!document.cli || typeof document.cli !== "object" || Array.isArray(document.cli))
      throw new Error(`${source} has a "cli" section that is not an object.`);
    settings = { ...(document.cli as Record<string, unknown>) };
    checkConfig(source, settings);
    const base = path.dirname(path.resolve(source));
    for (const [key, value] of Object.entries(settings)) {
      if (!SAVABLE_KEYS.has(key))
        throw new Error(`Config file "${source}": "${key}" cannot be saved as a default setting.`);
      if (SAVABLE_PATH_KEYS.has(key) && typeof value === "string" && !path.isAbsolute(value))
        settings[key] = path.join(base, value);
    }
  }
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(entries)) {
    if (key === LOW_STOCK_KEY) {
      const percent = Number(value);
      // A value in the CLI section wins; the browser's entry fills in when there is none.
      if (isLowStockPercent(percent) && settings["low-threshold"] === undefined)
        settings["low-threshold"] = percent;
      else if (!isLowStockPercent(percent)) skipped.push(key);
    } else skipped.push(key);
  }
  if (!Object.keys(settings).length)
    throw new Error(
      `${source} has nothing the CLI can use. Settings it understands: the low-stock threshold, and a "cli" section.`,
    );
  return { settings, skipped };
}
