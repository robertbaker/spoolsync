/**
 * Local UI/types — Shared TypeScript types for the site.
 *
 * Web UI interfaces and branded types live here so local components import from one source of
 * truth.
 */

import "./astro-icon.d.ts";
import "./imagemin.d.ts";
import "./window-extensions.d.ts";

// ── Shared Component Data Structures ────────────────────────────────────
export { type PriceType, type PricingItem, type FAQItem } from "./components.ts";

// ── Content Collection Types ────────────────────────────────────────────
export type {
  ServiceFrontmatter,
  BlogPostFrontmatter,
  FAQData,
  Testimonial,
  PricingData,
} from "./content.ts";

// ── Common Types (shared across all sites) ──────────────────────────────
export type {
  ServiceMode,
  BaseProps,
  WithHTMLAttributes,
  NavLink,
  ImageProps,
  CTAProps,
  HeadingLevel,
  IconSize,
  StaggerLevel,
  SizeVariant,
  Alignment,
  SpacingScale,
} from "./common.ts";
export { ICON_SIZES, STAGGER_DELAYS } from "./common.ts";

// ── Site Config Types (for lightweight sites) ───────────────────────
export type {
  HeaderSticky,
  HeaderMobileMenuButtonStyle,
  HeaderMobileMenuAccentColor,
  SiteLogoPreset,
  SiteFooterLogoPreset,
  SiteFooterLink,
  SiteFooterSection,
  ThemeMode,
  ThemePreference,
  SiteContactConfig,
  SiteThemeConfig,
  SiteHeaderConfig,
  SiteFooterConfig,
  SimpleSiteConfig,
} from "./site-config.ts";
// ── Full Site Config Types (for feature-rich sites) ─────────────────
export type {
  FullSiteConfig,
  FullSiteFeaturesConfig,
  FullSiteUIConfig,
  FullSiteAccountConfig,
  HeaderVariant,
  HeaderMobileVariant,
  NavActiveMatch,
  FullSiteLogoPreset,
  FullFooterLink,
  FullFooterSection,
} from "./full-site-config/index.ts";
// ── Brand / Site Identity ───────────────────────────────────────────────
export interface ThemeConfig {
  /** Primary color hex code (e.g. "#3b82f6"). Used to generate primary palette. */
  readonly primary: string;
  /** Secondary color hex code. */
  readonly secondary?: string;
  /** Accent color hex code. */
  readonly accent?: string;
  /** Base application theme to extend (e.g. "light", "dark"). */
  readonly baseTheme?: string;
  /** Border radius for components (e.g. "0.5rem"). */
  readonly radius?: string;
  /** Granular font overrides. */
  readonly fonts?: {
    readonly heading?: string;
    readonly sans?: string;
    readonly mono?: string;
  };
}

export interface BrandConfig {
  /** Machine-readable site identifier (e.g. "main", "docs") */
  readonly id: string;
  /** Human-readable site name (e.g. "My Site") */
  readonly title: string;
  /** Short description for SEO and meta tags */
  readonly description: string;
  /** Bare domain without protocol (e.g. "example.com") */
  readonly domain: string;
  /** Full canonical URL with protocol */
  readonly url: string;
  /** Twitter/X handle */
  readonly twitterHandle?: string;
  /** No-reply email address */
  readonly noReplyEmail: string;
  /** Site visual theme configuration */
  readonly theme: ThemeConfig;
}

export interface SocialLinks {
  readonly facebook?: string;
  readonly twitter?: string;
  readonly x?: string;
  readonly github?: string;
  readonly linkedin?: string;
  readonly tiktok?: string;
  readonly youtube?: string;
  readonly instagram?: string;
  readonly yelp?: string;
  readonly trustpilot?: string;
  readonly tripadvisor?: string;
  readonly google?: string;
  readonly googlemaps?: string;
  readonly applemaps?: string;
  readonly apple?: string;
  readonly glassdoor?: string;
  readonly pinterest?: string;
  readonly reddit?: string;
  readonly threads?: string;
  readonly bluesky?: string;
  readonly discord?: string;
  readonly slack?: string;
  readonly mastodon?: string;
  readonly dribbble?: string;
  readonly behance?: string;
  readonly medium?: string;
  readonly whatsapp?: string;
  readonly telegram?: string;
  readonly [key: string]: string | undefined;
}

export interface SiteConfig {
  readonly brand: BrandConfig;
  readonly socialLinks: SocialLinks;
  readonly contact: {
    readonly scheduleCallUrl: string;
    readonly formUrl: string;
  };
  readonly features: Record<string, unknown>;
  readonly ui: Record<string, unknown>;
}

// ── Content / Blog──────────────────────────────────────────────────────
export interface BlogPost {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly pubDate: Date;
  readonly updatedDate?: Date;
  readonly heroImage?: string;
  readonly tags?: readonly string[];
  readonly author?: string;
  readonly draft?: boolean;
}

// ── Component Props (shared across UI library) ──────────────────────────
export type Variant =
  | "primary"
  | "secondary"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "ghost"
  | "link"
  | "outline";

/**
 * Standard color variants used across the application. Canonical definition for local UI components
 * and site shims.
 */
export type { ColorVariant } from "./colors.ts";
export type { ContactMethod, WhyContactReason } from "./contact.ts";
export { GRID_PATTERNS, type GridPattern } from "./layout.ts";

// ── Contact / Booking ───────────────────────────────────────────────────
export interface ContactFormData {
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly message: string;
  readonly service?: string;
  readonly captchaToken?: string;
}

export interface BookingSlot {
  readonly id: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly available: boolean;
}
