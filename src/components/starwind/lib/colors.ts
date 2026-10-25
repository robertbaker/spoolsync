/**
 * Color Utilities
 *
 * Centralized color variant types and class generators. Consolidates duplicated color logic from
 * multiple components.
 */

// Canonical ColorVariant lives in ../types; re-export for convenience
export type { ColorVariant } from "../types/colors";
import type { ColorVariant } from "../types/colors";

export interface CardColorClasses {
  border: string;
  iconBg: string;
  iconBgHover: string;
  titleHover: string;
}

export interface ExtendedColorClasses extends CardColorClasses {
  badgeBorder: string;
}

export interface ContactColorClasses {
  border: string;
  iconBg: string;
  linkText: string;
}

export interface FeatureColorClasses {
  iconBg: string;
  border: string;
  hoverBorder: string;
  hoverText: string;
  bgLight: string;
  text: string;
}

export const CARD_COLOR_CLASSES = {
  primary: {
    border: "border-primary/20 hover:border-primary",
    iconBg: "bg-primary/10 text-primary-text",
    iconBgHover: "group-hover:bg-primary/20",
    titleHover: "group-hover:text-primary-text",
  },
  success: {
    border: "border-success/20 hover:border-success",
    iconBg: "bg-success/10 text-success-text",
    iconBgHover: "group-hover:bg-success/20",
    titleHover: "group-hover:text-success-text",
  },
  info: {
    border: "border-info/20 hover:border-info",
    iconBg: "bg-info/10 text-info-text",
    iconBgHover: "group-hover:bg-info/20",
    titleHover: "group-hover:text-info-text",
  },
  warning: {
    border: "border-warning/20 hover:border-warning",
    iconBg: "bg-warning/10 text-warning-text",
    iconBgHover: "group-hover:bg-warning/20",
    titleHover: "group-hover:text-warning-text",
  },
  error: {
    border: "border-error/20 hover:border-error",
    iconBg: "bg-error/10 text-error-text",
    iconBgHover: "group-hover:bg-error/20",
    titleHover: "group-hover:text-error-text",
  },
  accent: {
    border: "border-accent/20 hover:border-accent",
    iconBg: "bg-accent/10 text-foreground",
    iconBgHover: "group-hover:bg-accent/20",
    titleHover: "group-hover:text-foreground",
  },
  secondary: {
    border: "border-secondary/20 hover:border-secondary",
    iconBg: "bg-secondary/10 text-foreground",
    iconBgHover: "group-hover:bg-secondary/20",
    titleHover: "group-hover:text-foreground",
  },
  neutral: {
    border: "border-border hover:border-foreground/40",
    iconBg: "bg-muted text-foreground",
    iconBgHover: "group-hover:bg-muted/80",
    titleHover: "group-hover:text-foreground",
  },
};

export const EXTENDED_COLOR_CLASSES = {
  primary: {
    ...CARD_COLOR_CLASSES.primary,
    badgeBorder: "border-primary/30 bg-primary/10 text-primary-text",
  },
  success: {
    ...CARD_COLOR_CLASSES.success,
    badgeBorder: "border-success/30 bg-success/10 text-success-text",
  },
  info: {
    ...CARD_COLOR_CLASSES.info,
    badgeBorder: "border-info/30 bg-info/10 text-info-text",
  },
  warning: {
    ...CARD_COLOR_CLASSES.warning,
    badgeBorder: "border-warning/30 bg-warning/10 text-warning-text",
  },
  error: {
    ...CARD_COLOR_CLASSES.error,
    badgeBorder: "border-error/30 bg-error/10 text-error-text",
  },
  accent: {
    ...CARD_COLOR_CLASSES.accent,
    badgeBorder: "border-accent/30 bg-accent/10 text-foreground",
  },
  secondary: {
    ...CARD_COLOR_CLASSES.secondary,
    badgeBorder: "border-secondary/30 bg-secondary/10 text-foreground",
  },
  neutral: {
    ...CARD_COLOR_CLASSES.neutral,
    badgeBorder: "border-border bg-muted text-foreground",
  },
};

export const CONTACT_COLOR_CLASSES = {
  primary: {
    border: "border-primary/25 hover:border-primary hover:shadow-primary/30",
    iconBg: "bg-primary/10 text-primary-text",
    linkText: "text-primary-text hover:text-primary-text/80",
  },
  success: {
    border: "border-success/25 hover:border-success hover:shadow-success/30",
    iconBg: "bg-success/10 text-success-text",
    linkText: "text-success-text hover:text-success-text/80",
  },
  info: {
    border: "border-info/25 hover:border-info hover:shadow-info/30",
    iconBg: "bg-info/10 text-info-text",
    linkText: "text-info-text hover:text-info-text/80",
  },
  warning: {
    border: "border-warning/25 hover:border-warning hover:shadow-warning/30",
    iconBg: "bg-warning/10 text-warning-text",
    linkText: "text-warning-text hover:text-warning-text/80",
  },
  error: {
    border: "border-error/25 hover:border-error hover:shadow-error/30",
    iconBg: "bg-error/10 text-error-text",
    linkText: "text-error-text hover:text-error-text/80",
  },
  accent: {
    border: "border-accent/25 hover:border-accent hover:shadow-accent/30",
    iconBg: "bg-accent/10 text-foreground",
    linkText: "text-foreground hover:text-foreground/80",
  },
  secondary: {
    border: "border-secondary/25 hover:border-secondary hover:shadow-secondary/30",
    iconBg: "bg-secondary/10 text-foreground",
    linkText: "text-foreground hover:text-foreground/80",
  },
  neutral: {
    border: "border-border hover:border-foreground/40 hover:shadow-foreground/30",
    iconBg: "bg-muted text-foreground",
    linkText: "text-foreground hover:text-foreground/80",
  },
};

export const FEATURE_COLOR_CLASSES = {
  primary: {
    iconBg: "bg-primary text-primary-foreground",
    border: "border-primary/20",
    hoverBorder: "hover:border-primary",
    hoverText: "group-hover:text-primary-text",
    bgLight: "bg-primary/10",
    text: "text-primary-text",
  },
  success: {
    iconBg: "bg-success text-success-foreground",
    border: "border-success/20",
    hoverBorder: "hover:border-success",
    hoverText: "group-hover:text-success-text",
    bgLight: "bg-success/10",
    text: "text-success-text",
  },
  info: {
    iconBg: "bg-info text-info-foreground",
    border: "border-info/20",
    hoverBorder: "hover:border-info",
    hoverText: "group-hover:text-info-text",
    bgLight: "bg-info/10",
    text: "text-info-text",
  },
  warning: {
    iconBg: "bg-warning text-warning-foreground",
    border: "border-warning/20",
    hoverBorder: "hover:border-warning",
    hoverText: "group-hover:text-warning-text",
    bgLight: "bg-warning/10",
    text: "text-warning-text",
  },
  error: {
    iconBg: "bg-error text-error-foreground",
    border: "border-error/20",
    hoverBorder: "hover:border-error",
    hoverText: "group-hover:text-error-text",
    bgLight: "bg-error/10",
    text: "text-error-text",
  },
  accent: {
    iconBg: "bg-accent text-accent-foreground",
    border: "border-accent/20",
    hoverBorder: "hover:border-accent",
    hoverText: "group-hover:text-foreground",
    bgLight: "bg-accent/10",
    text: "text-foreground",
  },
  secondary: {
    iconBg: "bg-secondary text-secondary-foreground",
    border: "border-secondary/20",
    hoverBorder: "hover:border-secondary",
    hoverText: "group-hover:text-foreground",
    bgLight: "bg-secondary/10",
    text: "text-foreground",
  },
  neutral: {
    iconBg: "bg-foreground text-background",
    border: "border-foreground/20",
    hoverBorder: "hover:border-foreground",
    hoverText: "group-hover:text-foreground",
    bgLight: "bg-muted",
    text: "text-foreground",
  },
};

export function getCardColorClasses(color: ColorVariant | string = "primary"): CardColorClasses {
  return (
    (CARD_COLOR_CLASSES as Record<string, CardColorClasses>)[color] ?? CARD_COLOR_CLASSES.primary
  );
}

export function getExtendedColorClasses(
  color: ColorVariant | string = "primary",
): ExtendedColorClasses {
  return (
    (EXTENDED_COLOR_CLASSES as Record<string, ExtendedColorClasses>)[color] ??
    EXTENDED_COLOR_CLASSES.primary
  );
}

export function getContactColorClasses(
  color: ColorVariant | string = "primary",
): ContactColorClasses {
  return (
    (CONTACT_COLOR_CLASSES as Record<string, ContactColorClasses>)[color] ??
    CONTACT_COLOR_CLASSES.primary
  );
}

export function getFeatureColorClasses(
  color: ColorVariant | string = "primary",
): FeatureColorClasses {
  return (
    (FEATURE_COLOR_CLASSES as Record<string, FeatureColorClasses>)[color] ??
    FEATURE_COLOR_CLASSES.primary
  );
}

export const ICON_AVATAR_COLORS = {
  primary: {
    bg: "bg-primary/10",
    text: "text-primary-text",
  },
  success: {
    bg: "bg-success/10",
    text: "text-success-text",
  },
  info: {
    bg: "bg-info/10",
    text: "text-info-text",
  },
  warning: {
    bg: "bg-warning/10",
    text: "text-warning-text",
  },
  error: {
    bg: "bg-error/10",
    text: "text-error-text",
  },
  accent: {
    bg: "bg-accent/10",
    text: "text-foreground",
  },
  secondary: {
    bg: "bg-secondary/10",
    text: "text-foreground",
  },
  neutral: {
    bg: "bg-muted",
    text: "text-foreground",
  },
};

export function getIconAvatarColors(color: ColorVariant | string = "primary"): {
  bg: string;
  text: string;
} {
  return (
    (ICON_AVATAR_COLORS as Record<string, { bg: string; text: string }>)[color] ??
    ICON_AVATAR_COLORS.primary
  );
}

export const NAV_HOVER_COLORS = {
  primary: "hover:text-primary-text focus:text-primary-text",
  success: "hover:text-success-text focus:text-success-text",
  info: "hover:text-info-text focus:text-info-text",
  warning: "hover:text-warning-text focus:text-warning-text",
  error: "hover:text-error-text focus:text-error-text",
  accent: "hover:text-foreground focus:text-foreground",
  secondary: "hover:text-foreground focus:text-foreground",
  neutral: "hover:text-foreground focus:text-foreground",
};

export function getNavHoverColors(color: ColorVariant | string = "primary"): string {
  return (NAV_HOVER_COLORS as Record<string, string>)[color] ?? NAV_HOVER_COLORS.primary;
}

/** Stats card color classes — borders, text, icon bg */
export interface StatsColorClasses {
  border: string;
  borderHover: string;
  text: string;
  iconBg: string;
  iconBgHover: string;
}

export const STATS_COLOR_CLASSES = {
  primary: {
    border: "border-primary/20",
    borderHover: "hover:border-primary",
    text: "text-primary-text",
    iconBg: "bg-primary/10",
    iconBgHover: "group-hover:bg-primary/20",
  },
  success: {
    border: "border-success/20",
    borderHover: "hover:border-success",
    text: "text-success-text",
    iconBg: "bg-success/10",
    iconBgHover: "group-hover:bg-success/20",
  },
  info: {
    border: "border-info/20",
    borderHover: "hover:border-info",
    text: "text-info-text",
    iconBg: "bg-info/10",
    iconBgHover: "group-hover:bg-info/20",
  },
  warning: {
    border: "border-warning/20",
    borderHover: "hover:border-warning",
    text: "text-warning-text",
    iconBg: "bg-warning/10",
    iconBgHover: "group-hover:bg-warning/20",
  },
  error: {
    border: "border-error/20",
    borderHover: "hover:border-error",
    text: "text-error-text",
    iconBg: "bg-error/10",
    iconBgHover: "group-hover:bg-error/20",
  },
  accent: {
    border: "border-accent/20",
    borderHover: "hover:border-accent",
    text: "text-foreground",
    iconBg: "bg-accent/10",
    iconBgHover: "group-hover:bg-accent/20",
  },
  secondary: {
    border: "border-secondary/20",
    borderHover: "hover:border-secondary",
    text: "text-foreground",
    iconBg: "bg-secondary/10",
    iconBgHover: "group-hover:bg-secondary/20",
  },
  neutral: {
    border: "border-foreground/20",
    borderHover: "hover:border-foreground",
    text: "text-foreground",
    iconBg: "bg-foreground/10",
    iconBgHover: "group-hover:bg-foreground/20",
  },
};

export function getStatsColorClasses(color: ColorVariant | string = "primary"): StatsColorClasses {
  return (
    (STATS_COLOR_CLASSES as Record<string, StatsColorClasses>)[color] ?? STATS_COLOR_CLASSES.primary
  );
}

/** Grid menu item color classes */
export interface GridMenuColorClasses {
  hoverBorder: string;
  groupHoverBg: string;
  groupHoverText: string;
}

export const GRID_MENU_COLOR_CLASSES = {
  primary: {
    hoverBorder: "hover:border-primary",
    groupHoverBg: "group-hover:bg-primary/10",
    groupHoverText: "group-hover:text-primary-text",
  },
  success: {
    hoverBorder: "hover:border-success",
    groupHoverBg: "group-hover:bg-success/10",
    groupHoverText: "group-hover:text-success-text",
  },
  info: {
    hoverBorder: "hover:border-info",
    groupHoverBg: "group-hover:bg-info/10",
    groupHoverText: "group-hover:text-info-text",
  },
  warning: {
    hoverBorder: "hover:border-warning",
    groupHoverBg: "group-hover:bg-warning/10",
    groupHoverText: "group-hover:text-warning-text",
  },
  error: {
    hoverBorder: "hover:border-error",
    groupHoverBg: "group-hover:bg-error/10",
    groupHoverText: "group-hover:text-error-text",
  },
  accent: {
    hoverBorder: "hover:border-accent",
    groupHoverBg: "group-hover:bg-accent/10",
    groupHoverText: "group-hover:text-foreground",
  },
  secondary: {
    hoverBorder: "hover:border-secondary",
    groupHoverBg: "group-hover:bg-secondary/10",
    groupHoverText: "group-hover:text-foreground",
  },
  neutral: {
    hoverBorder: "hover:border-foreground",
    groupHoverBg: "group-hover:bg-foreground/10",
    groupHoverText: "group-hover:text-foreground",
  },
};

export function getGridMenuColorClasses(
  color: ColorVariant | string = "primary",
): GridMenuColorClasses {
  return (
    (GRID_MENU_COLOR_CLASSES as Record<string, GridMenuColorClasses>)[color] ??
    GRID_MENU_COLOR_CLASSES.primary
  );
}

/** Timeline color classes */
export interface TimelineColorClasses {
  circleBg: string;
  border: string;
  hoverBorder: string;
  titleHover: string;
}

export const TIMELINE_COLOR_CLASSES = {
  primary: {
    circleBg: "bg-primary text-primary-foreground",
    border: "border-primary/20",
    hoverBorder: "hover:border-primary",
    titleHover: "group-hover:text-primary-text",
  },
  success: {
    circleBg: "bg-success text-success-foreground",
    border: "border-success/20",
    hoverBorder: "hover:border-success",
    titleHover: "group-hover:text-success-text",
  },
  info: {
    circleBg: "bg-info text-info-foreground",
    border: "border-info/20",
    hoverBorder: "hover:border-info",
    titleHover: "group-hover:text-info-text",
  },
  warning: {
    circleBg: "bg-warning text-warning-foreground",
    border: "border-warning/20",
    hoverBorder: "hover:border-warning",
    titleHover: "group-hover:text-warning-text",
  },
  error: {
    circleBg: "bg-error text-error-foreground",
    border: "border-error/20",
    hoverBorder: "hover:border-error",
    titleHover: "group-hover:text-error-text",
  },
  accent: {
    circleBg: "bg-accent text-accent-foreground",
    border: "border-accent/20",
    hoverBorder: "hover:border-accent",
    titleHover: "group-hover:text-foreground",
  },
  secondary: {
    circleBg: "bg-secondary text-secondary-foreground",
    border: "border-secondary/20",
    hoverBorder: "hover:border-secondary",
    titleHover: "group-hover:text-foreground",
  },
  neutral: {
    circleBg: "bg-foreground text-background",
    border: "border-foreground/20",
    hoverBorder: "hover:border-foreground",
    titleHover: "group-hover:text-foreground",
  },
};

export function getTimelineColorClasses(
  color: ColorVariant | string = "primary",
): TimelineColorClasses {
  return (
    (TIMELINE_COLOR_CLASSES as Record<string, TimelineColorClasses>)[color] ??
    TIMELINE_COLOR_CLASSES.primary
  );
}

/** FAQ card color classes */
export interface FAQColorClasses {
  border: string;
  borderHover: string;
  iconBg: string;
  iconText: string;
  titleHover: string;
  backBorder: string;
  backIconText: string;
}

export const FAQ_COLOR_CLASSES = {
  primary: {
    border: "border-primary/20",
    borderHover: "group-hover:border-primary",
    iconBg: "bg-primary/10",
    iconText: "text-primary-text",
    titleHover: "group-hover:text-primary-text",
    backBorder: "border-primary",
    backIconText: "text-primary-text",
  },
  success: {
    border: "border-success/20",
    borderHover: "group-hover:border-success",
    iconBg: "bg-success/10",
    iconText: "text-success-text",
    titleHover: "group-hover:text-success-text",
    backBorder: "border-success",
    backIconText: "text-success-text",
  },
  info: {
    border: "border-info/20",
    borderHover: "group-hover:border-info",
    iconBg: "bg-info/10",
    iconText: "text-info-text",
    titleHover: "group-hover:text-info-text",
    backBorder: "border-info",
    backIconText: "text-info-text",
  },
  warning: {
    border: "border-warning/20",
    borderHover: "group-hover:border-warning",
    iconBg: "bg-warning/10",
    iconText: "text-warning-text",
    titleHover: "group-hover:text-warning-text",
    backBorder: "border-warning",
    backIconText: "text-warning-text",
  },
  error: {
    border: "border-error/20",
    borderHover: "group-hover:border-error",
    iconBg: "bg-error/10",
    iconText: "text-error-text",
    titleHover: "group-hover:text-error-text",
    backBorder: "border-error",
    backIconText: "text-error-text",
  },
  accent: {
    border: "border-accent/20",
    borderHover: "group-hover:border-accent",
    iconBg: "bg-accent/10",
    iconText: "text-foreground",
    titleHover: "group-hover:text-foreground",
    backBorder: "border-accent",
    backIconText: "text-foreground",
  },
  secondary: {
    border: "border-secondary/20",
    borderHover: "group-hover:border-secondary",
    iconBg: "bg-secondary/10",
    iconText: "text-foreground",
    titleHover: "group-hover:text-foreground",
    backBorder: "border-secondary",
    backIconText: "text-foreground",
  },
  neutral: {
    border: "border-foreground/20",
    borderHover: "group-hover:border-foreground",
    iconBg: "bg-muted",
    iconText: "text-foreground",
    titleHover: "group-hover:text-foreground",
    backBorder: "border-foreground",
    backIconText: "text-foreground",
  },
};

export function getFAQColorClasses(color: ColorVariant | string = "primary"): FAQColorClasses {
  return (FAQ_COLOR_CLASSES as Record<string, FAQColorClasses>)[color] ?? FAQ_COLOR_CLASSES.primary;
}

/** Hero card shadow hover */
export const HERO_SHADOW_HOVER = {
  primary: "hover:shadow-primary/20",
  success: "hover:shadow-success/20",
  info: "hover:shadow-info/20",
  warning: "hover:shadow-warning/20",
  error: "hover:shadow-error/20",
  accent: "hover:shadow-accent/20",
  secondary: "hover:shadow-secondary/20",
  neutral: "hover:shadow-foreground/20",
};

/** Mobile menu button color classes */
export interface MobileMenuColorClasses {
  hoverText: string;
  activeText: string;
  focusOutline: string;
}

export const MOBILE_MENU_COLOR_CLASSES = {
  primary: {
    hoverText: "hover:text-primary-text",
    activeText: "active:text-primary-text",
    focusOutline: "focus-visible:outline-primary/70",
  },
  success: {
    hoverText: "hover:text-success-text",
    activeText: "active:text-success-text",
    focusOutline: "focus-visible:outline-success/70",
  },
  info: {
    hoverText: "hover:text-info-text",
    activeText: "active:text-info-text",
    focusOutline: "focus-visible:outline-info/70",
  },
  warning: {
    hoverText: "hover:text-warning-text",
    activeText: "active:text-warning-text",
    focusOutline: "focus-visible:outline-warning/70",
  },
  error: {
    hoverText: "hover:text-error-text",
    activeText: "active:text-error-text",
    focusOutline: "focus-visible:outline-error/70",
  },
  accent: {
    hoverText: "hover:text-foreground",
    activeText: "active:text-foreground",
    focusOutline: "focus-visible:outline-accent/70",
  },
  secondary: {
    hoverText: "hover:text-foreground",
    activeText: "active:text-foreground",
    focusOutline: "focus-visible:outline-secondary/70",
  },
  neutral: {
    hoverText: "hover:text-foreground",
    activeText: "active:text-foreground",
    focusOutline: "focus-visible:outline-foreground/70",
  },
};

export function getMobileMenuColorClasses(
  color: ColorVariant | string = "primary",
): MobileMenuColorClasses {
  return (
    (MOBILE_MENU_COLOR_CLASSES as Record<string, MobileMenuColorClasses>)[color] ??
    MOBILE_MENU_COLOR_CLASSES.primary
  );
}

/** Calendar event type color classes (for client-side JS) */
export const CALENDAR_EVENT_COLORS: Record<
  string,
  { bg: string; text: string; border: string; borderLeft: string }
> = {
  primary: {
    bg: "bg-primary/10",
    text: "text-primary-text",
    border: "border-primary/20",
    borderLeft: "border-l-primary",
  },
  success: {
    bg: "bg-success/10",
    text: "text-success-text",
    border: "border-success/20",
    borderLeft: "border-l-success",
  },
  info: {
    bg: "bg-info/10",
    text: "text-info-text",
    border: "border-info/20",
    borderLeft: "border-l-info",
  },
  warning: {
    bg: "bg-warning/10",
    text: "text-warning-text",
    border: "border-warning/20",
    borderLeft: "border-l-warning",
  },
  error: {
    bg: "bg-error/10",
    text: "text-error-text",
    border: "border-error/20",
    borderLeft: "border-l-error",
  },
  accent: {
    bg: "bg-accent/10",
    text: "text-foreground",
    border: "border-accent/20",
    borderLeft: "border-l-accent",
  },
};

/** Breadcrumb hover/active color classes */
export interface BreadcrumbColorClasses {
  hoverText: string;
  darkHoverText: string;
  groupHoverText: string;
}

export const BREADCRUMB_COLOR_CLASSES = {
  primary: {
    hoverText: "hover:text-primary-text",
    darkHoverText: "dark:hover:text-primary-text",
    groupHoverText: "group-hover:text-primary-text",
  },
  success: {
    hoverText: "hover:text-success-text",
    darkHoverText: "dark:hover:text-success-text",
    groupHoverText: "group-hover:text-success-text",
  },
  info: {
    hoverText: "hover:text-info-text",
    darkHoverText: "dark:hover:text-info-text",
    groupHoverText: "group-hover:text-info-text",
  },
  warning: {
    hoverText: "hover:text-warning-text",
    darkHoverText: "dark:hover:text-warning-text",
    groupHoverText: "group-hover:text-warning-text",
  },
  error: {
    hoverText: "hover:text-error-text",
    darkHoverText: "dark:hover:text-error-text",
    groupHoverText: "group-hover:text-error-text",
  },
  accent: {
    hoverText: "hover:text-foreground",
    darkHoverText: "dark:hover:text-foreground",
    groupHoverText: "group-hover:text-foreground",
  },
  secondary: {
    hoverText: "hover:text-foreground",
    darkHoverText: "dark:hover:text-foreground",
    groupHoverText: "group-hover:text-foreground",
  },
  neutral: {
    hoverText: "hover:text-foreground",
    darkHoverText: "dark:hover:text-foreground",
    groupHoverText: "group-hover:text-foreground",
  },
};

export function getBreadcrumbColorClasses(
  color: ColorVariant | string = "primary",
): BreadcrumbColorClasses {
  return (
    (BREADCRUMB_COLOR_CLASSES as Record<string, BreadcrumbColorClasses>)[color] ??
    BREADCRUMB_COLOR_CLASSES.primary
  );
}

export const COLOR_VARIANTS: readonly ColorVariant[] = [
  "primary",
  "success",
  "info",
  "warning",
  "error",
  "accent",
  "secondary",
  "neutral",
] as const;

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return {
    r: Number.parseInt(result[1]!, 16),
    g: Number.parseInt(result[2]!, 16),
    b: Number.parseInt(result[3]!, 16),
  };
}

export function getDarkenedRgba(hex: string, darkenFactor: number, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const r = Math.round(rgb.r * darkenFactor);
  const g = Math.round(rgb.g * darkenFactor);
  const b = Math.round(rgb.b * darkenFactor);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
