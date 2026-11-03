import { expect, test } from "bun:test";

import { lowStockRule } from "@spoolsync/core/core/stock";
import { makeSpool } from "@spoolsync/core/core/testing";

import {
  buildLabel,
  labelPreset,
  labelsPerPage,
  parseQrPayload,
  qrPayload,
  selectLabelSpools,
} from "./labels";

const rule = lowStockRule(20);
const full = makeSpool("spoolman", "1", { remainingWeight: 900 });
const low = makeSpool("spoolman", "2", { remainingWeight: 100 });
const lowDuplicate = makeSpool("spoolio", "abc", { remainingWeight: 100 });
const archivedLow = makeSpool("spoolman", "3", { remainingWeight: 10, archived: true });
const all = [full, low, lowDuplicate, archivedLow];

test("the QR payload is only the service and id, and parses back", () => {
  expect(qrPayload(low)).toBe("spoolman:2");
  expect(parseQrPayload("spoolman:2")).toEqual({ source: "spoolman", sourceId: "2" });
  // Ids may themselves contain colons.
  expect(parseQrPayload("tigertag:aa:bb")).toEqual({ source: "tigertag", sourceId: "aa:bb" });
  expect(parseQrPayload("nonsense")).toBeNull();
  expect(parseQrPayload(":x")).toBeNull();
  const payload = qrPayload(makeSpool("spoolman", "9", { comment: "secret", name: "Private" }));
  expect(payload).not.toContain("secret");
  expect(payload).not.toContain("Private");
});

test("selection supports all, the table's view, and running low without archived spools", () => {
  const base = { visible: [low], rule };
  expect(selectLabelSpools(all, { ...base, mode: "all" })).toEqual(all);
  expect(selectLabelSpools(all, { ...base, mode: "filtered" })).toEqual([low]);
  expect(selectLabelSpools(all, { ...base, mode: "low" })).toEqual([low, lowDuplicate]);
});

test("linked records produce one label, keeping the first in loaded order", () => {
  const linked = [{ members: [low, lowDuplicate] }, { members: [full] }];
  expect(selectLabelSpools(all, { mode: "low", visible: [], rule, linked })).toEqual([low]);
  expect(selectLabelSpools(all, { mode: "all", visible: [], rule, linked })).toEqual([
    full,
    low,
    archivedLow,
  ]);
});

test("labels carry swatches, text, weights, and a scannable code", () => {
  const label = buildLabel(
    makeSpool("spoolman", "12", {
      vendor: " Prusament ",
      material: "PETG",
      name: "Orange",
      colors: ["FF8800", "112233", "445566", "778899", "AABBCC"],
      remainingWeight: 320.4,
      initialWeight: 1000,
    }),
  );
  expect(label).toMatchObject({
    brand: "Prusament",
    material: "PETG",
    color: "Orange",
    weight: "320 / 1000 g",
    payload: "spoolman:12",
  });
  expect(label.swatch).toHaveLength(4);
  expect(label.qr?.version).toBe(1);
});

test("missing values get plain placeholders", () => {
  const label = buildLabel(
    makeSpool("spoolio", "x", {
      vendor: null,
      material: null,
      name: null,
      colors: ["00FF00"],
      remainingWeight: null,
      initialWeight: null,
    }),
  );
  expect(label).toMatchObject({
    brand: "Unknown brand",
    material: "Unknown material",
    color: "#00FF00",
    weight: "? / ? g",
  });
  expect(buildLabel(makeSpool("spoolio", "y", { name: null, colors: [] })).color).toBe("No color");
});

test("an id too long for a code still yields a label without one", () => {
  expect(buildLabel(makeSpool("spoolio", "i".repeat(300))).qr).toBeNull();
});

test("presets fall back to standard and sheet counts use the page size", () => {
  expect(labelPreset("small").widthMm).toBe(50);
  expect(labelPreset("bogus").id).toBe("standard");
  expect(labelPreset(null).id).toBe("standard");
  expect(labelsPerPage(labelPreset("standard"), { width: 210, height: 297 })).toBe(2 * 6);
  expect(labelsPerPage(labelPreset("large"), { width: 210, height: 297 })).toBe(1 * 4);
});
