import type { ApplyLogEntry, CommonSpool } from "@spoolsync/core/core/model";
import pc from "picocolors";

export type Palette = ReturnType<typeof pc.createColors>;

export function createPalette(enabled = pc.isColorSupported): Palette {
  return pc.createColors(enabled);
}

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

function colorizeHelpLine(line: string, palette: Palette): string {
  const trimmed = line.trimStart();
  if (trimmed === "SpoolSync CLI") return palette.bold(palette.cyan(line));
  if (trimmed.startsWith("spoolsync ")) {
    const indent = line.slice(0, line.length - trimmed.length);
    return `${indent}${palette.green(trimmed)}`;
  }
  if (/^[A-Z][^:]*:\s*$/.test(trimmed)) return palette.bold(palette.cyan(line));
  const flagLine = /^(\s{2})((?:-[A-Za-z0-9], )?--\S+)(\s+<[^>]+>)?$/.exec(line);
  if (flagLine) {
    const [, indent, flag, arg] = flagLine;
    return `${indent}${palette.cyan(flag!)}${arg ? palette.dim(arg) : ""}`;
  }
  return line;
}

/** Stacked options leave room for descriptions even in narrow terminals. */
export function formatHelp(text: string, columns: number, color = false): string {
  const width = Math.max(40, Math.min(100, columns || 80));
  const wrapped = text
    .split("\n")
    .map((line) => {
      // Examples must remain on one line so copying them preserves the command.
      if (line.trimStart().startsWith("spoolsync ")) return line;
      const option = /^  ((?:-[A-Za-z0-9], )?--\S+(?: <[^>]+>)?)\s+(.+)$/.exec(line);
      if (option) return `  ${option[1]}\n${wrapWords(option[2]!, "      ", width)}`;
      const indent = line.match(/^\s*/)?.[0] ?? "";
      return line.trim() ? wrapWords(line, indent.length > 6 ? "      " : indent, width) : "";
    })
    .join("\n");
  if (!color) return wrapped;
  const palette = createPalette(true);
  return wrapped
    .split("\n")
    .map((line) => colorizeHelpLine(line, palette))
    .join("\n");
}

export type CellStyler = (
  cell: string,
  rowIndex: number,
  colIndex: number,
  rawCell: string,
) => string;

/** Plain text stays readable in terminals, redirected logs, and watch comparisons. */
export function textTable(
  headers: string[],
  rows: string[][],
  rightAligned: readonly number[] = [],
  color = false,
  styleCell?: CellStyler,
): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]!.length)),
  );
  const palette = createPalette(color);
  const padCell = (cell: string, index: number, isLast: boolean) => {
    if (rightAligned.includes(index)) return cell.padStart(widths[index]!);
    return isLast ? cell : cell.padEnd(widths[index]!);
  };
  const formatRow = (
    row: string[],
    style?: (cell: string, index: number, rawCell: string) => string,
  ) =>
    `  ${row
      .map((cell, index) => {
        const padded = padCell(cell, index, index === row.length - 1);
        return style && padded !== "" ? style(padded, index, cell) : padded;
      })
      .join("  ")
      .trimEnd()}`;
  const headerLine = formatRow(
    headers,
    color ? (cell) => palette.bold(palette.cyan(cell)) : undefined,
  );
  const divider = `  ${palette.dim(widths.map((width) => "─".repeat(width)).join("  "))}`;
  const bodyLines = rows.map((row, rowIndex) => {
    const isTotal = rowIndex === rows.length - 1 && row[0] === "Total";
    return formatRow(
      row,
      color
        ? (cell, colIndex, rawCell) => {
            const styled = styleCell ? styleCell(cell, rowIndex, colIndex, rawCell) : cell;
            return isTotal ? palette.bold(styled) : styled;
          }
        : undefined,
    );
  });
  return [headerLine, divider, ...bodyLines].join("\n");
}

/** Compact progress bar for terminal spinners and status updates. */
export function formatProgress(done: number, total: number, width = 16): string {
  if (total <= 0) return "";
  const clamped = Math.max(0, Math.min(done, total));
  const filled = Math.round((clamped / total) * width);
  const bar = `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
  const percent = Math.round((clamped / total) * 100);
  return `${bar} ${clamped}/${total} (${percent}%)`;
}

/** Used for successful runs and partial failures so completed work is never hidden. */
export function applyResults(entries: readonly ApplyLogEntry[], color = false): string {
  const palette = createPalette(color);
  if (!entries.length) return `Apply results:\n  ${palette.dim("No remote changes were applied.")}`;
  const succeeded = entries.filter((entry) => entry.ok).length;
  const failed = entries.length - succeeded;
  const header = `Apply results: ${succeeded} succeeded, ${failed} failed`;
  return [
    color
      ? failed > 0
        ? palette.yellow(palette.bold(header))
        : palette.green(palette.bold(header))
      : header,
    ...entries.map((entry) => {
      const badge = entry.ok
        ? palette.green(palette.bold("OK"))
        : palette.red(palette.bold("FAILED"));
      return `  ${badge}  ${palette.dim(entry.groupId)}: ${entry.message}`;
    }),
  ].join("\n");
}

/** Concise human-readable label for a spool (vendor, material, name, remaining weight). */
export function spoolSummary(spool: CommonSpool | undefined): string {
  if (!spool) return "";
  const parts = [spool.vendor, spool.material, spool.name].filter(Boolean);
  const weight =
    spool.remainingWeight !== undefined && spool.remainingWeight !== null
      ? `${spool.remainingWeight}g`
      : undefined;
  return [...parts, ...(weight ? [weight] : [])].join(" ");
}

/** Human-readable spool description with its record key for prompts and reports. */
export function describeSpool(spool: CommonSpool | undefined, fallbackKey: string): string {
  const summary = spoolSummary(spool);
  return summary ? `${summary} [${fallbackKey}]` : fallbackKey;
}

/** Parenthesized dimmed spool summary for report lines, or empty string when unavailable. */
export function spoolContext(
  spoolsByKey: ReadonlyMap<string, CommonSpool> | undefined,
  key: string,
  palette: Palette,
): string {
  const summary = spoolSummary(spoolsByKey?.get(key));
  return summary ? palette.dim(` (${summary})`) : "";
}
