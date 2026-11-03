#!/usr/bin/env node

import { version } from "../package.json";
import { parseArgs } from "./args";
import { reportError } from "./report";
import { defaultDependencies, type CliOutput } from "./runtime";
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
    const options = parseArgs(args);
    if (options.watch) {
      const stop = new AbortController();
      for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => stop.abort());
      await runWatch({
        files: [...options.inputs.values()],
        output,
        signal: stop.signal,
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
} catch (error) {
  reportError(error, process.argv.slice(2).includes("--json"), output);
}
