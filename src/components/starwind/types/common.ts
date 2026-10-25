/** Common TypeScript types and interfaces shared across sites. */

import type { ImageMetadata } from "astro";
import type { HTMLAttributes } from "astro/types";

import type { ColorVariant } from "./colors";

// Re-export ColorVariant from centralized location for convenience
/** Base props that all components can extend */
export type ServiceMode = "remote" | "in-person" | "choice";

export interface BaseProps {
  class?: string;
  id?: string;
}

/** Props for components that can have custom HTML attributes */
export type WithHTMLAttributes<T = object> = T & HTMLAttributes<"div">;

/** Navigation link structure */
export interface NavLink {
  href: string;
  text: string;
  ariaLabel?: string;
  external?: boolean;
  icon?: string;
  image?: string | ImageMetadata;
  imageAlt?: string;
  badge?: string;
  color?: ColorVariant;
  description?: string;
  children?: NavLink[];
}

/** Image props supporting both static imports and public paths */
export interface ImageProps {
  src: ImageMetadata | string;
  alt: string;
  width?: number;
  height?: number;
  loading?: "lazy" | "eager";
  format?: "webp" | "avif" | "png" | "jpg";
}

/**
 * Call to action button/link props.
 *
 * The `variant` subset ("primary" | "secondary" | "outline" | "ghost") is intentionally narrower
 * than the full ButtonVariant palette. CTA contexts should only surface high-intent visual
 * treatments; decorative or low-emphasis variants (e.g. "link", "soft") are excluded by design.
 */
export interface CTAProps {
  text: string;
  href: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  external?: boolean;
  ariaLabel?: string;
}

/** Heading level for semantic HTML */
export type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

/** Icon size presets - maps size names to Tailwind classes */
export const ICON_SIZES = {
  xs: "size-4",
  sm: "size-6",
  md: "size-8",
  lg: "size-10",
  xl: "size-12",
  "2xl": "size-16",
} as const;

export type IconSize = keyof typeof ICON_SIZES;

/** Stagger animation delays for sequential reveals */
export const STAGGER_DELAYS = {
  1: "0.1s",
  2: "0.2s",
  3: "0.3s",
  4: "0.4s",
  5: "0.5s",
  6: "0.6s",
} as const;

export type StaggerLevel = keyof typeof STAGGER_DELAYS;

/** Size variants for components */
export type SizeVariant = "xs" | "sm" | "md" | "lg" | "xl";

/** Alignment options */
export type Alignment = "left" | "center" | "right";

/** Spacing scale matching Tailwind */
export type SpacingScale = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 24 | 32;
