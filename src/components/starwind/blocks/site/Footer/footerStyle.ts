/** Shared footer style options (used by SiteFooterFull, SiteFooterConfigured and SiteBaseLayout). */

export type FooterLogoSize = "sm" | "md" | "lg" | "xl" | (string & {});

export type FooterUppercaseTarget = "copyright" | "headings" | "links" | "legal";

/** `true` uppercases every target; an array picks specific ones. */
export type FooterUppercase = boolean | readonly FooterUppercaseTarget[];

const PRESETS: Record<string, { wrapper: string; image: string }> = {
  sm: { wrapper: "h-8 lg:h-9", image: "h-8 w-auto" },
  md: { wrapper: "h-10 lg:h-12", image: "h-10 w-auto" },
  lg: { wrapper: "h-12 lg:h-14", image: "h-12 w-auto" },
  xl: { wrapper: "h-14 lg:h-16", image: "h-14 w-auto" },
};

/** Classes for the logo box and the logo image. A custom string is applied to both. */
export function footerLogoClasses(size: FooterLogoSize | undefined): {
  wrapper: string;
  image: string;
} {
  const preset = size ? PRESETS[size] : undefined;
  if (preset) return preset;
  if (size) return { wrapper: size, image: `${size} w-auto` };
  return PRESETS["md"] as { wrapper: string; image: string };
}

export function isUppercase(
  value: FooterUppercase | undefined,
  target: FooterUppercaseTarget,
): boolean {
  if (!value) return false;
  return value === true || value.includes(target);
}

/** Drops height utilities so an explicit logo size wins over a configured logo class. */
export function stripHeightClasses(value: string | undefined): string {
  return (value ?? "")
    .split(/\s+/)
    .filter((token) => token && !/^(?:[\w-]+:)*h-/.test(token))
    .join(" ");
}
