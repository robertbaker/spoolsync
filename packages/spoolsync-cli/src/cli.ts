#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { version } from "../package.json";
import { parseArgs } from "./args";
import { checkConfig, expandConfig } from "./config";
import { help } from "./help";
import { requestsJson } from "./json-report";
import { validateOutputPaths } from "./output";
import { createPalette } from "./presentation";
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
  isTTY: Boolean(process.stdout.isTTY && !process.env["NO_COLOR"]),
  stderrIsTTY: Boolean(process.stderr.isTTY && !process.env["NO_COLOR"]),
};

const TOKEN_FLAGS = new Set([
  "--spoolman-token",
  "--bambuddy-token",
  "--printstudio-operator",
  "--filamentdb-token",
  "--filament-db-token",
]);

const URL_FLAGS = new Set([
  "--spoolman-url",
  "--filamentdb-url",
  "--filament-db-url",
  "--bambuddy-url",
  "--printstudio-url",
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
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    // Help must remain available even when saved settings cannot be read.
    help();
  } else if (args.some((arg) => arg === "--version" || arg === "-V")) {
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
        try {
          await validateOutputPaths([configFile], [target]);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.startsWith("Output would overwrite an input inventory")
          )
            throw new Error(
              `--export-settings cannot overwrite the settings file "${configFile}".`,
            );
          throw error;
        }
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
        const palette = createPalette(Boolean(output.isTTY));
        output.log(
          palette.green(`Exported ${saved ? Object.keys(saved).length : 0} settings to ${target}`),
        );
      } else {
        const { settings, skipped } = parseImportDocument(await readFile(target, "utf8"), target);
        await saveUserConfig(configFile, settings);
        const palette = createPalette(Boolean(output.isTTY));
        output.log(
          palette.green(`Imported ${Object.keys(settings).length} settings into ${configFile}`),
        );
        if (skipped.length)
          output.error(
            palette.yellow(
              `Skipped ${skipped.length} settings the CLI does not use: ${skipped.join(", ")}`,
            ),
          );
      }
    } else if (args.includes("--show-config")) {
      const palette = createPalette(Boolean(output.isTTY));
      const lines: Record<string, string[]> = {};
      expandConfig(redactArgs(args.filter((arg) => arg !== "--show-config")), undefined, {
        userConfig: { path: configFile },
        trace: ({ layer, option }) => (lines[layer] ??= []).push(option),
      });
      output.log(
        `${palette.bold("Settings file:")} ${palette.cyan(configFile)}${args.includes("--no-user-config") ? palette.dim(" (ignored by --no-user-config)") : ""}`,
      );
      for (const layer of ["settings file", "--config file", "command line"] as const) {
        output.log(`\n${palette.bold(palette.cyan(`${layer}:`))}`);
        for (const option of lines[layer] ?? []) output.log(`  ${option}`);
        if (!lines[layer]?.length) output.log(`  ${palette.dim("(nothing)")}`);
      }
    } else if (args.includes("--clear-config")) {
      const extra = args.find((arg) => arg !== "--clear-config");
      if (extra) throw new Error(`--clear-config cannot be combined with ${extra}`);
      const removed = await clearUserConfig(configFile);
      const palette = createPalette(Boolean(output.isTTY));
      output.log(
        removed
          ? palette.green(`Removed ${configFile}`)
          : palette.dim(`No saved settings at ${configFile}`),
      );
    } else {
      // Config files can select JSON too. Resolve that before argument validation so an invalid
      // combination is still reported in the requested format.
      jsonMode = requestsJson(expandConfig(args, undefined, { userConfig: { path: configFile } }));
      const options = parseArgs(args, {
        userConfig: { path: configFile },
        // Notes go to stderr so machine-readable output on stdout stays clean.
        onNote: (message) => output.error(message),
      });
      jsonMode = options.json;
      const configIndex = args.findIndex(
        (arg) => arg === "--config" || arg.startsWith("--config="),
      );
      const explicitConfig =
        configIndex < 0
          ? undefined
          : args[configIndex] === "--config"
            ? args[configIndex + 1]
            : args[configIndex]!.slice("--config=".length);
      const workflowDependencies = {
        ...defaultDependencies,
        protectedPaths: [configFile, ...(explicitConfig ? [explicitConfig] : [])],
      };
      if (options.saveConfig) {
        const settings = savableSettings(options);
        await saveUserConfig(configFile, settings);
        const palette = createPalette(Boolean(output.isTTY));
        output.log(
          palette.green(
            `Saved ${Object.keys(settings).length} ${Object.keys(settings).length === 1 ? "setting" : "settings"} to ${configFile}`,
          ),
        );
      } else if (options.watch) {
        const stop = new AbortController();
        // SIGBREAK is Ctrl+Break on Windows; typing q ends a watch where no signal can reach it.
        const onSignal = () => stop.abort();
        const signals = ["SIGINT", "SIGTERM", "SIGBREAK"] as const;
        for (const signal of signals) process.once(signal, onSignal);
        const detach = stopOnQuit(process.stdin, () => stop.abort());
        const watchedFiles = [
          ...new Set([
            ...options.inputs.values(),
            ...(options.reference ? [options.reference] : []),
            ...(options.referenceReport ? [options.referenceReport] : []),
          ]),
        ];
        let abandoned = false;
        try {
          ({ abandoned } = await runWatch({
            files: watchedFiles,
            output,
            signal: stop.signal,
            quiet: options.quiet,
            run: async (runOutput, previous) => {
              try {
                return await runWorkflow(options, workflowDependencies, runOutput, previous);
              } catch (error) {
                reportError(error, options.json, runOutput);
                return undefined;
              }
            },
          }));
        } finally {
          detach();
          for (const signal of signals) process.off(signal, onSignal);
        }
        // A run that never finished may hold sockets or timers open; its exit code is already set.
        if (abandoned) process.exit();
      } else await runWorkflow(options, workflowDependencies, output);
    }
  }
} catch (error) {
  reportError(error, jsonMode, output);
}
