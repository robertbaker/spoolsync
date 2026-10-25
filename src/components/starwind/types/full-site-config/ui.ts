/**
 * UI-related configuration types for full sites. Covers theme, header, footer, forms, overlays, and
 * component configs.
 */

import type { NavLink } from "../common";
import type {
  SiteFooterLink,
  SiteFooterSection,
  HeaderSticky,
  HeaderMobileMenuButtonStyle,
  HeaderMobileMenuAccentColor,
  ThemePreference,
} from "../site-config";

// ── Header ───────────────────────────────────────────────────────────
export type HeaderVariant = "default" | "thin" | "mega";
export type HeaderMobileVariant = "collapse" | "overlay" | "bottom-nav" | "fab" | "grid";
export type NavActiveMatch = "startsWith" | "exact";

export type FullSiteLogoPreset = Readonly<{
  icon: string;
  width?: string;
  height?: string;
  theme?: "default" | "dark" | "light" | "monochrome" | "accent";
  animationType?: "top-down" | "left-right" | "fade-scale" | "rotate-3d" | "random" | "none";
  animationTrigger?: "load" | "hover" | "both" | "none";
  effect?:
    | "none"
    | "rainbow"
    | "pulse"
    | "gradient-flow"
    | "stroke"
    | "glitch"
    | "shine"
    | "neon"
    | "shake"
    | "retro"
    | "random"
    | "sequential";
  effectTrigger?: "load" | "hover" | "both" | "none";
  effectDuration?: number | "infinite";
  gradient?: boolean;
  class?: string;
}>;

// ── Footer (re-use from site-config.ts) ──────────────────────────────
export type FullFooterLink = SiteFooterLink;
export type FullFooterSection = SiteFooterSection;

// ── UI Config ────────────────────────────────────────────────────────

/** UI section of the full site config. */
export type FullSiteUIConfig = Readonly<{
  theme: Readonly<{
    storageKey: string;
    defaultMode: ThemePreference;
    syncSystemChangesWhenAuto: boolean;
    metaThemeColor: string;
  }>;
  navigation: Readonly<{
    links: NavLink[];
    activeMatch: NavActiveMatch;
    closeDropdownsOnOutsideClick: boolean;
  }>;
  header: Readonly<{
    sticky: HeaderSticky;
    class?: string;
    variant: HeaderVariant;
    glass: boolean;
    mobileVariant: HeaderMobileVariant;
    mobileMenuHandedness?: "left" | "right";
    mobileMenuButtonStyle?: HeaderMobileMenuButtonStyle;
    mobileMenuAccentColor?: HeaderMobileMenuAccentColor;
    unstyled?: boolean;
    showThemeToggle: boolean;
    logo: FullSiteLogoPreset;
    homeLinkAriaLabel: string;
    windowKey: string;
  }>;
  footer: Readonly<{
    unstyled?: boolean;
    logo: FullSiteLogoPreset;
    homeLinkAriaLabel: string;
    copyrightText: string;
    sections: readonly FullFooterSection[];
  }>;
  errorPages: Readonly<{
    logo: FullSiteLogoPreset;
  }>;
  overlays: Readonly<{
    codeMatrix: Readonly<{
      enabled: boolean;
      triggerOnThemeToggle: boolean;
      animation: Readonly<{
        durationMs: number;
        frameIntervalMs: number;
        columnWidthPx: number;
        glyphHeightPx: number;
      }>;
      colors: Readonly<{
        trailColor: string;
        glyphColor: string;
        glowColor: string;
        glowShadowBlur: number;
        glowProbability: number;
      }>;
      glyphCharacters: string;
    }>;
  }>;
  bookingAlert: Readonly<{
    ids: Readonly<{
      containerId: string;
      manageLinkId: string;
      messageId: string;
      closeButtonId: string;
    }>;
  }>;
  forms: Readonly<{
    contact: Readonly<{
      ids: Readonly<{
        formId: string;
        feedbackContainerId: string;
        feedbackIconId: string;
        feedbackMessageId: string;
      }>;
      captchaSelector: string;
      submitTimeoutMs: number;
    }>;
    newsletter: Readonly<{
      defaults: Readonly<{
        title: string;
        description: string;
        ariaLabel: string;
        placeholder: string;
        buttonText: string;
        subscribingText: string;
      }>;
      messages: Readonly<{
        success: string;
        alreadySubscribed: string;
        error: string;
      }>;
    }>;
  }>;
  heroSimple: Readonly<{
    defaultSubtitle: string;
    defaultBackgroundImageAlt: string;
  }>;
  pricingSection: Readonly<{
    title: string;
    description: string;
    badgeText: string;
    sectionId: string;
    animationDelay: number;
    onSiteDisclaimer: string;
    serviceIconMap: ReadonlyArray<Readonly<{ keywords: readonly string[]; icon: string }>>;
    defaultServiceIcon: string;
  }>;
  testimonials: Readonly<{
    featured: Readonly<{
      statValue: string;
      statDescription: string;
      avatarUrl: string;
    }>;
    secondary: Readonly<{
      statValue: string;
      statDescription: string;
      avatarUrl: string;
    }>;
    supportingLimit: number;
    supportingDelayClasses: ReadonlyArray<string>;
  }>;
  heroStats: Readonly<{
    badge: Readonly<{ text: string; icon: string }>;
    title: string;
    subtitle: string;
    stats: ReadonlyArray<Readonly<{ icon: string; label: string; value: string }>>;
    primaryButton: Readonly<{
      href: string;
      text: string;
      variant: string;
      icon: string;
    }>;
    secondaryButton: Readonly<{
      href: string;
      text: string;
      variant: string;
      icon: string;
    }>;
    tags: ReadonlyArray<string>;
  }>;
  faq: Readonly<{
    section: Readonly<{
      title: string;
      class: string;
      sectionClass: string;
    }>;
    layout: Readonly<{
      containerClass: string;
      headerClass: string;
      badgeClass: string;
      titleClass: string;
      subtitleClass: string;
      gridClass: string;
      cardClass: string;
      cardBodyClass: string;
      iconContainerClass: string;
      iconWrapperClass: string;
      iconBackgroundClass: string;
      iconSizeClass: string;
      contentContainerClass: string;
      questionClass: string;
      subtitleTextClass: string;
      answerClass: string;
      ctaContainerClass: string;
      ctaTextClass: string;
      ctaButtonClass: string;
    }>;
    icons: Readonly<{ defaultIcon: string }>;
    animation: Readonly<{ ctaDelay: string }>;
  }>;
  servicesSection: Readonly<{
    defaultHighlights: ReadonlyArray<
      Readonly<{
        title: string;
        description: string;
        href?: string;
        color?: string;
        icon?: string;
      }>
    >;
  }>;
  statsSection: Readonly<{
    defaults: Readonly<{
      sectionId: string;
      backgroundClass: string;
      paddingClass: string;
    }>;
    stats: ReadonlyArray<
      Readonly<{
        id: string;
        value: number;
        suffix?: string;
        decimals?: number;
        label: string;
        description: string;
        icon: string;
        color: string;
        delay?: number;
      }>
    >;
  }>;
  featuresSection: Readonly<{
    defaults: Readonly<{
      sectionId: string;
      backgroundClass: string;
      paddingClass: string;
      badgeText: string;
      badgeIcon: string;
      title: string;
      subtitle: string;
    }>;
    features: ReadonlyArray<
      Readonly<{
        title: string;
        description: string;
        icon: string;
        color?: string;
        delay?: number;
      }>
    >;
  }>;
}>;
