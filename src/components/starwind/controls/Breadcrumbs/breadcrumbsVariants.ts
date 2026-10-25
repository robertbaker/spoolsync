import type { HTMLAttributes } from "astro/types";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
  linkAttributes?: HTMLAttributes<"a">;
}
import { slugify } from "../../lib/string";

/** Calculates animation delays for staggered fade-in effect */
export function getAnimationDelays(items: BreadcrumbItem[]): string[] {
  return items.map((_, index) => `${index * 0.1}s`);
}

export type BreadcrumbColor =
  | "primary"
  | "secondary"
  | "accent"
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "error";

export type BreadcrumbVariant = "default" | "compact" | "pills" | "line";
export type BreadcrumbSize = "sm" | "md" | "lg";
export type BreadcrumbSeparator = "chevron" | "slash" | "dot" | "arrow";

export interface BreadcrumbRenderClasses {
  nav: string;
  shell: string;
  list: string;
  item: string;
  link: string;
  homeLink: string;
  current: string;
  homeIcon: string;
  separator: string;
}

export interface BreadcrumbSeparatorConfig {
  icon?: string;
  text?: string;
  className: string;
}

export const colorClasses: Record<BreadcrumbColor, string> = {
  primary: "text-primary-text hover:text-primary-focus",
  secondary: "text-foreground hover:text-secondary-focus",
  accent: "text-foreground hover:text-accent-focus",
  neutral: "text-foreground hover:text-neutral-focus",
  info: "text-info-text hover:text-info-focus",
  success: "text-success-text hover:text-success-focus",
  warning: "text-warning-text hover:text-warning-focus",
  error: "text-error-text hover:text-error-focus",
};

export const breadcrumbSeparatorConfigs: Record<BreadcrumbSeparator, BreadcrumbSeparatorConfig> = {
  chevron: {
    icon: "material-symbols:chevron-right",
    className: "rtl:rotate-180",
  },
  slash: {
    text: "/",
    className: "font-semibold",
  },
  dot: {
    text: "•",
    className: "font-semibold leading-none",
  },
  arrow: {
    icon: "material-symbols:arrow-forward-ios",
    className: "rtl:rotate-180",
  },
};

const breadcrumbSizeClasses: Record<
  BreadcrumbSize,
  {
    label: string;
    shellPadding: string;
    chipPadding: string;
    homeIcon: string;
    separator: string;
  }
> = {
  sm: {
    label: "text-xs",
    shellPadding: "px-3 py-1.5",
    chipPadding: "px-2.5 py-1",
    homeIcon: "size-3",
    separator: "text-xs",
  },
  md: {
    label: "text-sm",
    shellPadding: "px-4 py-2",
    chipPadding: "px-3 py-1.5",
    homeIcon: "size-4",
    separator: "text-sm",
  },
  lg: {
    label: "text-base",
    shellPadding: "px-5 py-2.5",
    chipPadding: "px-3.5 py-2",
    homeIcon: "size-5",
    separator: "text-base",
  },
};

export function getBreadcrumbSeparatorConfig(
  separator: BreadcrumbSeparator,
): BreadcrumbSeparatorConfig {
  return breadcrumbSeparatorConfigs[separator] ?? breadcrumbSeparatorConfigs.chevron;
}

export function getBreadcrumbRenderClasses(
  variant: BreadcrumbVariant,
  size: BreadcrumbSize,
): BreadcrumbRenderClasses {
  const resolvedSize = breadcrumbSizeClasses[size] ?? breadcrumbSizeClasses.md;

  switch (variant) {
    case "compact":
      return {
        nav: "w-fit",
        shell: "border-0 bg-transparent px-0 py-0 shadow-none",
        list: "inline-flex flex-wrap items-center gap-1.5",
        item: "inline-flex items-center gap-1.5",
        link: `${resolvedSize.label} font-medium text-current transition-colors duration-300 hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm`,
        homeLink: `${resolvedSize.label} inline-flex items-center gap-2 font-medium text-current transition-colors duration-300 hover:underline underline-offset-4 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm`,
        current: `${resolvedSize.label} font-semibold text-current`,
        homeIcon: `${resolvedSize.homeIcon} shrink-0 transition-transform duration-300`,
        separator: `${resolvedSize.separator} shrink-0 text-current opacity-60`,
      };
    case "pills":
      return {
        nav: "w-fit",
        shell: `${resolvedSize.shellPadding} rounded-[1.75rem] border border-border/40 bg-card/60 shadow-lg backdrop-blur-xl`,
        list: "inline-flex flex-wrap items-center gap-2",
        item: "inline-flex items-center gap-2",
        link: `${resolvedSize.label} ${resolvedSize.chipPadding} inline-flex items-center gap-2 rounded-full border border-current/15 bg-card/60 font-medium text-current shadow-sm transition-all duration-300 hover:border-current/30 hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`,
        homeLink: `${resolvedSize.label} ${resolvedSize.chipPadding} inline-flex items-center gap-2 rounded-full border border-current/15 bg-card/60 font-medium text-current shadow-sm transition-all duration-300 hover:border-current/30 hover:bg-card/90 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`,
        current: `${resolvedSize.label} ${resolvedSize.chipPadding} inline-flex items-center gap-2 rounded-full border border-current/20 bg-muted font-semibold text-current shadow-sm`,
        homeIcon: `${resolvedSize.homeIcon} shrink-0 transition-transform duration-300`,
        separator: `${resolvedSize.separator} shrink-0 text-current opacity-55`,
      };
    case "line":
      return {
        nav: "w-full",
        shell: "w-full border-b border-border/40 bg-transparent px-0 pb-3 pt-0 shadow-none",
        list: "inline-flex flex-wrap items-center gap-2",
        item: "inline-flex items-center gap-2",
        link: `${resolvedSize.label} inline-flex items-center gap-2 border-b border-transparent pb-1 font-medium text-current transition-colors duration-300 hover:border-current/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`,
        homeLink: `${resolvedSize.label} inline-flex items-center gap-2 border-b border-transparent pb-1 font-medium text-current transition-colors duration-300 hover:border-current/30 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`,
        current: `${resolvedSize.label} inline-flex items-center gap-2 border-b border-current/25 pb-1 font-semibold text-current`,
        homeIcon: `${resolvedSize.homeIcon} shrink-0 transition-transform duration-300`,
        separator: `${resolvedSize.separator} shrink-0 text-current opacity-60`,
      };
    case "default":
    default:
      return {
        nav: "w-fit",
        shell: `${resolvedSize.shellPadding} rounded-full border border-border/50 bg-card/70 shadow-sm backdrop-blur-md transition-all duration-300 hover:shadow-md`,
        list: "inline-flex flex-wrap items-center gap-1.5 md:gap-2",
        item: "inline-flex items-center gap-1.5",
        link: `${resolvedSize.label} font-medium text-current transition-colors duration-300 hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm`,
        homeLink: `${resolvedSize.label} inline-flex items-center gap-2 font-medium text-current transition-colors duration-300 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm`,
        current: `${resolvedSize.label} font-medium text-current`,
        homeIcon: `${resolvedSize.homeIcon} shrink-0 transition-transform duration-300`,
        separator: `${resolvedSize.separator} shrink-0 text-current opacity-60`,
      };
  }
}

/** Computes a deterministic aria-label for accessibility */
export function computeAriaLabel(
  ariaLabel: string | undefined,
  dataTestid: string,
  items: BreadcrumbItem[],
): string {
  if (ariaLabel) return ariaLabel;
  const slugifiedLabels = slugify(items.map((i) => i.label).join("-"));
  return `Breadcrumb ${dataTestid}-${slugifiedLabels}`;
}
