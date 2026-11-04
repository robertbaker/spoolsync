import { serviceNamesShort } from "../lib/services";

export const SITE_TITLE = "SpoolSync";
export const SITE_BRAND_NAME = "SpoolSync";
export const SITE_DESCRIPTION = `Compare filament spool inventories across ${serviceNamesShort(7)} tools, then sync changes in your browser.`;
export const SITE_URL = "https://www.spoolsync.com";
export const AUTHOR_NAME = "SpoolSync";
export const TWITTER_HANDLE = "";
export const CONTACT_FORM_URL = "";
export const SOCIAL_LINKS: Record<string, string> = {};

/**
 * Load and Sync are one workflow (nothing can be synced before it is loaded), so the navigation has
 * a single "Inventory" entry that stays active on both pages.
 */
export const NAV_LINKS = [
  { href: "/", label: "Home", text: "Home", icon: "material-symbols:home-outline-rounded" },
  {
    href: "/load",
    label: "Inventory",
    text: "Inventory",
    icon: "material-symbols:inventory-2-outline",
    matchPaths: ["/load", "/sync", "/inventory"],
  },
  { href: "/cli", label: "CLI", text: "CLI", icon: "material-symbols:terminal" },
  {
    href: "/resources",
    label: "Resources",
    text: "Resources",
    icon: "material-symbols:article-outline",
  },
];

/** The three steps of the inventory workflow and the page each lives on. */
export const WORKFLOW_STEPS = [
  { id: "load", label: "Load", href: "/load", hint: "Add exports or connect" },
  { id: "review", label: "Review", href: "/sync", hint: "Match and resolve" },
  { id: "apply", label: "Apply", href: "/sync#tour-apply", hint: "Write or download" },
] as const;
export type WorkflowStepId = (typeof WORKFLOW_STEPS)[number]["id"];
