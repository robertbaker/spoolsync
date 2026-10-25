/**
 * Shared site configuration types for lightweight sites.
 *
 * Used by sites that follow the simple informational site pattern (no content collections, no
 * account pages).
 */

// ── Header ───────────────────────────────────────────────────────────
export type HeaderSticky = "fixed" | "scroll-up" | "none";
export type HeaderMobileMenuButtonStyle = "morph" | "path" | "spin";
export type HeaderMobileMenuAccentColor =
  | "primary"
  | "success"
  | "info"
  | "warning"
  | "error"
  | "accent"
  | "secondary"
  | "neutral";

export interface SiteLogoPreset {
  readonly text: string;
  readonly icon?: string;
  readonly src?: string;
  readonly width?: number;
  readonly height?: number;
  readonly class?: string;
  readonly transparent?: boolean;
}

export interface SiteFooterLogoPreset {
  readonly icon?: string;
  readonly src?: string;
  readonly width?: number;
  readonly height?: number;
  readonly class?: string;
  readonly transparent?: boolean;
}

// ── Footer ───────────────────────────────────────────────────────────
export interface SiteFooterLink {
  readonly href: string;
  readonly label: string;
  readonly ariaLabel?: string;
  readonly external?: boolean;
}

export interface SiteFooterSection {
  readonly id: string;
  readonly title: string;
  readonly links: SiteFooterLink[];
}

// ── Theme ────────────────────────────────────────────────────────────
export type ThemeMode = "dark" | "light";
export type ThemePreference = ThemeMode | "system";

// ── Contact Info ─────────────────────────────────────────────────────
export interface SitePhoneConfig {
  readonly e164: string;
  readonly display: string;
  readonly href: string;
}

export interface SiteContactConfig {
  readonly email: string;
  readonly location: string;
  readonly formUrl: string;
  /** Scheduling link used in the footer contact block when no phone is configured. */
  readonly scheduleCallUrl?: string;
  readonly phone?: SitePhoneConfig;
}

// ── UI Config ────────────────────────────────────────────────────────
export interface SiteThemeConfig {
  readonly storageKey: string;
  readonly defaultMode: ThemePreference;
  readonly metaThemeColor: string;
}

export interface SiteHeaderConfig {
  readonly sticky: HeaderSticky;
  readonly class?: string;
  readonly variant?: "default" | "thin" | "mega";
  readonly glass?: boolean;
  readonly mobileVariant?: "collapse" | "overlay" | "bottom-nav" | "fab" | "grid";
  readonly mobileMenuHandedness?: "left" | "right";
  readonly mobileMenuButtonStyle?: HeaderMobileMenuButtonStyle;
  readonly mobileMenuAccentColor?: HeaderMobileMenuAccentColor;
  readonly unstyled?: boolean;
  readonly showThemeToggle: boolean;
  readonly logo: SiteLogoPreset;
  readonly homeLinkAriaLabel: string;
  readonly windowKey?: string;
  /** Desktop nav placement: after the logo group (`end`, default) or centered in the bar. */
  readonly navAlign?: "end" | "center";
  /** Where the layout's `header-banner` slot sits inside the sticky header. */
  readonly bannerPosition?: "above" | "below";
}

export interface SiteFooterConfig {
  readonly unstyled?: boolean;
  readonly copyrightText: string;
  readonly homeLinkAriaLabel: string;
  readonly logo?: SiteFooterLogoPreset;
  readonly sections: SiteFooterSection[];
}

// ── Simple Site Config ───────────────────────────────────────────────
/**
 * Configuration type for lightweight informational sites.
 *
 * Sites with richer needs (support, dev) extend this with additional `features` and `ui` sections
 * in their own local types.
 */
export interface SimpleSiteConfig {
  readonly brand: {
    readonly title: string;
    readonly description: string;
    readonly url: string;
  };
  readonly contact: SiteContactConfig;
  readonly socialLinks: Record<string, string>;
  readonly ui: {
    readonly theme: SiteThemeConfig;
    readonly header: SiteHeaderConfig;
    readonly footer: SiteFooterConfig;
  };
}

// ── Navigation link re-export for convenience ────────────────────────
