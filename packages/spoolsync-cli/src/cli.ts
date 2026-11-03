#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { version } from "../package.json";
import { parseArgs } from "./args";
import { expandConfig } from "./config";
import { reportError } from "./report";
import { defaultDependencies, type CliOutput } from "./runtime";
import { buildExportDocument, parseImportDocument } from "./settings-transfer";
import {
  clearUserConfig,
  savableSettings,
  saveUserConfig,
  userConfigPath,
  writeTextAtomic,
} from "./user-config";
import { runWatch } from "./watch";
import { runWorkflow } from "./workflow";

const output: CliOutput = {
  log: (...values) => console.log(...values),
  warn: (...values) => console.warn(...values),
  error: (...values) => console.error(...values),
  setExitCode: (code) => {
    process.exitCode = code;
  },
};

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg === "--version" || arg === "-V")) {
    const unknown = args.find((arg) => !["--version", "-V", "--json"].includes(arg));
    if (unknown) throw new Error(`--version cannot be combined with ${unknown}`);
    output.log(args.includes("--json") ? JSON.stringify({ version }) : version);
  } else {
    const configFile = userConfigPath();
    if (args.includes("--config-path")) {
      output.log(configFile);
    } else if (args.includes("--export-settings") || args.includes("--import-settings")) {
      const exporting = args.includes("--export-settings");
      const flag = exporting ? "--export-settings" : "--import-settings";
      const target = args[args.indexOf(flag) + 1];
      if (!target || target.startsWith("-")) throw new Error(`${flag} requires a file name.`);
      if (args.includes("--export-settings") && args.includes("--import-settings"))
        throw new Error("Use either --export-settings or --import-settings, not both.");
      if (exporting) {
        let saved: Record<string, unknown> | null = null;
        try {
          saved = JSON.parse(await readFile(configFile, "utf8")) as Record<string, unknown>;
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
      expandConfig(
        args.filter((arg) => arg !== "--show-config"),
        undefined,
        {
          userConfig: { path: configFile },
          trace: ({ layer, option }) => (lines[layer] ??= []).push(option),
        },
      );
      output.log(
        `Settings file: ${configFile}${args.includes("--no-user-config") ? " (ignored by --no-user-config)" : ""}`,
      );
      for (const layer of ["settings file", "--config file", "command line"] as const) {
        output.log(`\n${layer}:`);
        for (const option of lines[layer] ?? []) output.log(`  ${option}`);
        if (!lines[layer]?.length) output.log("  (nothing)");
      }
    } else if (args.includes("--clear-config")) {
      const removed = await clearUserConfig(configFile);
      output.log(removed ? `Removed ${configFile}` : `No saved settings at ${configFile}`);
    } else {
      const options = parseArgs(args, {
        userConfig: { path: configFile },
        // Notes go to stderr so machine-readable output on stdout stays clean.
        onNote: (message) => output.error(message),
      });
      if (options.saveConfig) {
        const settings = savableSettings(options);
        await saveUserConfig(configFile, settings);
        output.log(
          `Saved ${Object.keys(settings).length} ${Object.keys(settings).length === 1 ? "setting" : "settings"} to ${configFile}`,
        );
      } else if (options.watch) {
        const stop = new AbortController();
        for (const signal of ["SIGINT", "SIGTERM"] as const)
          process.once(signal, () => stop.abort());
        await runWatch({
          files: [...options.inputs.values()],
          output,
          signal: stop.signal,
          quiet: options.quiet,
          run: async (runOutput) => {
            try {
              await runWorkflow(options, defaultDependencies, runOutput);
            } catch (error) {
              reportError(error, options.json, runOutput);
            }
          },
        });
      } else await runWorkflow(options, defaultDependencies, output);
    }
  }
} catch (error) {
  reportError(error, process.argv.slice(2).includes("--json"), output);
}
