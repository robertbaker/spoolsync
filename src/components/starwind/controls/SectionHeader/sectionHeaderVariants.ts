import type { ColorVariant } from "../../lib/colors.ts";

export type SectionHeaderAlign = "left" | "center" | "right";
export type SectionHeaderVariant = "default" | "divider" | "gradient" | "panel";
export type SectionHeaderBadgeStyle = "solid" | "soft" | "outline" | "ghost";
export type SectionHeaderTitleAccent = "none" | "underline" | "highlight" | "marker";

export const titleAccentClasses: Record<SectionHeaderTitleAccent, string> = {
  none: "",
  underline: "underline decoration-primary decoration-4 underline-offset-8",
  highlight: "box-decoration-clone rounded-sm bg-primary/15 px-1 py-0.5",
  marker: "underline decoration-wavy decoration-secondary decoration-4 underline-offset-8",
};

export interface SectionHeaderAlignmentClasses {
  root: string;
  subtitle: string;
  accent: string;
}

export interface SectionHeaderAccentClasses {
  eyebrow: string;
  divider: string;
  gradient: string;
  panel: string;
  badgeSolid: string;
  badgeSoft: string;
  badgeOutline: string;
  badgeGhost: string;
}

export interface SectionHeaderVariantClasses {
  root: string;
  title: string;
  subtitle: string;
  accent: string;
}

export const alignmentClasses: Record<SectionHeaderAlign, SectionHeaderAlignmentClasses> = {
  left: {
    root: "text-left",
    subtitle: "mr-auto",
    accent: "mr-auto",
  },
  center: {
    root: "text-center",
    subtitle: "mx-auto",
    accent: "mx-auto",
  },
  right: {
    root: "text-right",
    subtitle: "ml-auto",
    accent: "ml-auto",
  },
};

export const accentClasses: Record<ColorVariant, SectionHeaderAccentClasses> = {
  primary: {
    eyebrow: "text-primary-text",
    divider: "bg-primary",
    gradient: "from-primary via-secondary to-primary-text",
    panel: "border-primary/15 bg-primary/6 shadow-primary/10",
    badgeSolid: "bg-primary text-primary-foreground",
    badgeSoft: "bg-primary/10 text-primary-text",
    badgeOutline: "border-primary/20 bg-primary/6 text-primary-text",
    badgeGhost: "border-transparent bg-primary/8 text-primary-text",
  },
  secondary: {
    eyebrow: "text-foreground",
    divider: "bg-secondary",
    gradient: "from-secondary via-primary to-primary-text",
    panel: "border-secondary/18 bg-secondary/6 shadow-secondary/10",
    badgeSolid: "bg-secondary text-secondary-foreground",
    badgeSoft: "bg-secondary/10 text-foreground",
    badgeOutline: "border-secondary/20 bg-secondary/6 text-foreground",
    badgeGhost: "border-transparent bg-secondary/8 text-foreground",
  },
  accent: {
    eyebrow: "text-foreground",
    divider: "bg-accent",
    gradient: "from-accent via-secondary to-primary",
    panel: "border-accent/18 bg-accent/6 shadow-accent/10",
    badgeSolid: "bg-accent text-accent-foreground",
    badgeSoft: "bg-accent/10 text-foreground",
    badgeOutline: "border-accent/20 bg-accent/6 text-foreground",
    badgeGhost: "border-transparent bg-accent/8 text-foreground",
  },
  success: {
    eyebrow: "text-success-text",
    divider: "bg-success",
    gradient: "from-success via-primary to-primary-text",
    panel: "border-success/18 bg-success/6 shadow-success/10",
    badgeSolid: "bg-success text-success-foreground",
    badgeSoft: "bg-success/10 text-success-text",
    badgeOutline: "border-success/20 bg-success/6 text-success-text",
    badgeGhost: "border-transparent bg-success/8 text-success-text",
  },
  info: {
    eyebrow: "text-info-text",
    divider: "bg-info",
    gradient: "from-info via-primary to-primary-text",
    panel: "border-info/18 bg-info/6 shadow-info/10",
    badgeSolid: "bg-info text-info-foreground",
    badgeSoft: "bg-info/10 text-info-text",
    badgeOutline: "border-info/20 bg-info/6 text-info-text",
    badgeGhost: "border-transparent bg-info/8 text-info-text",
  },
  warning: {
    eyebrow: "text-warning-text",
    divider: "bg-warning",
    gradient: "from-warning via-accent to-primary",
    panel: "border-warning/18 bg-warning/6 shadow-warning/10",
    badgeSolid: "bg-warning text-warning-foreground",
    badgeSoft: "bg-warning/10 text-warning-text",
    badgeOutline: "border-warning/20 bg-warning/6 text-warning-text",
    badgeGhost: "border-transparent bg-warning/8 text-warning-text",
  },
  error: {
    eyebrow: "text-error-text",
    divider: "bg-error",
    gradient: "from-error via-warning to-secondary",
    panel: "border-error/18 bg-error/6 shadow-error/10",
    badgeSolid: "bg-error text-error-foreground",
    badgeSoft: "bg-error/10 text-error-text",
    badgeOutline: "border-error/20 bg-error/6 text-error-text",
    badgeGhost: "border-transparent bg-error/8 text-error-text",
  },
  neutral: {
    eyebrow: "text-foreground",
    divider: "bg-foreground",
    gradient: "from-foreground via-primary to-secondary",
    panel: "border-foreground/18 bg-foreground/6 shadow-foreground/10",
    badgeSolid: "bg-foreground text-background",
    badgeSoft: "bg-foreground/10 text-foreground",
    badgeOutline: "border-foreground/20 bg-foreground/6 text-foreground",
    badgeGhost: "border-transparent bg-foreground/8 text-foreground",
  },
};

export function getSectionHeaderAlignmentClasses(
  align: SectionHeaderAlign,
): SectionHeaderAlignmentClasses {
  return alignmentClasses[align] ?? alignmentClasses.center;
}

export function getSectionHeaderAccentClasses(color: ColorVariant): SectionHeaderAccentClasses {
  return accentClasses[color] ?? accentClasses.primary;
}

export function getSectionHeaderBadgeClasses(
  badgeStyle: SectionHeaderBadgeStyle,
  color: ColorVariant,
): string {
  const accent = getSectionHeaderAccentClasses(color);

  switch (badgeStyle) {
    case "soft":
      return `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${accent.badgeSoft}`;
    case "outline":
      return `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${accent.badgeOutline}`;
    case "ghost":
      return `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${accent.badgeGhost}`;
    case "solid":
    default:
      return `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${accent.badgeSolid}`;
  }
}

export function getSectionHeaderVariantClasses(
  variant: SectionHeaderVariant,
  color: ColorVariant,
): SectionHeaderVariantClasses {
  const accent = getSectionHeaderAccentClasses(color);

  switch (variant) {
    case "divider":
      return {
        root: "mb-16",
        title:
          "text-4xl font-extrabold text-foreground font-display text-balance tracking-tight md:text-5xl",
        subtitle: "mt-6 max-w-3xl text-xl text-muted-foreground text-pretty",
        accent: `mt-5 h-1 w-24 rounded-full ${accent.divider}`,
      };
    case "gradient":
      return {
        root: "mb-16",
        title: `bg-linear-to-r ${accent.gradient} bg-clip-text text-4xl font-extrabold text-transparent font-display text-balance tracking-tight md:text-5xl`,
        subtitle: "mt-6 max-w-3xl text-xl text-muted-foreground text-pretty",
        accent: `mt-5 h-px w-full max-w-sm bg-linear-to-r ${accent.gradient}`,
      };
    case "panel":
      return {
        root: `mb-16 rounded-[2rem] border px-6 py-7 shadow-sm backdrop-blur-sm md:px-8 md:py-8 ${accent.panel}`,
        title:
          "text-3xl font-extrabold text-foreground font-display text-balance tracking-tight md:text-4xl",
        subtitle: "mt-5 max-w-3xl text-lg leading-8 text-muted-foreground text-pretty",
        accent: `mt-5 h-1 w-20 rounded-full ${accent.divider}`,
      };
    case "default":
    default:
      return {
        root: "mb-16",
        title:
          "mb-6 text-4xl font-extrabold text-foreground font-display text-balance tracking-tight md:text-5xl",
        subtitle: "max-w-3xl text-xl text-muted-foreground text-pretty",
        accent: "",
      };
  }
}

export function normalizeHeadingLevel(level: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (!Number.isFinite(level)) return 2;
  const normalized = Math.min(6, Math.max(1, Math.floor(level)));
  return normalized as 1 | 2 | 3 | 4 | 5 | 6;
}
