import process from "node:process";

import { CliError } from "./errors";
import type { CliOptions } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 5 * 60_000;

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    timeout: DEFAULT_TIMEOUT_MS,
    includeArchived: false,
    token: process.env.SPOOLMAN_TOKEN,
  };
  const seen = new Set<string>();
  const valueOptions = new Set<string>(["url", "token", "input", "output", "timeout"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--include-archived") options.includeArchived = true;
    else if (arg.startsWith("--")) {
      const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
      if (!valueOptions.has(rawKey)) throw new CliError(`Unknown option: --${rawKey}`, 2);
      const value = inlineValue ?? argv[++i];
      if (!value || value.startsWith("--")) throw new CliError(`Missing value for --${rawKey}`, 2);
      if (seen.has(rawKey)) throw new CliError(`Option --${rawKey} was provided more than once`, 2);
      seen.add(rawKey);
      switch (rawKey) {
        case "url":
          options.url = value;
          break;
        case "token":
          options.token = value;
          break;
        case "input":
          options.input = value;
          break;
        case "output":
          options.output = value;
          break;
        case "timeout":
          options.timeout = Number(value);
          break;
      }
    } else {
      throw new CliError(`Unexpected argument: ${arg}`, 2);
    }
  }
  if (options.timeout !== DEFAULT_TIMEOUT_MS) {
    const timeout = Number(options.timeout);
    if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > MAX_TIMEOUT_MS) {
      throw new CliError(
        `--timeout must be an integer from 1000 to ${MAX_TIMEOUT_MS} milliseconds`,
        2,
      );
    }
    options.timeout = timeout;
  }
  if (options.input && options.url) throw new CliError("Use either --input or --url, not both", 2);
  if (!options.input && !options.url && !options.help) {
    throw new CliError("Provide --url <Spoolman URL> or --input <Spoolman JSON export>", 2);
  }
  if (!options.output && !options.help) throw new CliError("Provide --output <inventory.ttag>", 2);
  if (options.token && !options.url) throw new CliError("--token requires --url", 2);
  return options;
}

export function printHelp(): void {
  console.log(`TigerTag Spoolman inventory importer

Usage:
  bun run tools/tigertag/spoolman-to-ttag.ts --url http://spoolman.local --output spools.ttag [options]
  bun run tools/tigertag/spoolman-to-ttag.ts --input spoolman-export.json --output spools.ttag

Options:
  --url <url>             Spoolman server base URL (reads GET /api/v1/spool)
  --token <token>         Optional bearer token for a protected Spoolman API
  --input <file>          Import a Spoolman JSON array or {"spools": [...]} export
  --output <file>         Output .ttag file, ready for Tiger Studio Manager
  --timeout <ms>          API timeout, 1000–300000 (default 30000)
  --include-archived      Include archived spools (excluded by default)
  --help, -h              Show this help

The tool only reads Spoolman and writes the requested output file. It never changes
Spoolman data or writes to your TigerTag account. Open the resulting .ttag in Tiger
Studio Manager and review its preview before accepting the import.`);
}
