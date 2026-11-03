#!/usr/bin/env node

import { version } from "../package.json";
import { parseArgs } from "./args";
import { reportError } from "./report";
import { defaultDependencies, type CliOutput } from "./runtime";
import { clearUserConfig, savableSettings, saveUserConfig, userConfigPath } from "./user-config";
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
