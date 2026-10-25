/**
 * Imagemin Type Definitions
 *
 * Type declarations for imagemin and imagemin-avif packages. Used for image optimization during
 * build process.
 *
 * @module types/imagemin
 */

declare module "imagemin" {
  export type Plugin = unknown;

  export interface ImageminOptions {
    destination?: string;
    plugins?: Plugin[];
  }

  function imagemin(
    patterns: string | string[],
    options?: ImageminOptions,
  ): Promise<readonly Buffer[]>;

  namespace imagemin {
    export interface BufferOptions {
      plugins?: Plugin[];
    }

    function buffer(input: Buffer, options?: BufferOptions): Promise<Buffer>;
  }

  export default imagemin;
}

declare module "imagemin-avif" {
  import type { Plugin } from "imagemin";

  export interface AvifOptions {
    quality?: number;
    effort?: number;
  }

  export default function imageminAvif(options?: AvifOptions): Plugin;
}
