import { expect, test } from "bun:test";

import { COLOR_FAMILIES, colorFamily } from "./color";

test("names the family of common filament colours", () => {
  const expected: Record<string, string> = {
    "1A1A1A": "Black",
    "000000": "Black",
    FFFFFF: "White",
    F5F5F5: "White",
    "808080": "Gray",
    C0C0C0: "Gray",
    E53935: "Red",
    D62828: "Red",
    F26B21: "Orange",
    D4AF37: "Yellow",
    FFEB3B: "Yellow",
    "22AA55": "Green",
    "1F9E9A": "Teal",
    "2244CC": "Blue",
    "7733AA": "Purple",
    F79FAE: "Pink",
    FF69B4: "Pink",
    "6B4423": "Brown",
  };
  for (const [hex, family] of Object.entries(expected))
    expect([hex, colorFamily(hex)]).toEqual([hex, family]);
});

test("every result is a listed family, even for odd inputs", () => {
  for (const hex of ["010203", "FEFEFE", "FF00FF", "00FFFF", "808000", "123456"])
    expect(COLOR_FAMILIES).toContain(colorFamily(hex));
});
