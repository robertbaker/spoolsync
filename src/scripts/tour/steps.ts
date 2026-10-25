export type TourStep = {
  title: string;
  body: string;
  href: string;
  target: string;
};

export const steps: readonly TourStep[] = [
  {
    title: "Welcome to SpoolSync",
    body: "Keep your filament inventories aligned across the tools you use. Everything runs in this browser tab, and nothing changes until you apply or download updates.",
    href: "/",
    target: "#tour-overview",
  },
  {
    title: "Connect Spoolman or TigerTag",
    body: "Save your Spoolman URL or sign in to TigerTag cloud. Both are optional—you can also work entirely from exported files.",
    href: "/connections",
    target: "#tour-connections",
  },
  {
    title: "Load your inventories",
    body: "Fetch from Spoolman, TigerTag, or Bambuddy, or drop in export files from Spoolstock, Spoolio, 3DFilamentProfiles, and FilaMeter. Load whichever services you want to compare.",
    href: "/load",
    target: "#tour-load",
  },
  {
    title: "Review matches",
    body: "SpoolSync links spools automatically by shared IDs. Similar spools without a shared ID appear as suggestions for you to confirm or reject.",
    href: "/sync",
    target: "#tour-sync",
  },
  {
    title: "Resolve differences",
    body: "Pick which service's value to keep for each conflict. Unresolved fields stay untouched, and missing spools are only added where you choose.",
    href: "/sync",
    target: "#tour-differences",
  },
  {
    title: "Apply or export",
    body: "Write changes directly to Spoolman or TigerTag cloud, or download updated files for services that support imports. Spoolstock CSVs are read-only.",
    href: "/sync",
    target: "#tour-apply",
  },
];
