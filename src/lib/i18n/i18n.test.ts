import { beforeEach, expect, test } from "bun:test";

import { en } from "./en";
import { formatMessage, placeholderNames } from "./format";
import {
  CATALOGUES,
  LANGUAGE_KEY,
  LOCALES,
  LOCALE_CHANGED,
  formatDate,
  formatNumber,
  getLocale,
  reloadLocale,
  resolveLocale,
  setLocale,
  t,
} from "./index";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = "";
  reloadLocale();
});

const englishKeys = Object.keys(en).sort();

test("every catalogue has exactly the English keys", () => {
  for (const locale of LOCALES) {
    expect(Object.keys(CATALOGUES[locale]).sort()).toEqual(englishKeys);
  }
});

test("no catalogue entry is empty", () => {
  for (const locale of LOCALES)
    for (const [key, value] of Object.entries(CATALOGUES[locale]))
      expect(`${locale}:${key}:${(value ?? "").trim().length > 0}`).toBe(`${locale}:${key}:true`);
});

test("every message parses and uses the same placeholders as English", () => {
  for (const locale of LOCALES)
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      const message = CATALOGUES[locale][key]!;
      expect(`${locale}:${key}:${placeholderNames(message).join(",")}`).toBe(
        `${locale}:${key}:${placeholderNames(en[key]).join(",")}`,
      );
    }
});

test("every message formats without leaving a placeholder behind", () => {
  const params = {
    count: 3,
    current: 1,
    total: 4,
    rows: 2,
    columns: 5,
    points: 4,
    loaded: 2,
    records: 2,
    spools: 3,
    proposals: 5,
  };
  for (const locale of LOCALES)
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      const names = placeholderNames(CATALOGUES[locale][key]!);
      const given = Object.fromEntries(
        names.map((name) => [name, (params as Record<string, number>)[name] ?? "x"]),
      );
      expect(t(key, given, locale)).not.toMatch(/[{}]/);
    }
});

test("plural categories follow each language's rules", () => {
  const spools = "{count, plural, =0 {no spools} one {# spool} other {# spools}}";
  expect(formatMessage(spools, { count: 0 }, "en")).toBe("no spools");
  expect(formatMessage(spools, { count: 1 }, "en")).toBe("1 spool");
  expect(formatMessage(spools, { count: 2 }, "en")).toBe("2 spools");
  // French treats 0 and 1 as singular; German and English only 1.
  const french = "{count, plural, one {# bobine} other {# bobines}}";
  expect(formatMessage(french, { count: 0 }, "fr")).toBe("0 bobine");
  expect(formatMessage(french, { count: 2 }, "fr")).toBe("2 bobines");
  expect(formatMessage(french, { count: 0 }, "de")).toBe("0 bobines");
});

test("numbers inside plurals and placeholders use the locale's separators", () => {
  const message = "{count, plural, one {# spool} other {# spools}}";
  expect(formatMessage(message, { count: 1234 }, "en")).toBe("1,234 spools");
  expect(formatMessage(message, { count: 1234 }, "de")).toBe("1.234 spools");
  expect(formatMessage("{n} g", { n: 1234.5 }, "en")).toBe("1,234.5 g");
  expect(formatMessage("{n} g", { n: 1234.5 }, "de")).toBe("1.234,5 g");
  expect(formatMessage("{name}", { name: "1234" }, "de")).toBe("1234");
});

test("malformed messages throw and a missing parameter stays visible", () => {
  expect(() => formatMessage("{count, plural, one {# a}}", { count: 1 }, "en")).toThrow();
  expect(() => formatMessage("oops {", {}, "en")).toThrow();
  expect(() => formatMessage("oops }", {}, "en")).toThrow();
  expect(() => formatMessage("{n, select, a {b} other {c}}", { n: 1 }, "en")).toThrow();
  expect(formatMessage("Hello {name}", {}, "en")).toBe("Hello {name}");
});

test("English is the default and Intl formatting follows the locale", () => {
  expect(getLocale()).toBe("en");
  expect(t("stepper.load.count", { count: 1 })).toBe("1 inventory loaded");
  expect(t("stepper.load.count", { count: 3 })).toBe("3 inventories loaded");
  expect(formatNumber(1234.5, {}, "de")).toBe("1.234,5");
  expect(formatNumber(1234.5, {}, "en")).toBe("1,234.5");
  expect(formatDate("2026-03-04T12:00:00Z", { dateStyle: "long", timeZone: "UTC" }, "en")).toBe(
    "March 4, 2026",
  );
  expect(formatDate("2026-03-04T12:00:00Z", { dateStyle: "long", timeZone: "UTC" }, "de")).toBe(
    "4. März 2026",
  );
  expect(formatDate("not a date")).toBe("");
});

test("choosing a language is stored, updates <html lang>, and announces the change", () => {
  const seen: string[] = [];
  document.addEventListener(LOCALE_CHANGED, (event) =>
    seen.push((event as CustomEvent<{ locale: string }>).detail.locale),
  );
  expect(setLocale("de")).toBe(true);
  expect(localStorage.getItem(LANGUAGE_KEY)).toBe("de");
  expect(document.documentElement.lang).toBe("de");
  expect(t("wizard.back")).toBe("Zurück");
  expect(reloadLocale()).toBe("de");
  expect(setLocale("en")).toBe(true);
  expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
  expect(document.documentElement.lang).toBe("en");
  expect(seen).toEqual(["de", "en"]);
});

test("an unsupported or damaged stored language falls back to English", () => {
  expect(setLocale("tlh")).toBe(false);
  localStorage.setItem(LANGUAGE_KEY, "klingon");
  expect(reloadLocale()).toBe("en");
});

test("a key missing from a translation falls back to English, per key", () => {
  const original = CATALOGUES.fr["wizard.back"];
  const catalogue = CATALOGUES.fr as unknown as Record<string, string | undefined>;
  delete catalogue["wizard.back"];
  try {
    expect(t("wizard.back", {}, "fr")).toBe("Back");
    expect(t("wizard.next", {}, "fr")).toBe("Suivant");
  } finally {
    catalogue["wizard.back"] = original;
  }
});

test("a malformed translation degrades to English instead of throwing", () => {
  const catalogue = CATALOGUES.nl as unknown as Record<string, string | undefined>;
  const original = catalogue["palette.go"];
  catalogue["palette.go"] = "Ga naar {page";
  try {
    expect(t("palette.go", { page: "Load" }, "nl")).toBe("Go to Load");
  } finally {
    catalogue["palette.go"] = original;
  }
});

test("language tags resolve to the supported base language", () => {
  expect(resolveLocale("de-AT")).toBe("de");
  expect(resolveLocale("FR_ca")).toBe("fr");
  expect(resolveLocale("pt-BR")).toBeNull();
  expect(resolveLocale(null)).toBeNull();
});

// A separate copy of the module starts like a page does: only English is loaded.
const freshModule = async () =>
  (await import(`./index.ts?fresh=${Math.random()}`)) as typeof import("./index");

test("a language other than English is downloaded on first use, and lookups fall back until then", async () => {
  const fresh = await freshModule();
  expect(fresh.isCatalogueLoaded("en")).toBe(true);
  expect(fresh.isCatalogueLoaded("de")).toBe(false);
  expect(fresh.t("lang.label", {}, "de")).toBe("Language");
  await fresh.loadCatalogue("de");
  expect(fresh.isCatalogueLoaded("de")).toBe(true);
  expect(fresh.t("lang.label", {}, "de")).toBe("Sprache");
  // Asking again is free.
  await fresh.loadCatalogue("de");
});

test("choosing a language announces it once its messages are in", async () => {
  const fresh = await freshModule();
  const seen: string[] = [];
  const listener = (event: Event) => seen.push((event as CustomEvent).detail.locale);
  document.addEventListener(fresh.LOCALE_CHANGED, listener);
  try {
    expect(fresh.setLocale("es")).toBe(true);
    expect(seen).toEqual([]);
    expect(document.documentElement.lang).toBe("es");
    await fresh.loadCatalogue("es");
    await Promise.resolve();
    expect(seen).toEqual(["es"]);
    expect(fresh.t("lang.label")).toBe(CATALOGUES.es["lang.label"]!);
  } finally {
    document.removeEventListener(fresh.LOCALE_CHANGED, listener);
  }
});

test("a language chosen while another was still downloading wins", async () => {
  const fresh = await freshModule();
  const seen: string[] = [];
  const listener = (event: Event) => seen.push((event as CustomEvent).detail.locale);
  document.addEventListener(fresh.LOCALE_CHANGED, listener);
  try {
    fresh.setLocale("nl");
    fresh.setLocale("fr");
    await Promise.all([fresh.loadCatalogue("nl"), fresh.loadCatalogue("fr")]);
    await Promise.resolve();
    expect(seen).toEqual(["fr"]);
  } finally {
    document.removeEventListener(fresh.LOCALE_CHANGED, listener);
  }
});
