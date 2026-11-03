import { expect, test } from "bun:test";

import { bulkEditFromForm, bulkEditResult, type BulkEditFormValues } from "./bulk-edit-form";

const empty: BulkEditFormValues = {
  location: "",
  clearLocation: false,
  note: "",
  clearNote: false,
  tag: "",
};

test("blank boxes leave fields alone and clear boxes write null", () => {
  expect(bulkEditFromForm({ ...empty, location: " Shelf 2 ", tag: "#dry box" })).toEqual({
    patch: { location: "Shelf 2", tag: "dry-box" },
  });
  expect(bulkEditFromForm({ ...empty, clearLocation: true, clearNote: true })).toEqual({
    patch: { location: null, note: null },
  });
});

test("an empty form, conflicting boxes and oversized text are refused with a reason", () => {
  expect(bulkEditFromForm(empty)).toHaveProperty("error");
  expect(bulkEditFromForm({ ...empty, location: "A", clearLocation: true })).toHaveProperty(
    "error",
  );
  expect(bulkEditFromForm({ ...empty, note: "A", clearNote: true })).toHaveProperty("error");
  expect(bulkEditFromForm({ ...empty, note: "x".repeat(2001) })).toHaveProperty("error");
  expect(bulkEditFromForm({ ...empty, tag: "###" })).toHaveProperty("error");
});

test("result messages cover no selection, no change and a count", () => {
  expect(bulkEditResult(0, 0)).toContain("Select at least one");
  expect(bulkEditResult(0, 3)).toContain("Nothing changed");
  expect(bulkEditResult(1, 1)).toBe("Bulk edit added to 1 spool.");
  expect(bulkEditResult(4, 4)).toBe("Bulk edit added to 4 spools.");
});
