import { expect, test } from "bun:test";

import { sanitizeFilament } from "./cache";
import { GENERIC_MAPPING } from "./mapping";
import { normalizeReferenceRecord } from "./normalize";

const context = {
  providerId: "file",
  providerLabel: "Reference file",
  attribution: "Test",
  license: null,
};
const weightOf = (cell: unknown, key = "net_weight") =>
  normalizeReferenceRecord(
    { vendor: "Acme", material: "PLA", [key]: cell },
    GENERIC_MAPPING,
    context,
  ).filament?.[key === "net_weight" ? "initialWeight" : "emptySpoolWeight"];

test("a bare kilogram value in a text cell is not rounded before it is converted", () => {
  expect(weightOf("0.75")).toBe(750);
  expect(weightOf("2.25")).toBe(2250);
  expect(weightOf("0.25", "empty_spool_weight")).toBe(250);
  expect(weightOf(0.75)).toBe(750);
});

test("weights in grams and with units read as before", () => {
  expect(weightOf("1000")).toBe(1000);
  expect(weightOf("750 g")).toBe(750);
  expect(weightOf("1 kg")).toBe(1000);
});

const stored = (overrides: Record<string, unknown>) =>
  sanitizeFilament({ id: "r1", providerId: "file", vendor: "Acme", ...overrides })!;

test("a stored record outside the limits loses those values", () => {
  expect(
    stored({
      nozzleTempMin: 9999,
      bedTempMax: -5,
      initialWeight: -5,
      emptySpoolWeight: 90_000,
      density: 1e6,
      diameter: 0,
      price: -1,
      dryingTemp: 500,
      dryingHours: 1000,
    }),
  ).toMatchObject({
    nozzleTempMin: null,
    bedTempMax: null,
    initialWeight: null,
    emptySpoolWeight: null,
    density: null,
    diameter: null,
    price: null,
    dryingTemp: null,
    dryingHours: null,
  });
});

test("a stored record within the limits is kept", () => {
  expect(
    stored({
      nozzleTempMin: 190,
      nozzleTempMax: 220,
      bedTempMin: 0,
      initialWeight: 1000,
      emptySpoolWeight: 200,
      density: 1.24,
      diameter: 1.75,
      price: 0,
    }),
  ).toMatchObject({
    nozzleTempMin: 190,
    nozzleTempMax: 220,
    bedTempMin: 0,
    initialWeight: 1000,
    emptySpoolWeight: 200,
    density: 1.24,
    diameter: 1.75,
    price: 0,
  });
});
