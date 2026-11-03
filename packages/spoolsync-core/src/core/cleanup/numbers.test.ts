import { describe, expect, test } from "bun:test";

import {
  normalizeBarcode,
  normalizeDate,
  normalizeHex,
  parseDecimal,
  parseDiameter,
  parsePrice,
  parseTemperature,
  parseWeight,
} from "./numbers";

describe("parseDecimal", () => {
  test("reads either decimal convention and grouped thousands", () => {
    expect(parseDecimal("24,99")).toEqual({ value: 24.99, ambiguous: false });
    expect(parseDecimal("24.99")).toEqual({ value: 24.99, ambiguous: false });
    expect(parseDecimal("1.299,00")).toEqual({ value: 1299, ambiguous: false });
    expect(parseDecimal("1,299.50")).toEqual({ value: 1299.5, ambiguous: false });
    expect(parseDecimal("1 299,00")).toEqual({ value: 1299, ambiguous: false });
    expect(parseDecimal("1.299.000")).toEqual({ value: 1299000, ambiguous: false });
    expect(parseDecimal("-5")).toEqual({ value: -5, ambiguous: false });
    expect(parseDecimal("(12.00)")).toEqual({ value: -12, ambiguous: false });
  });

  test("flags a lone separator followed by three digits, except after a leading zero", () => {
    expect(parseDecimal("1,299")).toEqual({ value: 1299, ambiguous: true });
    expect(parseDecimal("0.750")).toEqual({ value: 0.75, ambiguous: false });
  });

  test("refuses text with no single reading", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("12abc")).toBeNull();
    expect(parseDecimal("1,5.5")).toBeNull();
    expect(parseDecimal("1.2.3")).toBeNull();
  });
});

describe("parsePrice", () => {
  test("strips symbols and codes", () => {
    expect(parsePrice("$24,99")).toEqual({ amount: 24.99, currency: "USD", ambiguous: false });
    expect(parsePrice("24.99 USD")).toEqual({ amount: 24.99, currency: "USD", ambiguous: false });
    expect(parsePrice("€ 1.299,00")).toEqual({ amount: 1299, currency: "EUR", ambiguous: false });
    expect(parsePrice("EUR 12")).toEqual({ amount: 12, currency: "EUR", ambiguous: false });
    expect(parsePrice("19.5")).toEqual({ amount: 19.5, currency: null, ambiguous: false });
  });

  test("rejects other words", () => {
    expect(parsePrice("approx 24")).toBeNull();
    expect(parsePrice("free")).toBeNull();
    expect(parsePrice("")).toBeNull();
  });
});

describe("parseWeight", () => {
  test("converts units to grams", () => {
    expect(parseWeight("250")).toEqual({ grams: 250, unit: null, ambiguous: false });
    expect(parseWeight("250 g")).toEqual({ grams: 250, unit: "g", ambiguous: false });
    expect(parseWeight("1kg")).toEqual({ grams: 1000, unit: "kg", ambiguous: false });
    expect(parseWeight("0,75 kg")).toEqual({ grams: 750, unit: "kg", ambiguous: false });
    expect(parseWeight("1,000 g")).toEqual({ grams: 1000, unit: "g", ambiguous: false });
    expect(parseWeight("2.2 lb")?.grams).toBe(997.9);
    expect(parseWeight("8.8oz")?.grams).toBe(249.5);
  });

  test("refuses unclear or non-weight text", () => {
    expect(parseWeight("1.299 kg")).toBeNull();
    expect(parseWeight("heavy")).toBeNull();
    expect(parseWeight("")).toBeNull();
  });
});

describe("parseDiameter and parseTemperature", () => {
  test("diameter", () => {
    expect(parseDiameter("1,75")).toBe(1.75);
    expect(parseDiameter("1.75mm")).toBe(1.75);
    expect(parseDiameter(" 2.85 mm ")).toBe(2.85);
    expect(parseDiameter("1.7.5")).toBeNull();
    expect(parseDiameter("thin")).toBeNull();
  });

  test("temperature", () => {
    expect(parseTemperature("210")).toEqual({ celsius: 210, converted: false });
    expect(parseTemperature("210°C")).toEqual({ celsius: 210, converted: false });
    expect(parseTemperature("410 F")).toEqual({ celsius: 210, converted: true });
    expect(parseTemperature("hot")).toBeNull();
  });
});

describe("normalizeHex, normalizeDate, normalizeBarcode", () => {
  test("hex", () => {
    expect(normalizeHex("#ff0000")).toEqual({ hex: "FF0000", droppedAlpha: null });
    expect(normalizeHex("f00")).toEqual({ hex: "FF0000", droppedAlpha: null });
    expect(normalizeHex("#ff000080")).toEqual({ hex: "FF0000", droppedAlpha: "80" });
    expect(normalizeHex("#f008")).toEqual({ hex: "FF0000", droppedAlpha: "88" });
    expect(normalizeHex("0xAbCdEf")).toEqual({ hex: "ABCDEF", droppedAlpha: null });
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });

  test("dates", () => {
    expect(normalizeDate("2024/3/5")).toEqual({ date: "2024-03-05", ambiguous: false });
    expect(normalizeDate("2024.03.05")?.date).toBe("2024-03-05");
    expect(normalizeDate("2024-03-05T10:00:00Z")?.date).toBe("2024-03-05");
    expect(normalizeDate("25.03.2024")?.date).toBe("2024-03-25");
    expect(normalizeDate("03/25/2024")?.date).toBe("2024-03-25");
    expect(normalizeDate("03/04/2024")).toBeNull();
    expect(normalizeDate("2024-02-31")).toBeNull();
  });

  test("barcodes", () => {
    expect(normalizeBarcode("4 006381 333931")).toBe("4006381333931");
    expect(normalizeBarcode("4006381333931")).toBe("4006381333931");
    expect(normalizeBarcode("12-34")).toBeNull();
    expect(normalizeBarcode("AB12")).toBeNull();
  });
});
