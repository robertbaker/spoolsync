import { describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import path from "node:path";

import { snapshotInventory, type InventorySnapshot } from "@spoolsync/core/workflow";

import type { CliOutput } from "./runtime";
import { runWatch, stopOnQuit, type QuitInput, type WatchDependencies } from "./watch";

function harness() {
  const handlers = new Map<string, (filename: string | null) => void>();
  const closed: string[] = [];
  const dependencies: WatchDependencies = {
    watchDirectory(directory, onEvent) {
      handlers.set(directory, onEvent);
      return { close: () => closed.push(directory) };
    },
    debounceMs: 5,
    now: () => new Date(2026, 10, 3, 9, 8, 7),
  };
  const lines: string[] = [];
  let exitCode: number | undefined;
  const output: CliOutput = {
    log: () => {},
    warn: () => {},
    error: (...values) => lines.push(values.join(" ")),
    setExitCode: (code) => (exitCode = code),
  };
  const stop = new AbortController();
  return { handlers, closed, dependencies, lines, output, stop, exitCode: () => exitCode };
}

/**
 * Watched directories are resolved paths, which differ per platform ("/data" is "D:\data" on
 * Windows).
 */
const abs = (value: string) => path.resolve(value);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("runs once, then again for each change to a watched file only", async () => {
  const h = harness();
  let runs = 0;
  const done = runWatch({
    files: ["/data/a.json", "/data/b.json"],
    run: async () => void runs++,
    output: h.output,
    signal: h.stop.signal,
    dependencies: h.dependencies,
  });
  await wait(20);
  expect(runs).toBe(1);
  expect(h.lines.at(-1)).toContain("Watching 2 files");

  h.handlers.get(abs("/data"))!("unrelated.txt");
  await wait(30);
  expect(runs).toBe(1);

  h.handlers.get(abs("/data"))!("a.json");
  await wait(30);
  expect(runs).toBe(2);
  expect(h.lines.some((line) => line.includes("[09:08:07] /data/a.json changed"))).toBe(true);

  // A burst of saves (and a platform that omits the name) is a single run.
  h.handlers.get(abs("/data"))!("a.json");
  h.handlers.get(abs("/data"))!("b.json");
  h.handlers.get(abs("/data"))!(null);
  await wait(30);
  expect(runs).toBe(3);

  h.stop.abort();
  await done;
  expect(h.closed).toEqual([abs("/data")]);
});

test("a change during a run causes exactly one more run, and a failure keeps the exit code", async () => {
  const h = harness();
  let runs = 0;
  let release: (() => void) | undefined;
  const done = runWatch({
    files: ["/d/a.json"],
    run: async (output) => {
      runs++;
      if (runs === 2) await new Promise<void>((resolve) => (release = resolve));
      output.setExitCode(runs === 3 ? 0 : 1);
    },
    output: h.output,
    signal: h.stop.signal,
    dependencies: h.dependencies,
  });
  await wait(20);
  h.handlers.get(abs("/d"))!("a.json");
  await wait(30);
  expect(runs).toBe(2);
  // Edited again while the second run is still going.
  h.handlers.get(abs("/d"))!("a.json");
  await wait(30);
  expect(runs).toBe(2);
  release!();
  await wait(30);
  expect(runs).toBe(3);

  h.stop.abort();
  await done;
  // Run 3 succeeded, but run 2 failed: the process still exits non-zero.
  expect(h.exitCode()).toBe(1);
});

test("a rerun that is pending when the signal aborts is not started", async () => {
  const h = harness();
  let runs = 0;
  let release: (() => void) | undefined;
  const done = runWatch({
    files: ["/data/a.json"],
    run: async () => {
      runs++;
      if (runs === 2) await new Promise<void>((resolve) => (release = resolve));
    },
    output: h.output,
    signal: h.stop.signal,
    dependencies: h.dependencies,
  });
  await wait(20);
  h.handlers.get(abs("/data"))!("a.json");
  await wait(30);
  expect(runs).toBe(2);
  // A change arrives during the second run, then Ctrl+C: the queued rerun must not run.
  h.handlers.get(abs("/data"))!("a.json");
  await wait(30);
  h.stop.abort();
  release!();
  await done;
  await wait(30);
  expect(runs).toBe(2);
});

test("stopping waits for a run in progress and reports its exit code", async () => {
  const h = harness();
  let release: (() => void) | undefined;
  let runs = 0;
  const done = runWatch({
    files: ["/d/a.json"],
    run: async (output) => {
      runs++;
      if (runs === 2) await new Promise<void>((resolve) => (release = resolve));
      output.setExitCode(runs === 2 ? 1 : 0);
    },
    output: h.output,
    signal: h.stop.signal,
    dependencies: h.dependencies,
  });
  await wait(20);
  h.handlers.get(abs("/d"))!("a.json");
  await wait(30);
  h.stop.abort();
  let finished = false;
  void done.then(() => (finished = true));
  await wait(20);
  expect(finished).toBe(false);
  release!();
  await done;
  expect(h.exitCode()).toBe(1);
});

test("quiet mode prints a run only when its output differs from the previous run", async () => {
  const h = harness();
  const logged: string[] = [];
  h.output.log = (...values) => logged.push(values.join(" "));
  let report = "plan A";
  const done = runWatch({
    files: ["/d/a.json"],
    run: async (output) => output.log(report),
    output: h.output,
    signal: h.stop.signal,
    dependencies: h.dependencies,
    quiet: true,
  });
  await wait(20);
  expect(logged).toEqual(["plan A"]);

  // Saved again with the same result: nothing new is printed, not even the status line.
  const statusLines = () =>
    h.lines.filter((line) => line.includes("changed; running again")).length;
  h.handlers.get(abs("/d"))!("a.json");
  await wait(30);
  expect(logged).toEqual(["plan A"]);
  expect(statusLines()).toBe(0);

  report = "plan B";
  h.handlers.get(abs("/d"))!("a.json");
  await wait(30);
  expect(logged).toEqual(["plan A", "plan B"]);
  expect(statusLines()).toBe(1);

  h.stop.abort();
  await done;
});

test("each run receives the snapshot of the last successful run", async () => {
  const h = harness();
  const seen: Array<InventorySnapshot | undefined> = [];
  const snapshots = [snapshotInventory([]), undefined, snapshotInventory([])];
  const done = runWatch({
    files: ["/d/a.json"],
    run: async (_output, previous) => {
      seen.push(previous);
      return snapshots[seen.length - 1];
    },
    output: h.output,
    signal: h.stop.signal,
    dependencies: h.dependencies,
  });
  await wait(20);
  h.handlers.get(abs("/d"))!("a.json");
  await wait(30);
  h.handlers.get(abs("/d"))!("a.json");
  await wait(30);
  h.stop.abort();
  await done;
  // The failed second run does not erase the first run's snapshot.
  expect(seen).toEqual([undefined, snapshots[0], snapshots[0]]);
});

describe("stopOnQuit", () => {
  const input = () => {
    const emitter = new EventEmitter();
    const source = {
      on: (event: string, listener: (...values: any[]) => void) => emitter.on(event, listener),
      off: (event: string, listener: (...values: any[]) => void) => emitter.off(event, listener),
      setEncoding: () => {},
      pause: () => {},
      emit: (event: string, ...values: unknown[]) => emitter.emit(event, ...values),
      listenerCount: (event: string) => emitter.listenerCount(event),
    };
    return source as typeof source & QuitInput;
  };

  test("stops on a line reading q or quit, however it is split across chunks", () => {
    const source = input();
    const stop = mock(() => {});
    stopOnQuit(source, stop);
    source.emit("data", "hello\n");
    source.emit("data", "qu");
    expect(stop).not.toHaveBeenCalled();
    source.emit("data", "it\r\n");
    expect(stop).toHaveBeenCalledTimes(1);
    source.emit("data", " Q \n");
    expect(stop).toHaveBeenCalledTimes(2);
  });

  test("ignores other text, an unfinished line, and the input ending", () => {
    const source = input();
    const stop = mock(() => {});
    stopOnQuit(source, stop);
    source.emit("data", "quiet\nq");
    source.emit("end");
    source.emit("error", new Error("closed"));
    expect(stop).not.toHaveBeenCalled();
  });

  test("detaching removes the listeners", () => {
    const source = input();
    const stop = mock(() => {});
    const detach = stopOnQuit(source, stop);
    detach();
    source.emit("data", "q\n");
    expect(stop).not.toHaveBeenCalled();
    expect(source.listenerCount("data")).toBe(0);
  });
});

test("a run that throws after a change is reported without an unhandled rejection", async () => {
  const h = harness();
  let runs = 0;
  const done = runWatch({
    files: ["/data/a.json"],
    run: async () => {
      if (++runs > 1) throw new Error("boom");
    },
    output: h.output,
    signal: h.stop.signal,
    dependencies: h.dependencies,
  });
  await wait(20);
  h.handlers.get(abs("/data"))!("a.json");
  await wait(30);
  expect(runs).toBe(2);
  expect(h.lines.some((line) => line.includes("Watch run failed: boom"))).toBe(true);
  h.stop.abort();
  await done;
  expect(h.exitCode()).toBe(1);
});

test("a throwing run still flushes held quiet output and re-runs pending changes", async () => {
  const h = harness();
  const logged: string[] = [];
  h.output.log = (...values) => logged.push(values.join(" "));
  let runs = 0;
  let release: (() => void) | undefined;
  const done = runWatch({
    files: ["/d/a.json"],
    quiet: true,
    run: async (output) => {
      runs++;
      if (runs === 2) {
        output.log("held before throw");
        await new Promise<void>((resolve) => (release = resolve));
        throw new Error("boom");
      }
    },
    output: h.output,
    signal: h.stop.signal,
    dependencies: h.dependencies,
  });
  await wait(20);
  h.handlers.get(abs("/d"))!("a.json");
  await wait(30);
  expect(runs).toBe(2);
  // Edited again while the second run is in progress, then it throws.
  h.handlers.get(abs("/d"))!("a.json");
  await wait(30);
  release!();
  await wait(40);
  expect(logged).toContain("held before throw");
  expect(runs).toBe(3);
  h.stop.abort();
  await done;
  expect(h.exitCode()).toBe(1);
});
