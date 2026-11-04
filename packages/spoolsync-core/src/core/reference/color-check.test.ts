import { describe, expect, test } from "bun:test";

import { deltaE2000, deltaE2000Lab, hexToLab } from "../color";
import {
  DELTA_E_CLOSE,
  DELTA_E_MATCH,
  classifyDeltaE,
  compareColorLists,
  familiesInName,
  nameHexPlausibility,
} from "./color-check";

type Lab = [number, number, number];

/** Pairs from Table 1 of Sharma, Wu and Dalal, "The CIEDE2000 Color-Difference Formula" (2005). */
const SHARMA: Array<[Lab, Lab, number]> = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
  [[50, -1.1848, -84.8006], [50, 0, -82.7485], 1.0],
  [[50, -0.9009, -85.5211], [50, 0, -82.7485], 1.0],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, -1, 2], [50, 0, 0], 2.3669],
  [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
  [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
  [[50, -0.001, 2.49], [50, 0.0009, -2.49], 4.8045],
  [[50, -0.001, 2.49], [50, 0.0011, -2.49], 4.7461],
  [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[50, 2.5, 0], [61, -5, 29], 22.8977],
  [[50, 2.5, 0], [56, -27, -3], 31.903],
  [[50, 2.5, 0], [58, 24, 15], 19.4535],
  [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
  [[61.2901, 3.7196, -5.3901], [61.4292, 2.248, -4.962], 1.8731],
  [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
  [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  [[36.4612, 47.858, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
  [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
  [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];

describe("CIEDE2000", () => {
  test.each(SHARMA.map((row, index) => [index + 1, ...row] as const))(
    "Sharma test pair %i",
    (_, a, b, expected) => {
      expect(deltaE2000Lab(a, b)).toBeCloseTo(expected, 4);
    },
  );

  test("is symmetric and zero for the same color", () => {
    for (const [a, b] of [
      ["FF0000", "00FF00"],
      ["1A1A1A", "F5F5F5"],
      ["336699", "336698"],
    ] as const)
      expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 10);
    expect(deltaE2000("AABBCC", "AABBCC")).toBe(0);
  });

  test("converts sRGB to the D65 white and black points", () => {
    const [lightness, a, b] = hexToLab("FFFFFF");
    expect(lightness).toBeCloseTo(100, 1);
    expect(Math.abs(a)).toBeLessThan(0.1);
    expect(Math.abs(b)).toBeLessThan(0.2);
    expect(hexToLab("000000")[0]).toBeCloseTo(0, 5);
    expect(deltaE2000("000000", "FFFFFF")).toBeGreaterThan(99);
  });
});

describe("thresholds", () => {
  test("match up to 2.3, close up to 5, mismatch above", () => {
    expect(DELTA_E_MATCH).toBe(2.3);
    expect(DELTA_E_CLOSE).toBe(5);
    expect(classifyDeltaE(0)).toBe("match");
    expect(classifyDeltaE(2.3)).toBe("match");
    expect(classifyDeltaE(2.31)).toBe("close");
    expect(classifyDeltaE(5)).toBe("close");
    expect(classifyDeltaE(5.01)).toBe("mismatch");
    expect(classifyDeltaE(Number.NaN)).toBe("mismatch");
  });
});

describe("compareColorLists", () => {
  test("compares one color against one", () => {
    const same = compareColorLists(["1A1A1A"], ["1b1b1b"]);
    expect(same?.verdict).toBe("match");
    expect(same?.countDiffers).toBe(false);
    expect(compareColorLists(["FF0000"], ["00FF00"])?.verdict).toBe("mismatch");
  });

  test("uses the worst pair for several colors", () => {
    const result = compareColorLists(["FF0000", "0000FF"], ["FF0000", "00FF00"]);
    expect(result?.verdict).toBe("mismatch");
    expect(result?.spoolHex).toBe("0000FF");
    expect(result?.referenceHex).toBe("00FF00");
  });

  test("a different number of colors is always a mismatch", () => {
    const result = compareColorLists(["FF0000", "0000FF"], ["FF0000"]);
    expect(result).toMatchObject({ verdict: "mismatch", countDiffers: true });
  });

  test("returns null when a side has no usable color", () => {
    expect(compareColorLists([], ["FF0000"])).toBeNull();
    expect(compareColorLists(["FF0000"], ["nothex"])).toBeNull();
  });
});

describe("name and hex plausibility", () => {
  test("reads the color families a name points to", () => {
    expect(familiesInName("Galaxy Black")).toEqual(["Black"]);
    expect(familiesInName("Sky Blue / Grey")).toEqual(["Blue", "Gray"]);
    expect(familiesInName("Natural")).toEqual([]);
  });

  test("flags a name that cannot be that hex", () => {
    expect(nameHexPlausibility("Red", "E53935")?.state).toBe("plausible");
    expect(nameHexPlausibility("Red", "2244CC")).toMatchObject({
      state: "implausible",
      nameFamilies: ["Red"],
      hexFamily: "Blue",
    });
  });

  test("tolerates neighbouring families and modifiers", () => {
    expect(nameHexPlausibility("Sky Blue", "87CEEB")?.state).toBe("plausible");
    expect(nameHexPlausibility("Gold", "D4AF37")?.state).toBe("plausible");
    expect(nameHexPlausibility("Silver", "C0C0C0")?.state).toBe("plausible");
  });

  test("names without a color word, or a neutral one, are unknown", () => {
    expect(nameHexPlausibility("Rainbow Galaxy", "FF0000")?.state).toBe("unknown");
    expect(nameHexPlausibility("Natural", "F5F5F5")?.state).toBe("unknown");
    expect(nameHexPlausibility(null, "F5F5F5")?.state).toBe("unknown");
  });

  test("returns null without a usable hex", () => {
    expect(nameHexPlausibility("Red", undefined)).toBeNull();
    expect(nameHexPlausibility("Red", "zzz")).toBeNull();
  });
});
