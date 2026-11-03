import { beforeEach, expect, test } from "bun:test";

import { makeSpool } from "@spoolsync/core/core/testing";
import type { ReorderItem } from "@spoolsync/core/workflow";

import {
  MAX_SHOP_TEMPLATE,
  SHOP_TEMPLATE_KEY,
  expandShopTemplate,
  groupByBrand,
  itemLabel,
  reorderCsv,
  readShopTemplate,
  reorderFilename,
  saveShopTemplate,
  shopSearchUrl,
  spoolSearchUrl,
  validateShopTemplate,
} from "./reorder-list";

beforeEach(() => localStorage.clear());

const item = (
  id: string,
  overrides: Parameters<typeof makeSpool>[2],
  fraction: number | null = 0.1,
): ReorderItem => ({ spool: makeSpool("spoolman", id, overrides), fraction });

test("shop links encode every part and never let a name change the query", () => {
  const url = new URL(shopSearchUrl("Fiberlogy", "PLA", "Red & Blue #1 \"x\"")!);
  expect(url.origin + url.pathname).toBe("https://www.google.com/search");
  expect(url.searchParams.get("tbm")).toBe("shop");
  expect(url.searchParams.get("q")).toBe('Fiberlogy PLA Red & Blue #1 "x"');
  expect([...url.searchParams.keys()]).toEqual(["tbm", "q"]);
  expect(url.hash).toBe("");

  expect(new URL(shopSearchUrl("Ünïcode 黒", "PETG")!).searchParams.get("q")).toBe("Ünïcode 黒 PETG");
  // Whitespace is collapsed, empty parts are dropped, and a lone brand gets a "filament" hint.
  expect(new URL(shopSearchUrl("  Prusa\n Research ", null, "")!).searchParams.get("q")).toBe(
    "Prusa Research filament",
  );
  expect(shopSearchUrl("", null, "  ")).toBeNull();
  expect(shopSearchUrl(null)).toBeNull();
});

test("a spool searches by brand, material and color name", () => {
  const spool = makeSpool("spoolman", "1", { vendor: "Prusament", material: "PLA", name: "Galaxy Black" });
  expect(new URL(spoolSearchUrl(spool)!).searchParams.get("q")).toBe("Prusament PLA Galaxy Black");
  expect(spoolSearchUrl(makeSpool("spoolman", "2", { vendor: null, material: null, name: null }))).toBeNull();
});

test("brands are grouped ignoring case, sorted, with spools lacking a brand last", () => {
  const groups = groupByBrand([
    item("1", { vendor: "Prusament" }, 0.05),
    item("2", { vendor: null }),
    item("3", { vendor: "esun" }),
    item("4", { vendor: " ESUN " }),
    item("5", { vendor: "Prusament" }, 0.15),
    item("6", { vendor: "   " }),
  ]);
  expect(groups.map((g) => [g.brand, g.items.map((i) => i.spool.sourceId)])).toEqual([
    ["esun", ["3", "4"]],
    ["Prusament", ["1", "5"]],
    ["No brand", ["2", "6"]],
  ]);
  expect(new URL(groups[0]!.searchUrl!).searchParams.get("q")).toBe("esun filament");
  expect(groups[2]!.searchUrl).toBeNull();
  expect(groupByBrand([])).toEqual([]);
});

test("labels fall back to the id", () => {
  expect(itemLabel(makeSpool("spoolman", "7", { material: "PLA", name: "Red" }))).toBe("PLA Red");
  expect(itemLabel(makeSpool("spoolman", "7", { material: null, name: null }))).toBe("7");
});

test("the CSV quotes cells, keeps blanks blank, and defuses spreadsheet formulas", () => {
  const groups = groupByBrand([
    item("1", {
      vendor: "=HYPERLINK(\"http://evil\")",
      material: "+SUM(1)",
      name: 'Say "hi", friend',
      location: "@shelf\nA",
      colors: ["FF0000", "00FF00"],
      remainingWeight: 49.6,
      initialWeight: 1000,
    }, 0.0496),
    item("2", { vendor: null, material: null, name: null, colors: [], remainingWeight: null, initialWeight: null, location: null }, null),
  ]);
  const csv = reorderCsv(groups);
  const lines = csv.split("\r\n");
  expect(lines[0]).toBe(
    "brand,material,name,color,service,id,remaining_g,full_g,percent_left,location,search_url",
  );
  expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  expect(csv).toContain("'+SUM(1)");
  expect(csv).toContain('"Say ""hi"", friend"');
  expect(csv).toContain('"\'@shelf\nA"');
  expect(csv).toContain("#FF0000 #00FF00,Spoolman,1,50,1000,5,");
  // A spool with nothing known still has a row, with empty cells.
  expect(csv).toContain(",,,,Spoolman,2,,,,,\r\n");
  expect(csv.endsWith("\r\n")).toBe(true);
  // No cell starts with a formula character.
  for (const line of lines.slice(1)) expect(line).not.toMatch(/(^|,)[=+@]/);
});

test("an empty list is just the header, and the filename carries the date", () => {
  expect(reorderCsv([])).toBe(
    "brand,material,name,color,service,id,remaining_g,full_g,percent_left,location,search_url\r\n",
  );
  expect(reorderFilename(new Date("2026-11-03T23:59:00Z"))).toBe("spoolsync-reorder-2026-11-03.csv");
});

test("a shop template needs https, known placeholders, and none in the host name", () => {
  const ok = validateShopTemplate("  https://shop.example/search?q={brand}+{material}+{color}  ");
  expect(ok).toEqual({ ok: true, template: "https://shop.example/search?q={brand}+{material}+{color}" });
  for (const bad of [
    "",
    "http://shop.example/?q={brand}",
    "javascript:alert({brand})",
    "https://shop.example/search",
    "https://shop.example/?q={size}",
    "https://{brand}.example/",
    "https://shop.example/{brand",
    "https://user:pw@shop.example/?q={brand}",
    "https://shop.example/?q={brand}#{",
    `https://shop.example/?q={brand}${"x".repeat(MAX_SHOP_TEMPLATE)}`,
  ])
    expect(validateShopTemplate(bad).ok).toBe(false);
});

test("template links encode each part so a name cannot change the address", () => {
  const template = "https://shop.example/find/{brand}?material={material}&c={color}";
  const url = new URL(
    expandShopTemplate(template, { brand: "A&B /x", material: "PLA+", color: "Red #1" })!,
  );
  expect(url.origin).toBe("https://shop.example");
  expect(url.pathname).toBe("/find/A%26B%20%2Fx");
  expect(url.searchParams.get("material")).toBe("PLA+");
  expect(url.searchParams.get("c")).toBe("Red #1");
  expect(url.hash).toBe("");
  expect(expandShopTemplate("http://nope/{brand}", { brand: "x", material: "", color: "" })).toBeNull();
});

test("spool, brand and CSV links use the template, and a bad one falls back to web search", () => {
  const template = "https://shop.example/s?q={brand}%20{material}%20{color}";
  const spool = makeSpool("spoolman", "1", { vendor: "Prusament", material: "PLA", name: "Black" });
  expect(spoolSearchUrl(spool, template)).toBe("https://shop.example/s?q=Prusament%20PLA%20Black");
  expect(spoolSearchUrl(spool, "https://shop.example/no-placeholders")).toContain("google.com");
  const groups = groupByBrand([{ spool, fraction: 0.1 }], template);
  expect(groups[0]!.searchUrl).toBe("https://shop.example/s?q=Prusament%20filament%20");
  expect(reorderCsv(groups, template)).toContain("https://shop.example/s?q=Prusament%20PLA%20Black");
});

test("the saved template is validated on the way in and on the way out", () => {
  expect(readShopTemplate()).toBeNull();
  expect(saveShopTemplate("https://shop.example/s?q={brand}")).toBe(true);
  expect(readShopTemplate()).toBe("https://shop.example/s?q={brand}");
  expect(saveShopTemplate("http://insecure/{brand}")).toBe(false);
  localStorage.setItem(SHOP_TEMPLATE_KEY, "javascript:alert({brand})");
  expect(readShopTemplate()).toBeNull();
  expect(saveShopTemplate(null)).toBe(true);
  expect(localStorage.getItem(SHOP_TEMPLATE_KEY)).toBeNull();
});
