import { expect, test } from "bun:test";

import { applyResults, formatProgress, textTable } from "./presentation";

const stripAnsi = (text: string) => Bun.stripANSI(text);

test("textTable preserves column alignment when color is enabled", () => {
  const plain = textTable(
    ["Source", "Spools", "Updates"],
    [
      ["spoolman", "12", "3"],
      ["Total", "12", "3"],
    ],
    [1, 2],
    false,
  );
  const colored = textTable(
    ["Source", "Spools", "Updates"],
    [
      ["spoolman", "12", "3"],
      ["Total", "12", "3"],
    ],
    [1, 2],
    true,
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
