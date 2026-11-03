import { expect, test } from "bun:test";

import type { CliOutput } from "./runtime";
import { runWatch, type WatchDependencies } from "./watch";

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

  h.handlers.get("/data")!("unrelated.txt");
  await wait(30);
  expect(runs).toBe(1);

  h.handlers.get("/data")!("a.json");
  await wait(30);
  expect(runs).toBe(2);
  expect(h.lines.some((line) => line.includes("[09:08:07] /data/a.json changed"))).toBe(true);

  // A burst of saves (and a platform that omits the name) is a single run.
  h.handlers.get("/data")!("a.json");
  h.handlers.get("/data")!("b.json");
  h.handlers.get("/data")!(null);
  await wait(30);
  expect(runs).toBe(3);

  h.stop.abort();
  await done;
  expect(h.closed).toEqual(["/data"]);
});

test("a change during a run causes exactly one more run, and the last run sets the exit code", async () => {
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
  h.handlers.get("/d")!("a.json");
  await wait(30);
  expect(runs).toBe(2);
  // Edited again while the second run is still going.
  h.handlers.get("/d")!("a.json");
  await wait(30);
  expect(runs).toBe(2);
  release!();
  await wait(30);
  expect(runs).toBe(3);

  h.stop.abort();
  await done;
  expect(h.exitCode()).toBe(0);
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
  h.handlers.get("/d")!("a.json");
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
