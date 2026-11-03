import { watch as fsWatch } from "node:fs";
import path from "node:path";

import type { InventorySnapshot } from "@spoolsync/core/workflow";

import type { CliOutput } from "./runtime";

export interface FileWatcher {
  close(): void;
}

export interface WatchDependencies {
  /** Calls `onEvent` with the changed file name (or null when the platform omits it). */
  watchDirectory(directory: string, onEvent: (filename: string | null) => void): FileWatcher;
  /** Quiet time after the last change before running again, so one save is one run. */
  debounceMs: number;
  now(): Date;
}

export const defaultWatchDependencies: WatchDependencies = {
  // Watching the directory, not the file, survives editors that save by replacing the file.
  watchDirectory: (directory, onEvent) =>
    fsWatch(directory, { persistent: true }, (_event, filename) =>
      onEvent(filename === null ? null : String(filename)),
    ),
  debounceMs: 250,
  now: () => new Date(),
};

export interface WatchRequest {
  files: readonly string[];
  /**
   * Runs the workflow once. It reports its own errors and records its exit code on `output`. It
   * receives the snapshot of the last run that succeeded, and returns this run's snapshot (or
   * nothing when the run failed, which keeps the earlier snapshot as the point of comparison).
   */
  run(output: CliOutput, previous?: InventorySnapshot): Promise<InventorySnapshot | void>;
  output: CliOutput;
  signal: AbortSignal;
  dependencies?: WatchDependencies;
  /** Print a run only when its output differs from the previous run. */
  quiet?: boolean;
}

/**
 * Runs once, then again whenever one of the files changes, until the signal aborts. Changes that
 * arrive while a run is in progress cause exactly one more run afterwards. Each run after the first
 * is told the previous snapshot so it can print what changed. Status lines go to stderr so
 * machine-readable results on stdout stay clean. The exit code is that of the last run.
 */
export async function runWatch(request: WatchRequest): Promise<void> {
  const {
    files,
    run,
    output,
    signal,
    quiet = false,
    dependencies = defaultWatchDependencies,
  } = request;
  const targets = new Map<string, Map<string, string>>();
  for (const file of files) {
    const absolute = path.resolve(file);
    const directory = path.dirname(absolute);
    const names = targets.get(directory) ?? new Map<string, string>();
    names.set(path.basename(absolute), file);
    targets.set(directory, names);
  }

  let exitCode = 0;
  type Entry = { channel: "log" | "warn" | "error"; values: unknown[] };
  let entries: Entry[] = [];
  let lastSignature: string | undefined;
  let lastSnapshot: InventorySnapshot | undefined;
  // In quiet mode a run's output is held back until it is known to differ from the last one.
  const runOutput: CliOutput = quiet
    ? {
        log: (...values) => entries.push({ channel: "log", values }),
        warn: (...values) => entries.push({ channel: "warn", values }),
        error: (...values) => entries.push({ channel: "error", values }),
        setExitCode: (code) => (exitCode = code),
      }
    : { ...output, setExitCode: (code) => (exitCode = code) };
  const changed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let again = false;

  const stamp = () => dependencies.now().toTimeString().slice(0, 8);
  async function execute(): Promise<void> {
    do {
      again = false;
      const names = [...changed];
      changed.clear();
      const header = names.length ? `[${stamp()}] ${names.join(", ")} changed; running again` : "";
      if (!quiet && header) output.error(header);
      exitCode = 0;
      entries = [];
      lastSnapshot = (await run(runOutput, lastSnapshot)) ?? lastSnapshot;
      if (quiet) {
        const signature = JSON.stringify(entries);
        if (signature !== lastSignature) {
          if (header) output.error(header);
          for (const entry of entries) output[entry.channel](...entry.values);
        }
        lastSignature = signature;
      }
    } while (again);
  }

  await execute();
  output.error(
    `Watching ${files.length} file${files.length === 1 ? "" : "s"} for changes. Press Ctrl+C to stop.`,
  );

  const watchers = [...targets].map(([directory, names]) =>
    dependencies.watchDirectory(directory, (filename) => {
      const matched =
        filename === null ? [...names.values()] : [names.get(filename)].filter(Boolean);
      if (!matched.length) return;
      for (const file of matched) changed.add(file as string);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (running) again = true;
        else {
          running = execute().finally(() => (running = undefined));
        }
      }, dependencies.debounceMs);
    }),
  );

  if (!signal.aborted)
    await new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
  clearTimeout(timer);
  for (const watcher of watchers) watcher.close();
  await running;
  output.setExitCode(exitCode);
}
