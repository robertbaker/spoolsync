import type { ImageMetadata } from "astro";

import type { ColorVariant, NavLink } from "../../../types/index.ts";

export interface DesktopMegaNavLink {
  href: string;
  label: string;
  description?: string;
  icon?: string;
  image?: string | ImageMetadata;
  imageAlt?: string;
  color?: ColorVariant;
  ariaLabel?: string;
  external?: boolean;
}

export interface DesktopMegaNavColumn {
  heading: string;
  eyebrow?: string;
  links: readonly DesktopMegaNavLink[];
}

export interface DesktopMegaNavPromo {
  href: string;
  title: string;
  description: string;
  eyebrow?: string;
  icon?: string;
  image?: string | ImageMetadata;
  imageAlt?: string;
  actionLabel: string;
  color?: ColorVariant;
}

export interface DesktopMegaNavGroup {
  label: string;
  ariaLabel?: string;
  icon?: string;
  color?: ColorVariant;
  description?: string;
  columns: readonly DesktopMegaNavColumn[];
  promo?: DesktopMegaNavPromo;
}

export interface DesktopMegaNavCta {
  href: string;
  label: string;
  ariaLabel?: string;
  icon?: string;
  external?: boolean;
}

export type SiteNavLink = NavLink;

// ── Components ──────────────────────────────────────────────────────────
export { default as DesktopMegaNav } from "./DesktopMegaNav.astro";
export { default as HeaderLogo } from "./HeaderLogo.astro";
export { default as HeaderMobileMenuButton } from "./HeaderMobileMenuButton.astro";
export { default as SiteHeader } from "./SiteHeader.astro";
export { default as SiteHeaderFull } from "./SiteHeaderFull.astro";

// ── Mobile Menu Variants ────────────────────────────────────────────────
export { default as BottomNav } from "./variants/BottomNav.astro";
export { default as FabMenu } from "./variants/FabMenu.astro";
export { default as GridMenu } from "./variants/GridMenu.astro";
export { default as OverlayMenu } from "./variants/OverlayMenu.astro";

// ── Logo Animation ──────────────────────────────────────────────────────
export {
  HeaderLogoAnimationManager,
  bootstrapHeaderLogoAnimation,
  initHeaderLogoAnimation,
} from "./initHeaderLogoAnimation";

export {
  HEADER_ICON_BUTTON_RESET_CLASSES,
  HEADER_ICON_TRIGGER_CLASSES,
} from "./headerControlClasses";
