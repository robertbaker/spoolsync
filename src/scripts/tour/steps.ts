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
    title: "Drop your exports",
    body: "Drop export files from any supported service, several at once if you like. SpoolSync works out which service each belongs to, and asks if a file could be from more than one.",
    href: "/load",
    target: "#tour-drop",
  },
  {
    title: "Or connect to a service",
    body: "Spoolman, TigerTag, Bambuddy, and FilamentDB can be fetched directly. Open a service to enter its address or sign in; settings stay in this browser. Search and filter the list to find a service quickly.",
    href: "/load",
    target: "#tour-services",
  },
  {
    title: "Review matches",
    body: "SpoolSync links spools automatically by shared IDs. Similar spools without a shared ID appear as suggestions: answer each one, or answer them all at once after a second click.",
    href: "/sync",
    target: "#tour-sync",
  },
  {
    title: "Resolve differences",
    body: "Pick which service's value to keep for each conflict. Unresolved fields stay untouched, and missing spools are only added where you choose. Long lists load 25 at a time and can be filtered.",
    href: "/sync",
    target: "#tour-differences",
  },
  {
    title: "Apply or export",
    body: "Write changes directly to Spoolman or TigerTag cloud, or download updated files for services that support imports, all at once if several changed. Read-only services such as Spoolstock and the Mac and iOS apps are only used as sources.",
    href: "/sync",
    target: "#tour-apply",
  },
];
