import type { ImageMetadata } from "astro";
import type { HTMLAttributes } from "astro/types";

import type { ClassesProps } from "../../lib/classes";
import type { AvatarSize, AvatarShape, AvatarStatus, AvatarRingColor } from "./avatarVariants";

export type AvatarPart =
  /** The sized, shaped frame that clips the image and initials. */
  | "inner"
  /** Initials fallback shown when there is no image or it fails to load. */
  | "fallback"
  | "image"
  | "statusDot";

export interface AvatarPresentationProps extends ClassesProps<AvatarPart> {
  /** Image source URL or metadata. */
  src?: string | ImageMetadata | undefined;
  /** Alt text for the image. */
  alt?: string | undefined;
  /** Display initials if no image is provided. */
  initials?: string | undefined;
  /** Fallback icon when no image or initials are provided. */
  icon?: string | undefined;
  /**
   * Size of the avatar.
   *
   * @default "md"
   */
  size?: AvatarSize;
  /**
   * Shape of the avatar.
   *
   * @default "circle"
   */
  shape?: AvatarShape;
  /**
   * Status indicator. `online`/`offline` use native R5 classes; `busy`/`away` render an explicit
   * colored status dot.
   */
  status?: AvatarStatus;
  /**
   * Adds a colored ring around the avatar (pro "highlighted" look).
   *
   * @default false
   */
  ring?: boolean;
  /**
   * Ring color when `ring` is enabled.
   *
   * @default "primary"
   */
  ringColor?: AvatarRingColor;
  /** Native image attributes, including loading, decoding, srcset and referrerpolicy. */
  imageProps?: Omit<HTMLAttributes<"img">, "src" | "alt" | "width" | "height">;
  /** Accessible description of the status indicator; omitted indicators are decorative. */
  statusLabel?: string;
}

/** Per-person Avatar props used by the data-driven AvatarGroup. */
export interface AvatarGroupItem extends AvatarPresentationProps {
  class?: HTMLAttributes<"div">["class"];
}
