#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { version } from "../package.json";
import { parseArgs } from "./args";
import { checkConfig, expandConfig } from "./config";
import { requestsJson } from "./json-report";
import { reportError } from "./report";
import { defaultDependencies, type CliOutput } from "./runtime";
import { buildExportDocument, parseImportDocument } from "./settings-transfer";
import { redactUrl } from "./url-credentials";
import {
  clearUserConfig,
  savableSettings,
  saveUserConfig,
  userConfigPath,
  writeTextAtomic,
} from "./user-config";
import { runWatch, stopOnQuit } from "./watch";
import { runWorkflow } from "./workflow";

const output: CliOutput = {
  log: (...values) => console.log(...values),
  warn: (...values) => console.warn(...values),
  error: (...values) => console.error(...values),
  setExitCode: (code) => {
    process.exitCode = code;
  },
};

const TOKEN_FLAGS = new Set([
  "--spoolman-token",
  "--bambuddy-token",
  "--filamentdb-token",
  "--filament-db-token",
]);

const URL_FLAGS = new Set([
  "--spoolman-url",
  "--filamentdb-url",
  "--filament-db-url",
  "--bambuddy-url",
  "--filadex-url",
]);

function redactArgs(args: readonly string[]): string[] {
  const redacted: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    if (TOKEN_FLAGS.has(flag)) {
      if (eq > 0) redacted.push(`${flag}=<redacted>`);
      else if (args[i + 1] && !args[i + 1]!.startsWith("-")) {
        redacted.push(flag, "<redacted>");
        i++;
      } else redacted.push(arg);
    } else if (URL_FLAGS.has(flag)) {
      if (eq > 0) redacted.push(`${flag}=${redactUrl(arg.slice(eq + 1))}`);
      else if (args[i + 1] && !args[i + 1]!.startsWith("-")) {
        redacted.push(flag, redactUrl(args[i + 1]!));
        i++;
      } else redacted.push(arg);
    } else {
      redacted.push(arg);
    }
  }
  return redacted;
}

const args = process.argv.slice(2);
let jsonMode = requestsJson(args);

try {
  if (args.some((arg) => arg === "--version" || arg === "-V")) {
    const rest = args.filter((arg, index) => {
      if (arg === "--version" || arg === "-V" || arg === "--json" || arg === "--format=json")
        return false;
      if (arg === "--format" && args[index + 1] === "json") return false;
      if (arg === "json" && args[index - 1] === "--format") return false;
      return true;
    });
    if (rest.length) throw new Error(`--version cannot be combined with ${rest[0]}`);
    output.log(jsonMode ? JSON.stringify({ version }) : version);
  } else {
    const configFile = userConfigPath();
    const hasFlag = (flag: string) =>
      args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
    const flagTarget = (flag: string): string => {
      const index = args.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
      const raw = args[index]!;
      const inline = raw.startsWith(`${flag}=`) ? raw.slice(flag.length + 1) : undefined;
      const target = inline ?? args[index + 1];
      if (!target || (inline === undefined && target.startsWith("-")))
        throw new Error(`${flag} requires a file name.`);
      const used = inline !== undefined ? [index] : [index, index + 1];
      const extra = args.find((_, i) => !used.includes(i));
      if (extra) throw new Error(`${flag} cannot be combined with ${extra}`);
      return target;
    };
    if (args.includes("--config-path")) {
      const extra = args.find((arg) => arg !== "--config-path");
      if (extra) throw new Error(`--config-path cannot be combined with ${extra}`);
      output.log(configFile);
    } else if (hasFlag("--export-settings") || hasFlag("--import-settings")) {
      if (hasFlag("--export-settings") && hasFlag("--import-settings"))
        throw new Error("Use either --export-settings or --import-settings, not both.");
      const exporting = hasFlag("--export-settings");
      const flag = exporting ? "--export-settings" : "--import-settings";
      const target = flagTarget(flag);
      if (exporting) {
        let saved: Record<string, unknown> | null = null;
        try {
          const text = await readFile(configFile, "utf8");
          const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            throw new Error(`Config file "${configFile}": must contain a JSON object.`);
          saved = parsed as Record<string, unknown>;
          checkConfig(configFile, saved);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        await writeTextAtomic(target, buildExportDocument(saved));
        output.log(`Exported ${saved ? Object.keys(saved).length : 0} settings to ${target}`);
      } else {
        const { settings, skipped } = parseImportDocument(await readFile(target, "utf8"), target);
        await saveUserConfig(configFile, settings);
        output.log(`Imported ${Object.keys(settings).length} settings into ${configFile}`);
        if (skipped.length)
          output.error(
            `Skipped ${skipped.length} settings the CLI does not use: ${skipped.join(", ")}`,
          );
      }
    } else if (args.includes("--show-config")) {
      const lines: Record<string, string[]> = {};
      expandConfig(redactArgs(args.filter((arg) => arg !== "--show-config")), undefined, {
        userConfig: { path: configFile },
        trace: ({ layer, option }) => (lines[layer] ??= []).push(option),
      });
      output.log(
        `Settings file: ${configFile}${args.includes("--no-user-config") ? " (ignored by --no-user-config)" : ""}`,
      );
      for (const layer of ["settings file", "--config file", "command line"] as const) {
        output.log(`\n${layer}:`);
        for (const option of lines[layer] ?? []) output.log(`  ${option}`);
        if (!lines[layer]?.length) output.log("  (nothing)");
      }
    } else if (args.includes("--clear-config")) {
      const extra = args.find((arg) => arg !== "--clear-config");
      if (extra) throw new Error(`--clear-config cannot be combined with ${extra}`);
      const removed = await clearUserConfig(configFile);
      output.log(removed ? `Removed ${configFile}` : `No saved settings at ${configFile}`);
    } else {
      const options = parseArgs(args, {
        userConfig: { path: configFile },
        // Notes go to stderr so machine-readable output on stdout stays clean.
        onNote: (message) => output.error(message),
      });
      jsonMode = options.json;
      if (options.saveConfig) {
        const settings = savableSettings(options);
        await saveUserConfig(configFile, settings);
        output.log(
          `Saved ${Object.keys(settings).length} ${Object.keys(settings).length === 1 ? "setting" : "settings"} to ${configFile}`,
        );
      } else if (options.watch) {
        const stop = new AbortController();
        // SIGBREAK is Ctrl+Break on Windows; typing q ends a watch where no signal can reach it.
        for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"] as const)
          process.once(signal, () => stop.abort());
        const detach = stopOnQuit(process.stdin, () => stop.abort());
        const watchedFiles = [
          ...new Set([
            ...options.inputs.values(),
            ...(options.reference ? [options.reference] : []),
            ...(options.referenceReport ? [options.referenceReport] : []),
          ]),
        ];
        try {
          await runWatch({
            files: watchedFiles,
            output,
            signal: stop.signal,
            quiet: options.quiet,
            run: async (runOutput, previous) => {
              try {
                return await runWorkflow(options, defaultDependencies, runOutput, previous);
              } catch (error) {
                reportError(error, options.json, runOutput);
                return undefined;
              }
            },
          });
        } finally {
          detach();
        }
      } else await runWorkflow(options, defaultDependencies, output);
    }
  }
} catch (error) {
  reportError(error, jsonMode, output);
}
