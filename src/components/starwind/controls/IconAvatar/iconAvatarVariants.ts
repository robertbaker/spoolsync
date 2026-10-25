import { twMerge } from "tailwind-merge";

import { getIconAvatarColors, type ColorVariant } from "../../lib/colors.ts";

export const ICON_SIZES = {
  xs: "size-4",
  sm: "size-6",
  md: "size-8",
  lg: "size-10",
  xl: "size-12",
  "2xl": "size-16",
} as const;

export type IconSize = keyof typeof ICON_SIZES;

export const ICON_AVATAR_CONTAINER_SIZES = {
  sm: "size-10",
  md: "size-12",
  lg: "size-14",
  xl: "size-16",
} as const;

export type IconAvatarContainerSize = keyof typeof ICON_AVATAR_CONTAINER_SIZES;

export const ICON_AVATAR_ROUNDED_CLASSES = {
  box: "rounded-xl",
  field: "rounded-md",
  full: "rounded-full",
} as const;

export type IconAvatarRounded = keyof typeof ICON_AVATAR_ROUNDED_CLASSES;

export interface IconAvatarClassOptions {
  color?: ColorVariant | undefined;
  containerSize?: IconAvatarContainerSize | undefined;
  rounded?: IconAvatarRounded | undefined;
  contrast?: boolean | undefined;
  className?: string | undefined;
}

export function getIconAvatarContainerClasses({
  color = "primary",
  containerSize = "md",
  rounded = "field",
  contrast = false,
  className = "",
}: IconAvatarClassOptions = {}): string {
  if (contrast) {
    return twMerge(
      [
        "flex",
        "shrink-0",
        "items-center",
        "justify-center",
        "bg-current/20 text-current",
        ICON_AVATAR_ROUNDED_CLASSES[rounded],
        ICON_AVATAR_CONTAINER_SIZES[containerSize],
        className,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  const colorConfig = getIconAvatarColors(color);

  return twMerge(
    [
      "flex",
      "shrink-0",
      "items-center",
      "justify-center",
      colorConfig.bg,
      colorConfig.text,
      ICON_AVATAR_ROUNDED_CLASSES[rounded],
      ICON_AVATAR_CONTAINER_SIZES[containerSize],
      className,
    ]
      .filter(Boolean)
      .join(" "),
  );
}
