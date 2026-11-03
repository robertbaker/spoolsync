import { SERVICE_COUNT_WORD, SERVICE_VIEWS, joinNames } from "~/lib/services";

const fetchNames = joinNames(
  SERVICE_VIEWS.filter((service) => service.apiInBrowser).map((service) => service.name),
  "or",
);
const applyNames = joinNames(
  SERVICE_VIEWS.filter((service) => service.apiWriteInBrowser).map((service) => service.name),
);

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export const steps = [
  {
    title: "Load",
    body: `Drop in export files, or fetch from ${fetchNames}.`,
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
    body: `Update ${applyNames} directly, or download updated files for import.`,
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
    title: `${titleCase(SERVICE_COUNT_WORD)} tools, one table`,
    body: `Compare inventories across all ${SERVICE_COUNT_WORD} services. Write updates back via API or import files where a service accepts them.`,
  },
];
