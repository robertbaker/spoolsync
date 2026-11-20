import { expect, test } from "bun:test";

import { createPalette, applyResults, formatProgress, textTable } from "./presentation";

const stripAnsi = (text: string) => Bun.stripANSI(text);

test("textTable preserves column alignment when color is enabled", () => {
  const plain = textTable(
    ["Source", "Spools", "Updates", "Target"],
    [
      ["spoolman", "12", "3", "Read only"],
      ["Total", "12", "3", ""],
    ],
    [1, 2],
    false,
  );
  const palette = createPalette(true);
  const colored = textTable(
    ["Source", "Spools", "Updates", "Target"],
    [
      ["spoolman", "12", "3", "Read only"],
      ["Total", "12", "3", ""],
    ],
    [1, 2],
    true,
    (cell, _rowIndex, colIndex, rawCell) => {
      if (colIndex === 2 && Number(rawCell) > 0) return palette.cyan(cell);
      if (colIndex === 3 && rawCell === "Read only") return palette.dim(cell);
      return cell;
    },
  );
  expect(colored).not.toBe(plain);
  expect(stripAnsi(colored)).toBe(plain);
});

test("formatProgress renders a bounded progress bar and percentage", () => {
  expect(formatProgress(0, 10, 10)).toBe("░░░░░░░░░░ 0/10 (0%)");
  expect(formatProgress(5, 10, 10)).toBe("█████░░░░░ 5/10 (50%)");
  expect(formatProgress(10, 10, 10)).toBe("██████████ 10/10 (100%)");
  expect(formatProgress(0, 0)).toBe("");
});

test("applyResults formats colored badges while preserving plain text content", () => {
  const entries = [
    { groupId: "g1", ok: true, message: "Updated spool" },
    { groupId: "g2", ok: false, message: "Request failed" },
  ];
  const plain = applyResults(entries, false);
  const colored = applyResults(entries, true);
  expect(colored).not.toBe(plain);
  expect(stripAnsi(colored)).toBe(plain);
});
