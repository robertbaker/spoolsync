export type PaginationColor =
  | "primary"
  | "secondary"
  | "accent"
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "error";

export const colorClasses: Record<PaginationColor, string> = {
  primary:
    "text-primary-text border-primary bg-primary/10 hover:bg-primary/20 hover:text-primary-text hover:border-primary",
  secondary:
    "text-foreground border-secondary bg-secondary/10 hover:bg-secondary/20 hover:text-foreground hover:border-secondary",
  accent:
    "text-foreground border-accent bg-accent/10 hover:bg-accent/20 hover:text-foreground hover:border-accent",
  neutral:
    "text-foreground border-foreground bg-foreground/10 hover:bg-foreground/20 hover:text-foreground hover:border-foreground",
  info: "text-info-text border-info bg-info/10 hover:bg-info/20 hover:text-info-text hover:border-info",
  success:
    "text-success-text border-success bg-success/10 hover:bg-success/20 hover:text-success-text hover:border-success",
  warning:
    "text-warning-text border-warning bg-warning/10 hover:bg-warning/20 hover:text-warning-text hover:border-warning",
  error:
    "text-error-text border-error bg-error/10 hover:bg-error/20 hover:text-error-text hover:border-error",
};

export const hoverBorderClasses: Record<PaginationColor, string> = {
  primary: "hover:border-primary border-primary/20",
  secondary: "hover:border-secondary border-secondary/20",
  accent: "hover:border-accent border-accent/20",
  neutral: "hover:border-foreground border-foreground/20",
  info: "hover:border-info border-info/20",
  success: "hover:border-success border-success/20",
  warning: "hover:border-warning border-warning/20",
  error: "hover:border-error border-error/20",
};

export function getPaginationClasses(
  isActive: boolean,
  color: PaginationColor = "primary",
): string {
  if (isActive) {
    return `flex items-center justify-center px-4 h-10 border-2 font-semibold shadow-md transition-all duration-300 scale-105 ${colorClasses[color]} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`;
  }
  return `flex items-center justify-center px-4 h-10 leading-tight text-foreground/80 bg-background border-2 ${hoverBorderClasses[color]} hover:bg-muted hover:text-foreground hover:shadow-md transition-all duration-300 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`;
}

export function getNavClasses(className: string = ""): string {
  return `flex items-center justify-center ${className}`.trim();
}
