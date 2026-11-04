import { amazon } from "./amazon";
import { searchStoreProgram } from "./stores";
import type { AffiliateProgram, BuyLink, BuyQuery } from "./types";

export { AMAZON_STORES, AMAZON_TAG, detectAmazonStore } from "./amazon";
export type { AffiliateProgram, BuyLink, BuyQuery } from "./types";

const sunlu = searchStoreProgram({
  id: "sunlu",
  name: "SUNLU",
  brands: ["SUNLU"],
  origin: "https://store.sunlu.com",
  params: {
    sca_ref: "12700401.UcCqD96LNe",
    utm_source: "sunluaffiliate",
    utm_medium: "sunluaffiliate",
    utm_campaign: "sunluaffiliate",
  },
  disclosure:
    "SUNLU links are affiliate links: SpoolSync earns a commission on qualifying purchases.",
  coupon: { code: "SpoolSync", offer: "5% off" },
});

const overture = searchStoreProgram({
  id: "overture",
  name: "OVERTURE",
  brands: ["OVERTURE", "Overture3D"],
  origin: "https://overture3d.com",
  params: {
    aff: "306",
    utm_source: "affiliate",
    utm_medium: "referral",
    utm_campaign: "spoolsync",
  },
  disclosure:
    "OVERTURE links are affiliate links: SpoolSync earns a commission on qualifying purchases.",
});

const amolen = searchStoreProgram({
  id: "amolen",
  name: "AMOLEN",
  brands: ["AMOLEN"],
  origin: "https://www.amolen.com",
  params: { ref: "spoolsync" },
  searchParams: { type: "product" },
  disclosure:
    "AMOLEN links are affiliate links: SpoolSync earns a commission on qualifying purchases.",
});

/**
 * Every program, in the order their links are shown: a maker's own store first, general shops
 * after. Add a program here (see `types.ts`); nothing else needs to change.
 */
export const AFFILIATE_PROGRAMS: readonly AffiliateProgram[] = [sunlu, overture, amolen, amazon];

const key = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

const clean = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

/** The browser's languages, in order of preference. */
export function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language ?? ""];
}

const sellsBrand = (program: AffiliateProgram, brand: string) =>
  program.brands === "any" || program.brands.some((name) => key(name) === key(brand));

/**
 * The shop links for a filament: the maker's own store when SpoolSync has a program for the brand,
 * then the general shops. Parts are encoded by `URL`, so spaces, `&`, `#`, quotes and non-Latin
 * names cannot change a link's structure. Empty when there is nothing to search for.
 */
export function buyLinks(
  parts: { brand?: string | null; material?: string | null; color?: string | null },
  languages: readonly string[] = browserLanguages(),
  programs: readonly AffiliateProgram[] = AFFILIATE_PROGRAMS,
): BuyLink[] {
  const query: BuyQuery = {
    brand: clean(parts.brand),
    material: clean(parts.material),
    color: clean(parts.color),
    languages,
  };
  if (!query.brand && !query.material && !query.color) return [];
  const links: BuyLink[] = [];
  for (const program of programs) {
    if (!sellsBrand(program, query.brand)) continue;
    const url = program.link(query);
    if (url)
      links.push({
        programId: program.id,
        shop: program.name,
        url,
        brandStore: program.brands !== "any",
        couponCode: program.coupon?.code ?? null,
        couponOffer: program.coupon?.offer ?? null,
      });
  }
  // A maker's own store comes before general shops, whatever order programs were registered in.
  return links.sort((a, b) => Number(b.brandStore) - Number(a.brandStore));
}

/** The programs behind a set of links, once each, for the disclosures that must appear with them. */
export function programsOf(
  links: readonly BuyLink[],
  programs: readonly AffiliateProgram[] = AFFILIATE_PROGRAMS,
): AffiliateProgram[] {
  const used = new Set(links.map((link) => link.programId));
  return programs.filter((program) => used.has(program.id));
}
