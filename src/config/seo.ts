import socialCard from "../assets/images/social-card.avif";

export const DEFAULT_SOCIAL_IMAGE = socialCard;

export const DEFAULT_SOCIAL_IMAGE_ALT = "SpoolSync filament inventory sync" as const;

export const NOINDEX_ROBOTS = "noindex, follow, noarchive" as const;

const EXACT_NOINDEX_PATHS = new Set(["/404"]);

export function normalizeSeoPath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function shouldNoindexPath(pathname: string): boolean {
  return EXACT_NOINDEX_PATHS.has(normalizeSeoPath(pathname));
}
