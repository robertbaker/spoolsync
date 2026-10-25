import type { ImageMetadata } from "astro";

export function isNativeImageSource(src: string | ImageMetadata | null | undefined): boolean {
  return !src || (typeof src === "string" && !/^(https?:)?\/\//i.test(src));
}

const TRANSFORM_ATTRIBUTES = new Set([
  "background",
  "densities",
  "fit",
  "format",
  "inferSize",
  "layout",
  "position",
  "quality",
  "widths",
]);

export function getNativeImageAttributes(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(attributes).filter(([name]) => !TRANSFORM_ATTRIBUTES.has(name)),
  );
}
