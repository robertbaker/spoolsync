/**
 * Affiliate programs: shops where a link from SpoolSync earns the site a commission. This is for
 * the site's income, not a visitor setting, so nothing here is stored or configurable in the
 * browser.
 *
 * To add a program, make one (usually with `searchStoreProgram` in `stores.ts`) and add it to
 * `AFFILIATE_PROGRAMS` in `index.ts`. The reorder list, its CSV and the privacy page pick it up.
 */

/** What a shop link is for: one filament, or (with an empty material and color) a whole brand. */
export interface BuyQuery {
  brand: string;
  material: string;
  color: string;
  /** The visitor's languages in order of preference, for shops that have one store per country. */
  languages: readonly string[];
}

export interface AffiliateProgram {
  /** Stable id, for tests and for telling links apart. */
  id: string;
  /** The shop's name as shown on a link. */
  name: string;
  /** The brands this shop is the maker's own store for, or `"any"` for a general shop. */
  brands: readonly string[] | "any";
  /** The statement shown wherever the program's links appear. */
  disclosure: string;
  /** Domains the links go to, for the privacy page. */
  hosts: (languages: readonly string[]) => readonly string[];
  /** A coupon the shop gives buyers who arrive through the link. */
  coupon?: { code: string; /** What it gives, such as "5% off". */ offer?: string };
  /** The shop link for a query, or `null` when there is nothing to search for. */
  link(query: BuyQuery): string | null;
}

/** A ready-to-show link. */
export interface BuyLink {
  programId: string;
  shop: string;
  url: string;
  /** Whether the link belongs to a shop for the brand itself, as opposed to a general shop. */
  brandStore: boolean;
  couponCode: string | null;
  /** What the coupon gives, when the shop says. */
  couponOffer: string | null;
}
