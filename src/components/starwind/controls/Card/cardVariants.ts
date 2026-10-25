import { twMerge } from "tailwind-merge";
export type CardVariant =
  | "default"
  | "bordered"
  | "elevated"
  | "compact"
  | "side"
  | "image-full"
  | "glass";

export type CardColor =
  | "base"
  | "primary"
  | "secondary"
  | "neutral"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "error";

export const variantClasses: Record<CardVariant, string> = {
  default:
    "relative flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground",
  bordered:
    "relative flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground hover:border-current",
  elevated:
    "relative flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg hover:shadow-2xl",
  compact:
    "relative flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-md hover:shadow-xl",
  side: "relative flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground sm:flex-row",
  "image-full":
    "relative flex min-h-64 flex-col justify-end overflow-hidden rounded-xl border bg-card text-card-foreground",
  glass:
    "relative flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card/60 text-card-foreground shadow-lg backdrop-blur-md dark:border-foreground/20 dark:bg-foreground/10",
};

export const colorClasses: Record<CardColor, string> = {
  base: "border-border",
  primary: "border-primary/20 hover:border-primary",
  secondary: "border-secondary/20 hover:border-secondary",
  neutral: "border-foreground/20 hover:border-foreground",
  accent: "border-accent/20 hover:border-accent",
  info: "border-info/20 hover:border-info",
  success: "border-success/20 hover:border-success",
  warning: "border-warning/20 hover:border-warning",
  error: "border-error/20 hover:border-error",
};

export const interactiveClasses =
  "motion-safe:hover:-translate-y-2 active:scale-[0.98] transition-all duration-300 motion-reduce:transition-none cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export function getCardClasses(
  variant: CardVariant,
  color: CardColor,
  interactive: boolean,
  className?: string,
): string {
  const effectiveColorClass = (colorClasses as Record<string, string>)[color] ?? colorClasses.base;

  return twMerge(
    [variantClasses[variant], effectiveColorClass, interactive ? interactiveClasses : "", className]
      .filter(Boolean)
      .join(" "),
  );
}

export type AnchorPosition =
  | "bottom-right"
  | "bottom-left"
  | "bottom-center"
  | "top-right"
  | "top-left"
  | "between";

export const anchorPositionClasses: Record<AnchorPosition, string> = {
  "top-left": "top-4 left-4",
  "top-right": "top-4 right-4",
  "bottom-left": "bottom-4 left-4",
  "bottom-right": "bottom-4 right-4",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
  between: "bottom-4 inset-x-4 flex justify-between",
};

export const footerPositionClasses: Record<AnchorPosition, string> = {
  "bottom-right": "justify-end",
  "bottom-left": "justify-start",
  "bottom-center": "justify-center",
  between: "justify-between",
  "top-right": "justify-end",
  "top-left": "justify-start",
};
