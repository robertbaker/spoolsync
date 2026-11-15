import type { ApplyLogEntry } from "@spoolsync/core/core/model";

/** Plain text stays readable in terminals, redirected logs, and watch comparisons. */
export function textTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]!.length)),
  );
  return [headers, ...rows]
    .map(
      (row) =>
        `  ${row
          .map((cell, index) => cell.padEnd(widths[index]!))
          .join("  ")
          .trimEnd()}`,
    )
    .join("\n");
}

/** Used for successful runs and partial failures so completed work is never hidden. */
export function applyResults(entries: readonly ApplyLogEntry[]): string {
  if (!entries.length) return "Apply results:\n  No remote changes were applied.";
  const succeeded = entries.filter((entry) => entry.ok).length;
  return [
    `Apply results: ${succeeded} succeeded, ${entries.length - succeeded} failed`,
    ...entries.map(
      (entry) => `  ${entry.ok ? "OK" : "FAILED"}  ${entry.groupId}: ${entry.message}`,
    ),
  ].join("\n");
}
