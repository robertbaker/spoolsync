import { twMerge } from "tailwind-merge";
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AvatarShape = "circle" | "square" | "squircle";
export type AvatarStatus = "online" | "offline" | "busy" | "away";

export function getAvatarGroupLimit(available: number, max?: number): number {
  return max !== undefined && Number.isFinite(max) ? Math.max(0, Math.floor(max)) : available;
}

export const sizeClasses: Record<AvatarSize, string> = {
  xs: "w-8",
  sm: "w-10",
  md: "w-12",
  lg: "w-16",
  xl: "w-24",
};

export const shapeClasses: Record<AvatarShape, string> = {
  circle: "rounded-full",
  square: "rounded",
  squircle: "rounded-[30%]",
};

export type AvatarRingColor =
  | "primary"
  | "secondary"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral";

const ringColorClasses: Record<AvatarRingColor, string> = {
  primary: "ring-primary",
  secondary: "ring-secondary",
  accent: "ring-accent",
  success: "ring-success",
  warning: "ring-warning",
  error: "ring-error",
  info: "ring-info",
  neutral: "ring-foreground",
};

export function getAvatarClasses(_status?: AvatarStatus, className?: string): string {
  return twMerge(["relative inline-flex shrink-0", className].filter(Boolean).join(" "));
}

/**
 * Tailwind ring utilities for a ringed avatar (pro "highlighted" look). Returns an empty string
 * when `ring` is false.
 */
export function getRingClasses(ring?: boolean, ringColor: AvatarRingColor = "primary"): string {
  if (!ring) return "";
  return `ring-2 ring-offset-2 ring-offset-background ${ringColorClasses[ringColor]}`;
}

const statusDotColors: Record<AvatarStatus, string> = {
  online: "bg-success",
  offline: "bg-border",
  busy: "bg-error",
  away: "bg-warning",
};

/**
 * Classes for an explicit status dot, used for `busy` / `away` (and available for any status).
 * Positioned bottom-end over the avatar.
 */
export function getStatusDotClasses(status: AvatarStatus): string {
  return [
    "absolute bottom-0 end-0 z-10 block size-1/4 rounded-full border-2 border-background",
    statusDotColors[status],
  ].join(" ");
}

export function getInnerClasses(size: AvatarSize = "md", shape: AvatarShape = "circle"): string {
  return twMerge(
    [sizeClasses[size], "aspect-square", shapeClasses[shape]].filter(Boolean).join(" "),
  );
}
