import type { SourceId } from "@spoolsync/core/core/model";
import type { ImageMetadata } from "astro";

import bambuddyLogo from "~/assets/logos/vendor/bambuddy.png";
import spoolLogo from "~/assets/logos/vendor/spool.svg";
import spoolhoarderLogo from "~/assets/logos/vendor/spoolhoarder.png";
import spoolkeepLogo from "~/assets/logos/vendor/spoolkeep.svg";
import spoolmasterLogo from "~/assets/logos/vendor/spoolmaster.png";
import spoolstockLogo from "~/assets/logos/vendor/spoolstock.png";

/**
 * Raster logos for the tools that ship a PNG instead of a bundled icon. Kept apart from
 * `services.ts` because importing images only works inside the Astro build.
 */
const LOGOS: Partial<Record<SourceId, ImageMetadata>> = {
  bambuddy: bambuddyLogo,
  spoolapp: spoolLogo,
  spoolhoarder: spoolhoarderLogo,
  spoolkeep: spoolkeepLogo,
  spoolmaster: spoolmasterLogo,
  spoolstock: spoolstockLogo,
};

export function serviceLogoSrc(id: SourceId): string | undefined {
  return LOGOS[id]?.src;
}

export function serviceLogoAsset(id: SourceId): ImageMetadata | undefined {
  return LOGOS[id];
}
