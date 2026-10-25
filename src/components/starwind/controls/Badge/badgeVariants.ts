import { twMerge } from "tailwind-merge";
export type BadgeStyle = "solid" | "soft" | "outline" | "ghost" | "gradient" | "default";
export type BadgeShape = "default" | "pill" | "square" | "circle";
export type BadgeColor =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "error"
  | "warning"
  | "info"
  | "neutral"
  | "accent";
export type BadgeSize = "sm" | "md" | "lg" | "xl";

export const solidColorClasses: Record<BadgeColor, string> = {
  primary: "border-primary bg-primary text-primary-foreground",
  secondary: "border-secondary bg-secondary text-secondary-foreground",
  success: "border-success bg-success text-success-foreground",
  danger: "border-error bg-error text-error-foreground",
  error: "border-error bg-error text-error-foreground",
  warning: "border-warning bg-warning text-warning-foreground",
  info: "border-info bg-info text-info-foreground",
  neutral: "border-border bg-muted text-foreground",
  accent: "border-accent bg-accent text-accent-foreground",
};

export const softColorClasses: Record<BadgeColor, string> = {
  primary: "border-transparent bg-primary/10 text-primary-text",
  secondary: "border-transparent bg-secondary/10 text-foreground",
  success: "border-transparent bg-success/10 text-success-text",
  danger: "border-transparent bg-error/10 text-error-text",
  error: "border-transparent bg-error/10 text-error-text",
  warning: "border-transparent bg-warning/10 text-warning-text",
  info: "border-transparent bg-info/10 text-info-text",
  neutral: "border-transparent bg-muted text-foreground",
  accent: "border-transparent bg-accent/10 text-foreground",
};

export const outlineColorClasses: Record<BadgeColor, string> = {
  primary: "border-primary/30 bg-transparent text-primary-text",
  secondary: "border-secondary/30 bg-transparent text-foreground",
  success: "border-success/30 bg-transparent text-success-text",
  danger: "border-error/30 bg-transparent text-error-text",
  error: "border-error/30 bg-transparent text-error-text",
  warning: "border-warning/30 bg-transparent text-warning-text",
  info: "border-info/30 bg-transparent text-info-text",
  neutral: "border-border bg-transparent text-foreground",
  accent: "border-accent/30 bg-transparent text-foreground",
};

export const ghostColorClasses: Record<BadgeColor, string> = {
  primary: "border-transparent bg-transparent text-primary-text",
  secondary: "border-transparent bg-transparent text-foreground",
  success: "border-transparent bg-transparent text-success-text",
  danger: "border-transparent bg-error/10 text-error-text",
  error: "border-transparent bg-error/10 text-error-text",
  warning: "border-transparent bg-warning/10 text-warning-text",
  info: "border-transparent bg-info/10 text-info-text",
  neutral: "border-transparent bg-transparent text-foreground",
  accent: "border-transparent bg-transparent text-foreground",
};

export const colorClasses: Record<BadgeColor, string> = solidColorClasses;

export const shapeClasses: Record<BadgeShape, string> = {
  default: "",
  pill: "rounded-full",
  square: "aspect-square rounded-md px-0",
  circle: "aspect-square rounded-full px-0",
};

export const sizeClasses: Record<BadgeSize, { size: string; icon: string; text: string }> = {
  sm: { size: "h-4 px-1.5", icon: "size-3", text: "text-[0.625rem]" },
  md: { size: "h-5 px-2", icon: "size-3.5", text: "text-xs" },
  lg: { size: "h-6 px-2.5", icon: "size-4", text: "text-sm" },
  xl: { size: "h-7 px-3", icon: "size-5", text: "text-base" },
};

export function getBadgeClasses(
  color: BadgeColor | undefined,
  size: BadgeSize,
  isLink: boolean,
  style: BadgeStyle = "default",
  shape: BadgeShape = "default",
  className?: string,
): string {
  let shapeClass = shapeClasses[shape];
  if (shape === "pill" && !shapeClass) shapeClass = "rounded-full";

  const effectiveColor = color ?? "primary";
  let styleColorClass = "";
  if (style === "gradient") {
    styleColorClass =
      "border-transparent bg-linear-to-r from-primary to-primary-accent text-primary-foreground";
  } else if (style === "soft") {
    styleColorClass =
      (softColorClasses as Record<string, string>)[effectiveColor] ?? softColorClasses.primary;
  } else if (style === "outline") {
    styleColorClass =
      (outlineColorClasses as Record<string, string>)[effectiveColor] ??
      outlineColorClasses.primary;
  } else if (style === "ghost") {
    styleColorClass =
      (ghostColorClasses as Record<string, string>)[effectiveColor] ?? ghostColorClasses.primary;
  } else {
    styleColorClass =
      (solidColorClasses as Record<string, string>)[effectiveColor] ?? solidColorClasses.primary;
  }

  return twMerge(
    [
      "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border font-medium leading-none shadow-xs",
      styleColorClass,
      sizeClasses[size].size,
      sizeClasses[size].text,
      shapeClass,
      isLink ? "hover:scale-105 transition-transform duration-300 cursor-pointer" : "",
      "gap-1.5",
      "shadow-xs",
      className,
    ]
      .filter(Boolean)
      .join(" "),
  );
}
