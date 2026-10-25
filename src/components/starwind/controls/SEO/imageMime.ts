import type { ImageInputFormat } from "astro";

const IMAGE_MIME_TYPES = {
  apng: "image/apng",
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  tiff: "image/tiff",
  webp: "image/webp",
} as const satisfies Record<ImageInputFormat, string>;

type KnownImageExtension = keyof typeof IMAGE_MIME_TYPES;

function imageExtension(pathname: string): KnownImageExtension | undefined {
  const extension = pathname.split(".").pop()?.toLowerCase();
  return extension && extension in IMAGE_MIME_TYPES
    ? (extension as KnownImageExtension)
    : undefined;
}

/**
 * Resolve the MIME type of the URL returned by Astro's image pipeline.
 *
 * Prerendered transforms are emitted with their actual output extension. Runtime transforms use the
 * extensionless `/_image` endpoint; under workerd the configured image service passes through the
 * source bytes and reports their source format.
 */
export function resolveOptimizedImageMimeType(
  optimizedSrc: string,
  sourceFormat: ImageInputFormat,
): string {
  const outputExtension = imageExtension(new URL(optimizedSrc, "https://image.invalid").pathname);
  return IMAGE_MIME_TYPES[outputExtension ?? sourceFormat];
}
