/**
 * Astro Icon Type Definitions
 *
 * Type overrides for the astro-icon Icon component. Provides enhanced type safety for icon props.
 *
 * @module types/astro-icon
 */

declare module "astro-icon/components" {
  import type { AstroComponentFactory } from "astro";

  export const Icon: AstroComponentFactory & {
    (props: {
      name: string;
      "is:inline"?: boolean;
      title?: string;
      desc?: string;
      size?: number | string;
      width?: number | string;
      height?: number | string;
      class?: string;
      className?: string;
      [key: string]: unknown;
    }): ReturnType<AstroComponentFactory>;
  };
}
