import { once } from "node:events";
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
 * Stops watching when a line reading `q` or `quit` arrives on `input`. Windows cannot deliver a
 * catchable SIGINT to another process (only Ctrl+C in a console), so this is the route for anything
 * that drives the CLI from outside, and a plain way to stop for people who do not reach for Ctrl+C.
 * Other text, and the input ending, are ignored, so `< /dev/null` never stops a watch. Returns a
 * function that detaches the listener so the process can exit.
 */
/** The part of a readable stream `stopOnQuit` uses (`process.stdin` fits). */
export interface QuitInput {
  on(event: "data", listener: (chunk: string | Uint8Array) => void): unknown;
  on(event: "error", listener: () => void): unknown;
  off(event: "data", listener: (chunk: string | Uint8Array) => void): unknown;
  off(event: "error", listener: () => void): unknown;
  setEncoding(encoding: "utf8"): unknown;
  pause(): unknown;
}

export function stopOnQuit(input: QuitInput, onStop: () => void): () => void {
  let pending = "";
  const onData = (chunk: string | Uint8Array) => {
    pending += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    if (lines.some((line) => /^\s*(q|quit)\s*$/i.test(line))) onStop();
  };
  input.setEncoding("utf8");
  input.on("data", onData);
  // An input that fails or ends must not take the watch down with it.
  const ignore = () => {};
  input.on("error", ignore);
  return () => {
    input.off("data", onData);
    input.off("error", ignore);
    input.pause();
  };
}

/**
 * Runs once, then again whenever one of the files changes, until the signal aborts. Changes that
 * arrive while a run is in progress cause exactly one more run afterwards. Each run after the first
 * is told the previous snapshot so it can print what changed. Status lines go to stderr so
 * machine-readable results on stdout stay clean. A failing run's exit code is kept even if a later
 * run succeeds.
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

  // The code of the current run, and the last failing code any run produced (kept for the exit).
  let exitCode = 0;
  let failureCode = 0;
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
      try {
        lastSnapshot = (await run(runOutput, lastSnapshot)) ?? lastSnapshot;
      } catch (error) {
        // Output held back by quiet mode is not lost with a failed run.
        flush(header);
        throw error;
      } finally {
        if (exitCode !== 0) failureCode = exitCode;
      }
      flush(header);
    } while (again);
  }

  function flush(header: string): void {
    if (!quiet) return;
    const signature = JSON.stringify(entries);
    if (signature !== lastSignature) {
      if (header) output.error(header);
      for (const entry of entries) output[entry.channel](...entry.values);
    }
    lastSignature = JSON.stringify(
      entries
        .filter(
          (entry) =>
            !(
              entry.channel === "log" &&
              typeof entry.values[0] === "string" &&
              entry.values[0].startsWith("Changes since the last run:")
            ),
        )
        .map((entry) => {
          if (
            entry.channel === "log" &&
            entry.values.length === 1 &&
            typeof entry.values[0] === "string" &&
            entry.values[0].startsWith("{") &&
            entry.values[0].includes('"changesSinceLastRun"')
          ) {
            try {
              const parsed = JSON.parse(entry.values[0]) as Record<string, unknown>;
              delete parsed["changesSinceLastRun"];
              return { ...entry, values: [JSON.stringify(parsed, null, 2)] };
            } catch {
              return entry;
            }
          }
          return entry;
        }),
    );
  }

  function schedule(): void {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (running) again = true;
      else {
        // A failed run is reported, never an unhandled rejection or a throw from `await running`.
        running = execute()
          .catch((error: unknown) => {
            failureCode = 1;
            output.error(
              `Watch run failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          })
          .finally(() => {
            running = undefined;
            // Changes that arrived while the run was failing still get their run.
            if (again || changed.size) {
              again = false;
              if (!signal.aborted) schedule();
            }
          });
      }
    }, dependencies.debounceMs);
  }

  await execute();
  output.error(
    `Watching ${files.length} file${files.length === 1 ? "" : "s"} for changes. Press Ctrl+C (or type q and press Enter) to stop.`,
  );

  const watchers = [...targets].map(([directory, names]) =>
    dependencies.watchDirectory(directory, (filename) => {
      const matched =
        filename === null ? [...names.values()] : [names.get(filename)].filter(Boolean);
      if (!matched.length) return;
      for (const file of matched) changed.add(file as string);
      schedule();
    }),
  );

  if (!signal.aborted) await once(signal, "abort");
  clearTimeout(timer);
  for (const watcher of watchers) watcher.close();
  await running;
  output.setExitCode(failureCode);
}
