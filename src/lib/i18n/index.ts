import { local, read, write } from "../browser/storage/access";
import { de } from "./de";
import { en, type Catalogue, type MessageKey } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { formatMessage, numberFormat, type MessageParams } from "./format";
import { nl } from "./nl";

export type { MessageKey } from "./en";
export type { MessageParams } from "./format";

export const LOCALES = ["en", "de", "es", "fr", "nl"] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language named in itself, so a visitor can find theirs whatever the page language is. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  nl: "Nederlands",
};

export const LANGUAGE_KEY = "spoolsync:language";
/** Fired on `document` with `{ locale }` after the language changes. */
export const LOCALE_CHANGED = "spoolsync:locale-changed";

/**
 * Catalogues by locale. Lookups are per key: a key missing from a translation (for example one
 * added to English first) falls back to English instead of showing a blank or a raw key.
 */
export const CATALOGUES: Record<Locale, Readonly<Partial<Catalogue>>> = { en, de, es, fr, nl };

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/** Maps a language tag such as `de-AT` or `fr_CA` to a supported locale, or `null`. */
export function resolveLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const base = tag.trim().toLowerCase().split(/[-_]/, 1)[0];
  return isLocale(base) ? base : null;
}

let current: Locale | null = null;

/** The visitor's chosen language; English until they choose another. */
export function getLocale(): Locale {
  if (!current) {
    const stored = read(local, LANGUAGE_KEY);
    current = isLocale(stored) ? stored : "en";
  }
  return current;
}

/** Forgets the cached language so the next read comes from storage (tests, other tabs). */
export function reloadLocale(): Locale {
  current = null;
  return getLocale();
}

/** Keeps `<html lang>` equal to the page language, for screen readers and hyphenation. */
export function applyDocumentLanguage(locale: Locale = getLocale()): void {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

/** Applies the stored language to the document. Safe to call on every page. */
export function initLocale(): Locale {
  const locale = getLocale();
  applyDocumentLanguage(locale);
  return locale;
}

/**
 * Saves the language (English is the default and is stored as nothing), updates `<html lang>`, and
 * tells the page so open panels can redraw. Returns false when the value is not a supported locale.
 */
export function setLocale(locale: string): boolean {
  if (!isLocale(locale)) return false;
  current = locale;
  write(local, LANGUAGE_KEY, locale === "en" ? null : locale);
  applyDocumentLanguage(locale);
  if (typeof document !== "undefined")
    document.dispatchEvent(new CustomEvent(LOCALE_CHANGED, { detail: { locale } }));
  return true;
}

/**
 * Looks up and formats a message. Falls back per key to English, and to English formatting if a
 * translation is malformed, so a bad translation can degrade but never break a page.
 */
export function t(key: MessageKey, params: MessageParams = {}, locale: Locale = getLocale()): string {
  const source = en[key];
  const template = CATALOGUES[locale][key] ?? source;
  try {
    return formatMessage(template, params, locale);
  } catch {
    return formatMessage(source, params, "en");
  }
}

/** A number in the page language's conventions (`1,234.5` or `1.234,5`). */
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
  locale: Locale = getLocale(),
): string {
  return numberFormat(locale, options).format(value);
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** A date in the page language's conventions; an invalid date gives an empty string. */
export function formatDate(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  locale: Locale = getLocale(),
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format.format(date);
}

/** Keeps several tabs on the same language: another tab saving the setting updates this one. */
let watching = false;

export function watchLanguageChanges(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== LANGUAGE_KEY && event.key !== null) return;
    const locale = reloadLocale();
    applyDocumentLanguage(locale);
    document.dispatchEvent(new CustomEvent(LOCALE_CHANGED, { detail: { locale } }));
  });
}
