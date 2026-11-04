import type { SiteHeaderConfig } from "~/components/starwind/types";

import { SITE_BRAND_NAME } from "../site";

export const HEADER_UI_CONFIG: SiteHeaderConfig = {
  sticky: "fixed",
  variant: "default",
  glass: true,
  // The site header is replaced by the sidebar (components/Sidebar.astro), which draws its own
  // bottom bar, so the layout must not add bottom-nav padding to the body.
  mobileVariant: "collapse",
  mobileMenuButtonStyle: "morph",
  mobileMenuAccentColor: "primary",
  unstyled: false,
  showThemeToggle: true,
  logo: {
    icon: "spoolsync",
    text: SITE_BRAND_NAME,
    class: "h-10 sm:h-12 text-xl font-bold text-foreground",
  },
  homeLinkAriaLabel: `${SITE_BRAND_NAME} — Home`,
  windowKey: "__simpleSiteHeaderManager",
};
