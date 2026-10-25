import { twMerge } from "tailwind-merge";
export type ContainerSize = "sm" | "md" | "lg" | "xl" | "full";

const sizeMap: Record<ContainerSize, string> = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-7xl",
  xl: "max-w-screen-2xl",
  full: "w-full",
};

export function getContainerClasses(
  size: ContainerSize = "lg",
  centered: boolean = true,
  className?: string,
): string {
  return twMerge(
    [sizeMap[size], centered ? "mx-auto" : "", "px-4 sm:px-6 lg:px-8", className]
      .filter(Boolean)
      .join(" "),
  );
}
