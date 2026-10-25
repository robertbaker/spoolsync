import type { SimpleSiteConfig } from "~/components/starwind/types";

import {
  CONTACT_FORM_URL,
  SITE_BRAND_NAME,
  SITE_DESCRIPTION,
  SITE_URL,
  SOCIAL_LINKS,
} from "./site";
import { FOOTER_UI_CONFIG } from "./ui/footer";
import { HEADER_UI_CONFIG } from "./ui/header";
import { THEME_UI_CONFIG } from "./ui/theme";

export const SITE_CONFIG: SimpleSiteConfig = {
  brand: {
    title: SITE_BRAND_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  contact: {
    email: "",
    location: "",
    formUrl: CONTACT_FORM_URL,
  },
  socialLinks: SOCIAL_LINKS,
  ui: {
    theme: THEME_UI_CONFIG,
    header: HEADER_UI_CONFIG,
    footer: FOOTER_UI_CONFIG,
  },
};
