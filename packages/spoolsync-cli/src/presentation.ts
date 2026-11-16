import type { ApplyLogEntry } from "@spoolsync/core/core/model";

/** Wrap prose without splitting flags, paths, or other copyable tokens. */
function wrapWords(text: string, indent: string, width: number): string {
  const lines: string[] = [];
  let line = indent;
  for (const word of text.trim().split(/\s+/)) {
    if (line.length > indent.length && line.length + word.length + 1 > width) {
      lines.push(line);
      line = indent;
    }
    line += (line.length === indent.length ? "" : " ") + word;
  }
  lines.push(line);
  return lines.join("\n");
}

/** Stacked options leave room for descriptions even in narrow terminals. */
export function formatHelp(text: string, columns: number): string {
  const width = Math.max(40, Math.min(100, columns || 80));
  return text
    .split("\n")
    .map((line) => {
      // Examples must remain on one line so copying them preserves the command.
      if (line.trimStart().startsWith("spoolsync ")) return line;
      const option = /^  ((?:-[hV], )?--\S+(?: <[^>]+>)?)\s+(.+)$/.exec(line);
      if (option) return `  ${option[1]}\n${wrapWords(option[2]!, "      ", width)}`;
      const indent = line.match(/^\s*/)?.[0] ?? "";
      return line.trim() ? wrapWords(line, indent.length > 6 ? "      " : indent, width) : "";
    })
    .join("\n");
}

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
