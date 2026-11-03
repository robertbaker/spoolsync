import { SOURCE_IDS, SOURCE_LABELS } from "@spoolsync/core/core/model";

import { navLinks } from "~/config/navigation";
import { WORKFLOW_STEPS } from "~/config/site";
import { readLoadResult } from "~/lib/browser/storage/inventories";
import { readDisplaySettings, updateDisplaySettings } from "~/lib/units";

import { isLoadPath, openSetupGuide } from "../setup/launch";
import { spoolItems, type PaletteItem } from "./items";

/** Fired on `document` to open a spool's detail drawer. Another module listens for it. */
export const OPEN_SPOOL_EVENT = "spoolsync:open-spool";

const here = () => location.pathname.replace(/\/+$/, "") || "/";

function clickVisible(selector: string): boolean {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target || target.hidden || (target as HTMLButtonElement).disabled) return false;
  target.click();
  return true;
}

/** Whether a page control exists and is currently usable (hidden buttons are not offered). */
function available(selector: string): boolean {
  const target = document.querySelector<HTMLElement>(selector);
  return Boolean(target && !target.hidden && !(target as HTMLButtonElement).disabled);
}

export function openPanel(source: string): boolean {
  const panel = document.querySelector<HTMLDetailsElement>(`details[data-panel="${CSS.escape(source)}"]`);
  if (!panel) return false;
  panel.hidden = false;
  panel.open = true;
  const summary = panel.querySelector<HTMLElement>("summary");
  panel.scrollIntoView({ block: "start", behavior: "smooth" });
  summary?.focus({ preventScroll: true });
  return true;
}

/** Opens a spool's drawer, going to the Load page first when the spool is not on this page. */
export function openSpool(key: string): void {
  if (isLoadPath(location.pathname)) {
    document.dispatchEvent(new CustomEvent(OPEN_SPOOL_EVENT, { detail: { key } }));
    return;
  }
  location.assign(`/load?spool=${encodeURIComponent(key)}`);
}

/** Acts on `?panel=` and `?spool=` after the palette sent the visitor to the Load page. */
export function handleLandingParams(): void {
  if (!isLoadPath(location.pathname)) return;
  const params = new URLSearchParams(location.search);
  const panel = params.get("panel");
  const spool = params.get("spool");
  if (!panel && !spool) return;
  params.delete("panel");
  params.delete("spool");
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
  const run = () => {
    if (panel) openPanel(panel);
    if (spool) document.dispatchEvent(new CustomEvent(OPEN_SPOOL_EVENT, { detail: { key: spool } }));
  };
  // The Load script restores inventories after the page loads; give it a moment to finish.
  if (document.readyState === "complete") setTimeout(run, 250);
  else window.addEventListener("load", () => setTimeout(run, 250), { once: true });
}

function pageItems(): PaletteItem[] {
  // The Inventory entry covers two pages, so the palette lists each step of it instead.
  const links = [
    ...navLinks.flatMap((link) =>
      link.matchPaths
        ? WORKFLOW_STEPS.filter((step) => step.id !== "apply").map((step) => ({
            href: step.href,
            label: step.id === "load" ? "Load" : "Review and apply",
          }))
        : [link],
    ),
    { href: "/credits", label: "Credits" },
  ];
  return links.map((link) => ({
    id: `page:${link.href}`,
    group: "Pages" as const,
    title: `Go to ${link.label}`,
    subtitle: link.href === here() ? "You are here" : undefined,
    keywords: `page open ${link.href}`,
    run: () => {
      if (link.href !== here()) location.assign(link.href);
    },
  }));
}

function panelItems(): PaletteItem[] {
  return SOURCE_IDS.map((source) => ({
    id: `panel:${source}`,
    group: "Panels" as const,
    title: `Open ${SOURCE_LABELS[source]} panel`,
    subtitle: "Load page",
    keywords: `${source} service source import export load`,
    run: () => {
      if (isLoadPath(location.pathname)) openPanel(source);
      else location.assign(`/load?panel=${encodeURIComponent(source)}`);
    },
  }));
}

function actionItems(): PaletteItem[] {
  const unit = readDisplaySettings().weightUnit;
  const items: PaletteItem[] = [];
  const add = (item: Omit<PaletteItem, "group">) => items.push({ group: "Actions", ...item });
  if (available("[data-theme-toggle]"))
    add({
      id: "action:theme",
      title: "Toggle light or dark theme",
      keywords: "appearance mode dark light color",
      run: () => void clickVisible("[data-theme-toggle]"),
    });
  add({
    id: "action:units",
    title: `Show weights in ${unit === "g" ? "ounces" : "grams"}`,
    subtitle: `Currently ${unit === "g" ? "grams" : "ounces"}`,
    keywords: "units weight grams ounces oz g metric imperial display",
    run: () => void updateDisplaySettings({ weightUnit: unit === "g" ? "oz" : "g" }),
  });
  if (available("[data-open-shortcuts]"))
    add({
      id: "action:shortcuts",
      title: "Show keyboard shortcuts",
      keywords: "help keys hotkeys",
      run: () => void clickVisible("[data-open-shortcuts]"),
    });
  if (available("[data-open-saved-data]"))
    add({
      id: "action:saved",
      title: "Open saved settings",
      keywords: "preferences storage forget export import display units currency",
      run: () => void clickVisible("[data-open-saved-data]"),
    });
  if (available("[data-open-changelog]"))
    add({
      id: "action:changelog",
      title: "What is new (changelog)",
      keywords: "release notes version updates",
      run: () => void clickVisible("[data-open-changelog]"),
    });
  if (available("[data-tour-launcher]"))
    add({
      id: "action:tour",
      title: "Take the tour",
      keywords: "guide walkthrough help intro",
      run: () => void clickVisible("[data-tour-launcher]"),
    });
  add({
    id: "action:setup",
    title: "Open the setup guide",
    subtitle: "Where to find each app's export",
    keywords: "wizard first run getting started help import",
    run: openSetupGuide,
  });
  add({
    id: "action:cleanup",
    title: "Clean up data",
    subtitle: "Load page",
    keywords: "cleanup normalize tidy fix whitespace casing vendor material price weight duplicates",
    run: () => {
      // The panel is a native <details data-panel="cleanup"> on the Load page, so the shared
      // ?panel= landing handling opens it after a redirect.
      if (isLoadPath(location.pathname)) openPanel("cleanup");
      else location.assign("/load?panel=cleanup");
    },
  });
  if (available("#download-combined"))
    add({
      id: "action:download-combined",
      title: "Download all spools as one CSV",
      subtitle: "Load page",
      keywords: "export combined csv inventory",
      run: () => void clickVisible("#download-combined"),
    });
  if (available("#unload-all"))
    add({
      id: "action:unload-all",
      title: "Unload all services",
      subtitle: "Load page",
      keywords: "clear reset remove inventories",
      run: () => void clickVisible("#unload-all"),
    });
  return items;
}

/** Everything the palette can do right now. Actions depend on what the current page offers. */
export function buildItems(): PaletteItem[] {
  return [...pageItems(), ...panelItems(), ...actionItems()];
}

/** Loaded spools from every service, read from session storage as Sync and Load do. */
export function buildSpoolItems(): PaletteItem[] {
  const results = SOURCE_IDS.flatMap((source) => {
    const result = readLoadResult(source);
    return result ? [result] : [];
  });
  return spoolItems(results, openSpool, readDisplaySettings().weightUnit);
}
