import { spinner } from "@clack/prompts";

import { formatProgress } from "./presentation";
import type { CliOutput } from "./runtime";

export interface ProgressTask {
  update(message: string): void;
  stop(message?: string): void;
  fail(message?: string): void;
}

export interface ProgressReporter {
  start(message: string): ProgressTask;
}

/**
 * Uses `@clack/prompts` animated spinners on interactive stderr, and falls back to plain status
 * lines when stderr is redirected or in watch mode so stdout and logs stay clean.
 */
export function createProgressReporter(
  options: { interactive: boolean; json: boolean; watch: boolean },
  output: CliOutput,
): ProgressReporter {
  if (options.json) {
    return {
      start: () => ({
        update() {},
        stop() {},
        fail() {},
      }),
    };
  }
  if (options.interactive && !options.watch) {
    return {
      start(message: string): ProgressTask {
        const task = spinner({ output: process.stderr });
        task.start(message);
        return {
          update(next) {
            task.message(next);
          },
          stop(done) {
            task.stop(done);
          },
          fail(err) {
            task.error(err);
          },
        };
      },
    };
  }
  return {
    start(): ProgressTask {
      return {
        update(next) {
          output.error(next);
        },
        stop() {},
        fail() {},
      };
    },
  };
}

export function formatApplyProgress(
  label: string,
  done: number,
  total: number,
  isTTY: boolean,
): string {
  if (!isTTY) return `Applying ${label} changes: ${done}/${total}`;
  const bar = formatProgress(done, total);
  return bar ? `Applying ${label} changes  ${bar}` : `Applying ${label} changes`;
}
