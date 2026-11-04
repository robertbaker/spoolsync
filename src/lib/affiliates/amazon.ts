import type { AffiliateProgram, BuyQuery } from "./types";

/** The Amazon stores the SpoolSync tracking id works in. */
export const AMAZON_STORES = [
  { id: "com", host: "www.amazon.com" },
  { id: "ca", host: "www.amazon.ca" },
  { id: "co.uk", host: "www.amazon.co.uk" },
  { id: "de", host: "www.amazon.de" },
  { id: "fr", host: "www.amazon.fr" },
  { id: "it", host: "www.amazon.it" },
  { id: "es", host: "www.amazon.es" },
  { id: "nl", host: "www.amazon.nl" },
  { id: "pl", host: "www.amazon.pl" },
  { id: "se", host: "www.amazon.se" },
] as const;
export type AmazonStoreId = (typeof AMAZON_STORES)[number]["id"];

/** SpoolSync's Amazon Associates tracking id. */
export const AMAZON_TAG = "spoolsync-20";

/** Which store a visitor's country points to; a country without a store of its own uses a near one. */
const BY_REGION: Record<string, AmazonStoreId> = {
  US: "com",
  CA: "ca",
  GB: "co.uk",
  IE: "co.uk",
  DE: "de",
  AT: "de",
  FR: "fr",
  IT: "it",
  ES: "es",
  NL: "nl",
  PL: "pl",
  SE: "se",
};
/** The store for a language alone, used when the browser's language names no country. */
const BY_LANGUAGE: Record<string, AmazonStoreId> = {
  en: "com",
  de: "de",
  fr: "fr",
  it: "it",
  es: "es",
  nl: "nl",
  pl: "pl",
  sv: "se",
};

/**
 * The store that suits the browser's languages, in order of preference (`navigator.languages`): the
 * country in the first tag that has one SpoolSync knows, else its language, else amazon.com.
 */
export function detectAmazonStore(languages: readonly string[]): AmazonStoreId {
  for (const tag of languages) {
    const [language = "", ...rest] = tag.split(/[-_]/);
    const region = rest.find((part) => /^[A-Za-z]{2}$/.test(part))?.toUpperCase();
    const found = (region && BY_REGION[region]) || BY_LANGUAGE[language.toLowerCase()];
    if (found) return found;
  }
  return "com";
}

export const amazonStoreHost = (id: AmazonStoreId): string =>
  AMAZON_STORES.find((store) => store.id === id)!.host;

export const amazon: AffiliateProgram = {
  id: "amazon",
  name: "Amazon",
  brands: "any",
  disclosure: "As an Amazon Associate, SpoolSync earns from qualifying purchases.",
  hosts: (languages) => [amazonStoreHost(detectAmazonStore(languages)).replace("www.", "")],
  link({ brand, material, color, languages }: BuyQuery) {
    const terms = [brand, material, color].filter(Boolean);
    if (!terms.length) return null;
    const url = new URL(`https://${amazonStoreHost(detectAmazonStore(languages))}/s`);
    url.searchParams.set("k", [...terms, ...(terms.length === 1 ? ["filament"] : [])].join(" "));
    url.searchParams.set("tag", AMAZON_TAG);
    return url.toString();
  },
};
