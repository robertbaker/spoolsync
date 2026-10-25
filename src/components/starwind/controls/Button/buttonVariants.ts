import { twMerge } from "tailwind-merge";

import { sanitizeUrl } from "../../lib/safe-url.ts";

export type ButtonVariant =
  | "solid"
  | "outline"
  | "ghost"
  | "link"
  | "glass"
  | "soft"
  | "dash"
  | "gradient"
  | "text";

export type ButtonColor =
  | "primary"
  | "secondary"
  | "neutral"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "error";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";
export type ButtonShape = "square" | "circle" | "wide" | "block";

export const solidColorClasses: Record<ButtonColor, string> = {
  primary: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/80",
  neutral: "border-border bg-muted text-foreground hover:bg-muted/80",
  accent: "border-accent bg-accent text-accent-foreground hover:bg-accent/80",
  info: "border-info bg-info text-info-foreground hover:bg-info/90",
  success: "border-success bg-success text-success-foreground hover:bg-success/90",
  warning: "border-warning bg-warning text-warning-foreground hover:bg-warning/90",
  error: "border-error bg-error text-error-foreground hover:bg-error/90",
};

export const outlineColorClasses: Record<ButtonColor, string> = {
  primary:
    "border-primary/40 bg-transparent text-primary-text shadow-none hover:border-primary hover:bg-primary/10",
  secondary:
    "border-secondary/40 bg-transparent text-foreground shadow-none hover:border-secondary hover:bg-secondary/10",
  neutral:
    "border-border bg-transparent text-foreground shadow-none hover:bg-muted hover:border-border",
  accent:
    "border-accent/40 bg-transparent text-foreground shadow-none hover:border-accent hover:bg-accent/10",
  info: "border-info/40 bg-transparent text-info-text shadow-none hover:border-info hover:bg-info/10",
  success:
    "border-success/40 bg-transparent text-success-text shadow-none hover:border-success hover:bg-success/10",
  warning:
    "border-warning/40 bg-transparent text-warning-text shadow-none hover:border-warning hover:bg-warning/10",
  error:
    "border-error/40 bg-transparent text-error-text shadow-none hover:border-error hover:bg-error/10",
};

export const ghostColorClasses: Record<ButtonColor, string> = {
  primary: "border-transparent bg-transparent text-primary-text shadow-none hover:bg-primary/10",
  secondary: "border-transparent bg-transparent text-foreground shadow-none hover:bg-secondary/10",
  neutral: "border-transparent bg-transparent text-foreground shadow-none hover:bg-muted",
  accent: "border-transparent bg-transparent text-foreground shadow-none hover:bg-accent/10",
  info: "border-transparent bg-transparent text-info-text shadow-none hover:bg-info/10",
  success: "border-transparent bg-transparent text-success-text shadow-none hover:bg-success/10",
  warning: "border-transparent bg-transparent text-warning-text shadow-none hover:bg-warning/10",
  error: "border-transparent bg-transparent text-error-text shadow-none hover:bg-error/10",
};

export const softColorClasses: Record<ButtonColor, string> = {
  primary: "border-transparent bg-primary/10 text-primary-text shadow-none hover:bg-primary/20",
  secondary: "border-transparent bg-secondary/10 text-foreground shadow-none hover:bg-secondary/20",
  neutral: "border-transparent bg-muted text-foreground shadow-none hover:bg-muted/80",
  accent: "border-transparent bg-accent/10 text-foreground shadow-none hover:bg-accent/20",
  info: "border-transparent bg-info/10 text-info-text shadow-none hover:bg-info/20",
  success: "border-transparent bg-success/10 text-success-text shadow-none hover:bg-success/20",
  warning: "border-transparent bg-warning/10 text-warning-text shadow-none hover:bg-warning/20",
  error: "border-transparent bg-error/10 text-error-text shadow-none hover:bg-error/20",
};

export const dashColorClasses: Record<ButtonColor, string> = {
  primary:
    "border-dashed border-primary/40 bg-transparent text-primary-text shadow-none hover:bg-primary/10",
  secondary:
    "border-dashed border-secondary/40 bg-transparent text-foreground shadow-none hover:bg-secondary/10",
  neutral: "border-dashed border-border bg-transparent text-foreground shadow-none hover:bg-muted",
  accent:
    "border-dashed border-accent/40 bg-transparent text-foreground shadow-none hover:bg-accent/10",
  info: "border-dashed border-info/40 bg-transparent text-info-text shadow-none hover:bg-info/10",
  success:
    "border-dashed border-success/40 bg-transparent text-success-text shadow-none hover:bg-success/10",
  warning:
    "border-dashed border-warning/40 bg-transparent text-warning-text shadow-none hover:bg-warning/10",
  error:
    "border-dashed border-error/40 bg-transparent text-error-text shadow-none hover:bg-error/10",
};

export const linkColorClasses: Record<ButtonColor, string> = {
  primary:
    "border-transparent bg-transparent text-primary-text p-0 shadow-none underline-offset-4 hover:underline",
  secondary:
    "border-transparent bg-transparent text-foreground p-0 shadow-none underline-offset-4 hover:underline",
  neutral:
    "border-transparent bg-transparent text-foreground p-0 shadow-none underline-offset-4 hover:underline",
  accent:
    "border-transparent bg-transparent text-foreground p-0 shadow-none underline-offset-4 hover:underline",
  info: "border-transparent bg-transparent text-info-text p-0 shadow-none underline-offset-4 hover:underline",
  success:
    "border-transparent bg-transparent text-success-text p-0 shadow-none underline-offset-4 hover:underline",
  warning:
    "border-transparent bg-transparent text-warning-text p-0 shadow-none underline-offset-4 hover:underline",
  error:
    "border-transparent bg-transparent text-error-text p-0 shadow-none underline-offset-4 hover:underline",
};

export const textColorClasses: Record<ButtonColor, string> = {
  primary: "border-transparent bg-transparent text-primary-text px-0 shadow-none hover:opacity-75",
  secondary: "border-transparent bg-transparent text-foreground px-0 shadow-none hover:opacity-75",
  neutral: "border-transparent bg-transparent text-foreground px-0 shadow-none hover:opacity-75",
  accent: "border-transparent bg-transparent text-foreground px-0 shadow-none hover:opacity-75",
  info: "border-transparent bg-transparent text-info-text px-0 shadow-none hover:opacity-75",
  success: "border-transparent bg-transparent text-success-text px-0 shadow-none hover:opacity-75",
  warning: "border-transparent bg-transparent text-warning-text px-0 shadow-none hover:opacity-75",
  error: "border-transparent bg-transparent text-error-text px-0 shadow-none hover:opacity-75",
};

export const variantClasses: Record<ButtonVariant, string> = {
  solid: "",
  outline: "shadow-none",
  ghost: "border-transparent bg-transparent shadow-none",
  link: "border-transparent bg-transparent p-0 shadow-none underline-offset-4 hover:underline",
  glass:
    "border-border/40 bg-card/60 text-foreground shadow-xs backdrop-blur-md hover:bg-card/80 dark:border-foreground/20 dark:bg-foreground/10 dark:hover:bg-foreground/20",
  soft: "border-transparent shadow-none",
  dash: "border-dashed shadow-none",
  gradient:
    "border-transparent bg-linear-to-r from-primary via-primary-accent to-secondary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 hover:opacity-95 transition-all duration-300",
  text: "border-transparent bg-transparent px-0 shadow-none hover:opacity-75",
};

export const colorClasses: Record<ButtonColor, string> = solidColorClasses;

export const sizeClasses: Record<ButtonSize, string> = {
  xs: "h-7 gap-1 rounded-md px-2 text-xs",
  sm: "h-8 gap-1.5 rounded-md px-3 text-xs",
  md: "h-9 px-4 py-2 text-sm",
  lg: "h-10 px-5 text-base",
  xl: "h-12 rounded-lg px-6 text-base",
};

export const shapeClasses: Record<ButtonShape, string> = {
  square: "aspect-square px-0",
  circle: "aspect-square rounded-full px-0",
  wide: "min-w-40",
  block: "flex w-full",
};

export const baseClasses =
  "group relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-md border font-medium shadow-xs transition-[color,background-color,border-color,box-shadow,transform,opacity] outline-none focus-visible:ring-2 focus-visible:ring-outline/50 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

export function getButtonClasses(
  variant: ButtonVariant,
  color: ButtonColor | undefined,
  size: ButtonSize,
  shapes: ButtonShape[],
  fullWidth: boolean,
  className?: string,
  noAnimation = false,
): string {
  const shapeClassNames = shapes.map((s) => shapeClasses[s]).join(" ");

  let variantStyle = "";
  if (variant === "glass") {
    variantStyle = variantClasses.glass;
  } else if (variant === "gradient") {
    variantStyle = variantClasses.gradient;
  } else {
    const effectiveColor = color ?? "primary";
    switch (variant) {
      case "outline":
        variantStyle =
          (outlineColorClasses as Record<string, string>)[effectiveColor] ??
          outlineColorClasses.primary;
        break;
      case "ghost":
        variantStyle =
          (ghostColorClasses as Record<string, string>)[effectiveColor] ??
          ghostColorClasses.primary;
        break;
      case "soft":
        variantStyle =
          (softColorClasses as Record<string, string>)[effectiveColor] ?? softColorClasses.primary;
        break;
      case "dash":
        variantStyle =
          (dashColorClasses as Record<string, string>)[effectiveColor] ?? dashColorClasses.primary;
        break;
      case "link":
        variantStyle =
          (linkColorClasses as Record<string, string>)[effectiveColor] ?? linkColorClasses.primary;
        break;
      case "text":
        variantStyle =
          (textColorClasses as Record<string, string>)[effectiveColor] ?? textColorClasses.primary;
        break;
      case "solid":
      default:
        variantStyle =
          (solidColorClasses as Record<string, string>)[effectiveColor] ??
          solidColorClasses.primary;
        break;
    }
  }

  return twMerge(
    [
      baseClasses,
      noAnimation ? "" : "motion-safe:active:scale-[0.98]",
      variantStyle,
      sizeClasses[size],
      shapeClassNames,
      fullWidth ? "w-full" : "",
      className,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function getLinkProps(
  href?: string,
  external: boolean = false,
): Record<string, string | undefined> {
  const safeHref = sanitizeUrl(href);
  if (!safeHref) return {};
  return {
    href: safeHref,
    target: external ? "_blank" : undefined,
    rel: external ? "noopener noreferrer" : undefined,
  };
}
