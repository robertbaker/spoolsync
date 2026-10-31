import bambuddyLogo from "~/assets/logos/vendor/bambuddy.png";

export const steps = [
  {
    title: "Connect",
    body: "Point SpoolSync at your Spoolman server or TigerTag account.",
    href: "/connections",
    ready: true,
  },
  {
    title: "Load",
    body: "Fetch from connected services or drop in export files.",
    href: "/load",
    ready: true,
  },
  {
    title: "Match",
    body: "Spools link automatically by shared IDs; you confirm any close matches.",
    href: "/sync",
    ready: true,
  },
  {
    title: "Resolve",
    body: "Where services disagree, pick the value to keep. Unresolved fields stay untouched.",
    href: "/sync",
    ready: true,
  },
  {
    title: "Apply",
    body: "Update Spoolman and TigerTag directly, or download updated files for import.",
    href: "/sync",
    ready: true,
  },
];

export const highlights = [
  {
    icon: "material-symbols:lock-outline",
    title: "Local to your browser",
    body: "Your inventory stays in this tab. No backend server, no account, and no telemetry.",
  },
  {
    icon: "material-symbols:compare-arrows",
    title: "You approve every change",
    body: "Differences appear side by side. Nothing is overwritten or created unless you choose it.",
  },
  {
    icon: "material-symbols:inventory-2-outline",
    title: "Seven tools, one table",
    body: "Compare inventories across all seven services and write updates back via API or import files.",
  },
];

export const services = [
  {
    name: "Spoolman / Spoolman-NG",
    icon: "vendor/spoolman",
    how: "Direct over your local network, or via export file",
    read: "API or JSON/CSV file",
    write: "API or JSON file",
    actionText: "Configure connection →",
    actionHref: "/connections",
  },
  {
    name: "Spoolstock",
    icon: "vendor/spoolstock",
    how: "CSV export from the app's Inventory tab",
    read: "CSV file",
    write: "Not supported (read-only)",
    actionText: "Load export file →",
    actionHref: "/load",
  },
  {
    name: "Spoolio",
    icon: "vendor/spoolio",
    how: "JSON export from spoolio.net settings",
    read: "JSON file",
    write: "JSON file",
    actionText: "Load export file →",
    actionHref: "/load",
  },
  {
    name: "TigerTag",
    icon: "vendor/tigertag",
    how: "TigerTag cloud sign-in, or a .ttag / JSON backup",
    read: "Cloud or file",
    write: "Cloud or .ttag file",
    actionText: "Connect cloud or file →",
    actionHref: "/load",
  },
  {
    name: "3DFilamentProfiles",
    icon: "vendor/3dfilamentprofiles",
    how: "My Spools CSV or JSON export",
    read: "CSV or JSON",
    write: "CSV or JSON",
    actionText: "Load export file →",
    actionHref: "/load",
  },
  {
    name: "Bambuddy",
    icon: "material-symbols:inventory-2-outline",
    image: bambuddyLogo.src,
    how: "Direct via API key, or inventory CSV export",
    read: "CSV or API",
    write: "CSV (new spools)",
    actionText: "Load inventory →",
    actionHref: "/load",
  },
  {
    name: "FilaMeter",
    icon: "vendor/filameter",
    how: "JSON backup or filament CSV from Settings",
    read: "JSON backup or CSV",
    write: "JSON or CSV",
    actionText: "Load export file →",
    actionHref: "/load",
  },
  {
    name: "Filadex",
    icon: "vendor/filadex",
    how: "JSON or CSV from the export menu",
    read: "JSON or CSV",
    write: "JSON or CSV",
    actionText: "Load export file →",
    actionHref: "/load",
  },
  {
    name: "FilamentDB",
    icon: "material-symbols:database-outline",
    how: "Spools JSON from /api/spools",
    read: "JSON",
    write: "JSON",
    actionText: "Load export file →",
    actionHref: "/load",
  },
];
