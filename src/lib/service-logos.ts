import type { SourceId } from "@spoolsync/core/core/model";
import bambuddyLogo from "~/assets/logos/vendor/bambuddy.png";
import spoolstockLogo from "~/assets/logos/vendor/spoolstock.png";

/**
 * Raster logos for the tools that ship a PNG instead of a bundled icon. Kept apart from
 * `services.ts` because importing images only works inside the Astro build.
 */
const LOGOS: Partial<Record<SourceId, string>> = {
  bambuddy: bambuddyLogo.src,
  spoolstock: spoolstockLogo.src,
};

export function serviceLogoSrc(id: SourceId): string | undefined {
  return LOGOS[id];
}
