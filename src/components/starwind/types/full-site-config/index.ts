/**
 * Full site configuration types for feature-rich sites.
 *
 * These sites share the same FullSiteConfig type with feature configs and UI config sections.
 * Lightweight sites use SimpleSiteConfig instead.
 */

export type { FullSiteAccountConfig } from "./account";
export type { FullSiteFeaturesConfig } from "./features";
export type {
  HeaderVariant,
  HeaderMobileVariant,
  NavActiveMatch,
  FullSiteLogoPreset,
  FullFooterLink,
  FullFooterSection,
  FullSiteUIConfig,
} from "./ui";

import type { FullSiteFeaturesConfig } from "./features";
import type { FullSiteUIConfig } from "./ui";

// ── Full Site Config ─────────────────────────────────────────────────
export type FullSiteConfig = Readonly<{
  brand: Readonly<{
    title: string;
    description: string;
    url: string;
    company: Readonly<{
      name: string;
      address: string;
      phone: string;
      email: string;
    }>;
  }>;
  contact: Readonly<{
    scheduleCallUrl: string;
    formUrl: string;
  }>;
  socialLinks: Record<string, string>;
  features: FullSiteFeaturesConfig;
  ui: FullSiteUIConfig;
}>;
