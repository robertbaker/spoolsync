import type { AffiliateProgram } from "./types";

export interface SearchStoreConfig {
  id: string;
  name: string;
  /** The brands this is the maker's own store for, matched ignoring case and punctuation. */
  brands: readonly string[];
  /** The store's address, such as `https://store.example.com`. */
  origin: string;
  /** Where the store's search lives (default `/search`, as on Shopify stores). */
  searchPath?: string;
  /** The search query's parameter name (default `q`). */
  queryParam?: string;
  /** The affiliate and campaign parameters every link carries. */
  params: Readonly<Record<string, string>>;
  /** Extra parameters for search links only, such as `type=product` on stores that need it. */
  searchParams?: Readonly<Record<string, string>>;
  disclosure: string;
  coupon?: { code: string; offer?: string };
}

/**
 * A brand's own web store that has a search page and takes an affiliate id in the address. The
 * search is for the material and color only, since the whole store is the brand; with neither, the
 * link goes to the store's front page. The affiliate parameters are added to every link.
 */
export function searchStoreProgram(config: SearchStoreConfig): AffiliateProgram {
  const origin = new URL(config.origin);
  return {
    id: config.id,
    name: config.name,
    brands: config.brands,
    disclosure: config.disclosure,
    hosts: () => [origin.host],
    ...(config.coupon ? { coupon: config.coupon } : {}),
    link({ material, color }) {
      const terms = [material, color].filter(Boolean).join(" ");
      const url = new URL(terms ? (config.searchPath ?? "/search") : "/", origin);
      if (terms) {
        url.searchParams.set(config.queryParam ?? "q", terms);
        for (const [name, value] of Object.entries(config.searchParams ?? {})) {
          url.searchParams.set(name, value);
        }
      }
      for (const [name, value] of Object.entries(config.params)) url.searchParams.set(name, value);
      return url.toString();
    },
  };
}
