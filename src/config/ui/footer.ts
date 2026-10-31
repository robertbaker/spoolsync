import type { SiteFooterConfig } from "~/components/starwind/types";

export const FOOTER_UI_CONFIG: SiteFooterConfig = {
  copyrightText: "Robert Baker and the contributors of SpoolSync · Open source under AGPL-3.0",
  homeLinkAriaLabel: "SpoolSync home",
  sections: [
    {
      id: "app",
      title: "App",
      links: [
        { href: "/connections", label: "Connections" },
        { href: "/load", label: "Load" },
        { href: "/sync", label: "Sync" },
        { href: "/cli", label: "CLI" },
      ],
    },
    {
      id: "resources",
      title: "Resources",
      links: [
        {
          href: "https://www.npmjs.com/package/spoolsync",
          label: "npm package",
          external: true,
        },
        { href: "https://github.com/robertbaker/spoolsync", label: "GitHub", external: true },
        { href: "https://ko-fi.com/spool_sync", label: "Support on Ko-fi", external: true },
        { href: "/credits", label: "Credits" },
      ],
    },
  ],
};
