import { twMerge } from "tailwind-merge";
export type AlertVariant =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "neutral"
  | "primary"
  | "secondary"
  | "accent";
export type AlertStyle = "default" | "outline" | "soft" | "dash" | "shadow";
export type AlertSize = "sm" | "md" | "lg";
export type AlertIconPosition = "left" | "top" | "none";

export const variantClasses: Record<AlertVariant, string> = {
  info: "border-info bg-info text-info-foreground",
  success: "border-success bg-success text-success-foreground",
  warning: "border-warning bg-warning text-warning-foreground",
  error: "border-error bg-error text-error-foreground",
  neutral: "border-border bg-muted text-foreground",
  primary: "border-primary bg-primary text-primary-foreground",
  secondary: "border-secondary bg-secondary text-secondary-foreground",
  accent: "border-accent bg-accent text-accent-foreground",
};

export const styleClasses: Record<AlertStyle, string> = {
  default: "",
  outline: "bg-transparent",
  soft: "",
  dash: "border-dashed bg-transparent",
  shadow: "shadow-lg",
};

const softVariantClasses: Record<AlertVariant, string> = {
  info: "border-info/30 bg-info/10 text-info-text",
  success: "border-success/30 bg-success/10 text-success-text",
  warning: "border-warning/30 bg-warning/10 text-warning-text",
  error: "border-error/30 bg-error/10 text-error-text",
  neutral: "border-border bg-muted text-foreground",
  primary: "border-primary/30 bg-primary/10 text-primary-text",
  secondary: "border-secondary/30 bg-secondary/10 text-foreground",
  accent: "border-accent/30 bg-accent/10 text-foreground",
};

const outlineVariantClasses: Record<AlertVariant, string> = {
  info: "border-info/50 text-info-text",
  success: "border-success/50 text-success-text",
  warning: "border-warning/50 text-warning-text",
  error: "border-error/50 text-error-text",
  neutral: "border-border text-foreground",
  primary: "border-primary/50 text-primary-text",
  secondary: "border-secondary/50 text-foreground",
  accent: "border-accent/50 text-foreground",
};

export interface AlertSizeClasses {
  root: string;
  icon: string;
  title: string;
  body: string;
  dismissButton: string;
}

export interface AlertLayoutClasses {
  main: string;
  body: string;
  icon: string;
  actions: string;
}

export const sizeClasses: Record<AlertSize, AlertSizeClasses> = {
  sm: {
    root: "px-3 py-2.5 text-sm",
    icon: "size-5",
    title: "text-sm",
    body: "text-xs leading-5",
    dismissButton:
      "rounded-full p-1 text-current/55 transition hover:bg-background/45 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/35",
  },
  md: {
    root: "px-4 py-3 text-sm",
    icon: "size-6",
    title: "text-base",
    body: "text-sm leading-6",
    dismissButton:
      "rounded-full p-1.5 text-current/55 transition hover:bg-background/45 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/35",
  },
  lg: {
    root: "px-5 py-4 text-base",
    icon: "size-7",
    title: "text-lg",
    body: "text-base leading-7",
    dismissButton:
      "rounded-full p-2 text-current/55 transition hover:bg-background/45 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/35",
  },
};

export const layoutClasses: Record<AlertIconPosition, AlertLayoutClasses> = {
  left: {
    main: "flex items-start gap-3",
    body: "min-w-0 flex-1",
    icon: "mt-0.5 shrink-0",
    actions: "flex flex-wrap items-center gap-2 justify-end",
  },
  top: {
    main: "flex flex-col items-start gap-3",
    body: "min-w-0 w-full",
    icon: "shrink-0 rounded-full bg-background/50 p-2",
    actions: "flex flex-wrap items-center gap-2 justify-start",
  },
  none: {
    main: "flex flex-col items-start gap-2",
    body: "min-w-0 w-full",
    icon: "",
    actions: "flex flex-wrap items-center gap-2 justify-start",
  },
};

export const defaultIcons: Record<AlertVariant, string> = {
  info: "material-symbols:info",
  success: "material-symbols:check-circle",
  warning: "material-symbols:warning",
  error: "material-symbols:cancel",
  neutral: "material-symbols:info", // Fallback for neutral
  primary: "material-symbols:info",
  secondary: "material-symbols:info",
  accent: "material-symbols:info",
};

export function getAlertClasses(
  variant: AlertVariant,
  style: AlertStyle = "default",
  size: AlertSize = "md",
  className?: string,
): string {
  const colorClasses =
    style === "soft"
      ? softVariantClasses[variant]
      : style === "outline" || style === "dash"
        ? outlineVariantClasses[variant]
        : variantClasses[variant];
  return twMerge(
    [
      "flex flex-col items-stretch gap-3 rounded-lg border",
      colorClasses,
      styleClasses[style],
      sizeClasses[size].root,
      className,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function getAlertIcon(variant: AlertVariant, icon?: string): string {
  return icon || defaultIcons[variant];
}

export function getAlertSizeClasses(size: AlertSize = "md"): AlertSizeClasses {
  return sizeClasses[size] ?? sizeClasses.md;
}

export function getAlertLayoutClasses(
  iconPosition: AlertIconPosition = "left",
): AlertLayoutClasses {
  return layoutClasses[iconPosition] ?? layoutClasses.left;
}
