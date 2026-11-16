import { expect, test } from "bun:test";

import {
  MAX_TARE_GRAMS,
  NO_BRAND_KEY,
  brandKey,
  knownTare,
  parseScaleInput,
  resolveTare,
  sanitizeTares,
  weighIn,
} from "./weigh-in";

test("brand names compare without case, spacing, punctuation or accents", () => {
  expect(brandKey("Bambu Lab")).toBe("bambulab");
  expect(brandKey(" bambu-lab ")).toBe("bambulab");
  expect(brandKey("Prúsament")).toBe("prusament");
  expect(brandKey(null)).toBe("");
});

test("finds a typical tare for a known brand, including lines that start with its name", () => {
  expect(knownTare("Bambu Lab")?.grams).toBe(250);
  expect(knownTare("polymaker")?.brand).toBe("Polymaker");
  expect(knownTare("Polymaker PolyTerra")?.brand).toBe("Polymaker");
  expect(knownTare("Unknown Filaments")).toBeNull();
  expect(knownTare("")).toBeNull();
  expect(knownTare(undefined)).toBeNull();
});

test("a saved value beats the recorded empty weight, which beats the brand table", () => {
  const saved = { bambulab: 255 };
  expect(resolveTare({ vendor: "Bambu Lab", recorded: 240, saved })).toMatchObject({
    grams: 255,
    origin: "custom",
  });
  expect(resolveTare({ vendor: "Bambu Lab", recorded: 240, saved: {} })).toMatchObject({
    grams: 240,
    origin: "spool",
  });
  expect(resolveTare({ vendor: "Bambu Lab", recorded: null, saved: {} })).toMatchObject({
    grams: 250,
    origin: "brand",
  });
  expect(
    resolveTare({ vendor: "Bambu Lab", recorded: null, saved: { bambulab: MAX_TARE_GRAMS + 1 } }),
  ).toMatchObject({ grams: 250, origin: "brand" });
  expect(resolveTare({ vendor: "Nobody", recorded: 0, saved: {} })).toBeNull();
  // Spools with no brand share one saved value.
  expect(resolveTare({ vendor: null, recorded: null, saved: { [NO_BRAND_KEY]: 180 } })?.grams).toBe(
    180,
  );
});

test("reads typed weights in the display unit and refuses nonsense", () => {
  expect(parseScaleInput("1210", "g")).toBe(1210);
  expect(parseScaleInput("1210,5", "g")).toBe(1210.5);
  expect(parseScaleInput("  ", "g")).toBeNull();
  expect(parseScaleInput("abc", "g")).toBe("invalid");
  expect(parseScaleInput("-5", "g")).toBe("invalid");
  expect(parseScaleInput("999999", "g")).toBe("invalid");
  expect(parseScaleInput("10", "oz")).toBe(283.5);
});

test("subtracts the tare and reports remaining grams, percent and the change from the record", () => {
  const result = weighIn({ gross: 1000, tare: 250, initial: 1000, current: 800 });
  expect(result).toEqual({ ok: true, remaining: 750, percent: 75, delta: -50, overFull: false });
  expect(weighIn({ gross: 250, tare: 250, initial: 1000, current: null })).toMatchObject({
    ok: true,
    remaining: 0,
    percent: 0,
    delta: null,
  });
  expect(weighIn({ gross: 1400, tare: 200, initial: 1000, current: null })).toMatchObject({
    ok: true,
    overFull: true,
  });
  expect(weighIn({ gross: 900, tare: 200, initial: null, current: null })).toMatchObject({
    ok: true,
    percent: null,
  });
});

test("explains missing or impossible readings instead of returning a number", () => {
  expect(weighIn({ gross: null, tare: 200, initial: 1000, current: null })).toMatchObject({
    ok: false,
  });
  expect(weighIn({ gross: 900, tare: null, initial: 1000, current: null })).toMatchObject({
    ok: false,
  });
  const below = weighIn({ gross: 100, tare: 200, initial: 1000, current: null });
  expect(below.ok).toBe(false);
  expect(!below.ok && below.error).toContain("lower than the empty spool");
});

test("sanitizing keeps only valid brand keys", () => {
  expect(
    sanitizeTares({
      tares: { bambulab: 250, "Bad Key": 100, hatchbox: -3, esun: "x", sunlu: 99999 },
    }),
  ).toEqual({ bambulab: 250 });
  expect(sanitizeTares(null)).toEqual({});
  expect(sanitizeTares([1, 2])).toEqual({});
  expect(sanitizeTares({ tiny: 0.04, visible: 0.05 })).toEqual({ visible: 0.1 });
});
