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

const SAMPLE_VIEWPORTS = [360, 768, 1280, 1920];
const DEVICE_PIXEL_RATIOS = [1, 2];
const MIN_WIDTH = 16;
const MAX_WIDTH = 2048;
const MIN_WIDTH_RATIO = 1.4;

function matchesMedia(media: string, viewport: number): boolean {
  const conditions = [...media.matchAll(/\((min|max)-width:\s*([\d.]+)(px|rem|em)\)/g)];
  return conditions.every(([, kind, value, unit]) => {
    const limit = Number(value) * (unit === "px" ? 1 : 16);
    return kind === "min" ? viewport >= limit : viewport <= limit;
  });
}

function evaluateLength(length: string, viewport: number): number | undefined {
  const expression = length.replace(/^calc\((.*)\)$/, "$1");
  let total = 0;
  let matched = false;
  for (const [, sign, value, unit] of expression.matchAll(/([+-]?)\s*([\d.]+)(px|vw|rem|em)/g)) {
    const amount = Number(value) * (unit === "vw" ? viewport / 100 : unit === "px" ? 1 : 16);
    total += sign === "-" ? -amount : amount;
    matched = true;
  }
  return matched && total > 0 ? total : undefined;
}

/**
 * Derives a sparse srcset width list from the rendered size the image will have (`sizes`), at 1x
 * and 2x pixel density. Candidates closer than MIN_WIDTH_RATIO are collapsed so the browser never
 * chooses between near-identical files. `maxWidth` caps candidates at a known intrinsic size.
 */
export function deriveImageWidths(sizes: string | undefined, maxWidth?: number): number[] {
  const entries = (sizes ?? "")
    .split(/,(?![^(]*\))/)
    .map((entry) => entry.trim())
    .filter((entry) => entry && entry !== "auto");
  const cap = Math.min(MAX_WIDTH, maxWidth ?? MAX_WIDTH);

  const targets = new Set<number>();
  for (const viewport of SAMPLE_VIEWPORTS) {
    let rendered = viewport;
    for (const entry of entries) {
      const media = entry.match(/^((?:\([^)]*\)\s*(?:and\s*)?)+)\s*(.+)$/);
      if (media && !matchesMedia(media[1]!, viewport)) continue;
      rendered = evaluateLength(media ? media[2]! : entry, viewport) ?? viewport;
      break;
    }
    for (const ratio of DEVICE_PIXEL_RATIOS) {
      targets.add(Math.min(cap, Math.max(MIN_WIDTH, Math.round((rendered * ratio) / 8) * 8)));
    }
  }

  const widths: number[] = [];
  for (const target of [...targets].sort((a, b) => a - b)) {
    const previous = widths[widths.length - 1];
    if (previous === undefined || target / previous >= MIN_WIDTH_RATIO) widths.push(target);
    else if (target === cap) widths[widths.length - 1] = target;
  }
  return widths;
}
