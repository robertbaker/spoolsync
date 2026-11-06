import { local, read, write } from "../browser/storage/access";
import { en, type Catalogue, type MessageKey } from "./en";
import { formatMessage, numberFormat, type MessageParams } from "./format";

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
 * Catalogues by locale. English is always present; the others start empty and are filled by
 * {@link loadCatalogue}, so a visitor downloads only their own language. Lookups are per key: a key
 * missing from a translation (for example one added to English first, or one not loaded yet) falls
 * back to English instead of showing a blank or a raw key.
 */
export const CATALOGUES: Record<Locale, Readonly<Partial<Catalogue>>> = {
  en,
  de: {},
  es: {},
  fr: {},
  nl: {},
};

const loaded = new Set<Locale>(["en"]);

/** Fills in a locale's catalogue. Also how tests and tools load every language at once. */
export function registerCatalogue(locale: Locale, catalogue: Readonly<Partial<Catalogue>>): void {
  CATALOGUES[locale] = catalogue;
  loaded.add(locale);
}

const loaders: Record<Exclude<Locale, "en">, () => Promise<Readonly<Partial<Catalogue>>>> = {
  de: () => import("./de").then((module) => module.de),
  es: () => import("./es").then((module) => module.es),
  fr: () => import("./fr").then((module) => module.fr),
  nl: () => import("./nl").then((module) => module.nl),
};

const loading = new Map<Locale, Promise<void>>();

/** Whether the locale's messages are available now (English always is). */
export const isCatalogueLoaded = (locale: Locale): boolean => loaded.has(locale);

/**
 * Downloads a locale's catalogue on first use. Resolves once it is registered; a failed download
 * rejects and is forgotten, so a later call tries again. Until then lookups use English.
 */
export function loadCatalogue(locale: Locale): Promise<void> {
  if (loaded.has(locale) || locale === "en") return Promise.resolve();
  let pending = loading.get(locale);
  if (!pending) {
    pending = loaders[locale]().then(
      (catalogue) => {
        loading.delete(locale);
        registerCatalogue(locale, catalogue);
      },
      (error: unknown) => {
        loading.delete(locale);
        throw error;
      },
    );
    loading.set(locale, pending);
  }
  return pending;
}

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
 * tells the page so open panels can redraw. Returns false when the value is not a supported
 * locale.
 */
export function setLocale(locale: string): boolean {
  if (!isLocale(locale)) return false;
  current = locale;
  write(local, LANGUAGE_KEY, locale === "en" ? null : locale);
  applyDocumentLanguage(locale);
  announceLocale(locale);
  return true;
}

/**
 * Tells the page the language changed. When the new language's messages are not downloaded yet the
 * event waits for them (so open panels redraw once, in the new language); if the download fails it
 * still fires and the page stays in English.
 */
function announceLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  const dispatch = () => {
    // A newer choice made while this one was downloading has its own event.
    if (getLocale() === locale)
      document.dispatchEvent(new CustomEvent(LOCALE_CHANGED, { detail: { locale } }));
  };
  if (isCatalogueLoaded(locale)) dispatch();
  else loadCatalogue(locale).then(dispatch, dispatch);
}

/**
 * Looks up and formats a message. Falls back per key to English, and to English formatting if a
 * translation is malformed, so a bad translation can degrade but never break a page.
 */
export function t(
  key: MessageKey,
  params: MessageParams = {},
  locale: Locale = getLocale(),
): string {
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
    announceLocale(locale);
  });
}

// A visitor who chose another language gets its messages before any page script that imports this
// module runs (top-level await holds importers back), so the first render is already translated.
// English, the default, never waits. A failed download leaves the page in English.
if (getLocale() !== "en") await loadCatalogue(getLocale()).catch(() => undefined);
