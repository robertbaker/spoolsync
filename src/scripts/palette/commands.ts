import { SOURCE_IDS, SOURCE_LABELS } from "@spoolsync/core/core/model";

import { navLinks } from "~/config/navigation";
import { WORKFLOW_STEPS } from "~/config/site";
import { readLoadResult } from "~/lib/browser/storage/inventories";
import { t } from "~/lib/i18n";
import { backupFilename, createBackup } from "~/lib/saved-data";
import { readDisplaySettings, updateDisplaySettings } from "~/lib/units";

import { showToast } from "../dom";
import { isLoadPath, openSetupGuide } from "../setup/launch";
import { download } from "../sync/presentation";
import { spoolItems, type PaletteItem } from "./items";

/** Fired on `document` to open a spool's detail drawer. Another module listens for it. */
export const OPEN_SPOOL_EVENT = "spoolsync:open-spool";

/** Fired on `document` with `{ query }` to reopen the palette with a search already typed. */
export const OPEN_PALETTE_EVENT = "spoolsync:open-palette";

const here = () => location.pathname.replace(/\/+$/, "") || "/";

function clickVisible(selector: string): boolean {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target || target.closest("[hidden]") || (target as HTMLButtonElement).disabled) return false;
  target.click();
  return true;
}

/** Whether a page control exists and is currently usable (hidden buttons are not offered). */
function available(selector: string): boolean {
  const target = document.querySelector<HTMLElement>(selector);
  return Boolean(target && !target.closest("[hidden]") && !(target as HTMLButtonElement).disabled);
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
            label: step.id === "load" ? t("palette.page.load") : t("palette.page.review"),
          }))
        : [link],
    ),
    { href: "/credits", label: t("palette.page.credits") },
  ];
  return links.map((link) => ({
    id: `page:${link.href}`,
    group: "Pages" as const,
    title: t("palette.go", { page: link.label }),
    subtitle: link.href === here() ? t("palette.here") : undefined,
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
    title: t("palette.panel", { service: SOURCE_LABELS[source] }),
    subtitle: t("palette.loadPage"),
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
      title: t("palette.theme"),
      keywords: "appearance mode dark light color",
      aliases: ["dark mode", "light mode", "night mode", "theme"],
      run: () => void clickVisible("[data-theme-toggle]"),
    });
  add({
    id: "action:units",
    title: t("palette.units", {
      unit: t(unit === "g" ? "palette.unit.ounces" : "palette.unit.grams"),
    }),
    subtitle: t("palette.units.current", {
      unit: t(unit === "g" ? "palette.unit.grams" : "palette.unit.ounces"),
    }),
    keywords: "units weight grams ounces oz g metric imperial display",
    aliases: ["metric", "imperial", "grams", "ounces", "switch units"],
    run: () => void updateDisplaySettings({ weightUnit: unit === "g" ? "oz" : "g" }),
  });
  if (available("[data-open-shortcuts]"))
    add({
      id: "action:shortcuts",
      title: t("palette.shortcuts"),
      keywords: "help keys hotkeys",
      aliases: ["hotkeys", "keys", "key bindings"],
      run: () => void clickVisible("[data-open-shortcuts]"),
    });
  if (available("[data-open-saved-data]"))
    add({
      id: "action:saved",
      title: t("palette.saved"),
      keywords: "preferences storage forget export import display units currency",
      aliases: ["settings", "preferences", "forget data", "privacy"],
      run: () => void clickVisible("[data-open-saved-data]"),
    });
  if (available("[data-open-saved-data]"))
    add({
      id: "action:language",
      title: t("palette.language"),
      subtitle: t("palette.language.sub"),
      keywords: "language locale translation english german deutsch spanish espanol french francais dutch nederlands",
      aliases: ["language", "locale", "translate", "sprache", "idioma", "langue", "taal"],
      run: () => void clickVisible("[data-open-saved-data]"),
    });
  if (available("#health-dashboard") && !document.getElementById("health-dashboard")?.hidden)
    add({
      id: "action:health",
      title: t("palette.health"),
      subtitle: t("palette.loadPage"),
      keywords: "data health score quality todo fix missing weight color price duplicates cleanup",
      aliases: ["health", "data quality", "score", "to do"],
      run: () => {
        const panel = document.getElementById("health-dashboard");
        panel?.scrollIntoView({ block: "start", behavior: "smooth" });
        const heading = panel?.querySelector<HTMLElement>("h2");
        heading?.setAttribute("tabindex", "-1");
        heading?.focus({ preventScroll: true });
      },
    });
  if (available("#export-view-csv"))
    add({
      id: "action:export-view",
      title: t("palette.exportView"),
      subtitle: t("palette.loadPage"),
      keywords: "export download filtered table view csv spools current",
      aliases: ["export view", "export filtered", "download view"],
      run: () => void clickVisible("#export-view-csv"),
    });
  if (available("[data-open-changelog]"))
    add({
      id: "action:changelog",
      title: t("palette.changelog"),
      keywords: "release notes version updates",
      aliases: ["release notes", "whats new", "updates", "version"],
      run: () => void clickVisible("[data-open-changelog]"),
    });
  if (available("[data-tour-launcher]"))
    add({
      id: "action:tour",
      title: t("palette.tour"),
      keywords: "guide walkthrough help intro",
      aliases: ["help", "walkthrough", "tutorial"],
      run: () => void clickVisible("[data-tour-launcher]"),
    });
  add({
    id: "action:setup",
    title: t("palette.setup"),
    subtitle: t("palette.setup.sub"),
    keywords: "wizard first run getting started help import",
    aliases: ["getting started", "first run", "onboarding"],
    run: openSetupGuide,
  });
  add({
    id: "action:cleanup",
    title: t("palette.cleanup"),
    subtitle: t("palette.loadPage"),
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
      title: t("palette.combined"),
      subtitle: t("palette.loadPage"),
      keywords: "export combined csv inventory",
      aliases: ["export csv", "export inventory", "combined csv"],
      run: () => void clickVisible("#download-combined"),
    });
  // Inventory tools added with the report, weigh-in, backup and history features.
  if (available("#open-inventory-report"))
    add({
      id: "action:inventory-report",
      title: t("palette.report"),
      subtitle: t("palette.report.sub"),
      keywords: "totals material brand low stock value cost summary print download",
      aliases: ["report", "print inventory", "summary", "export report"],
      run: () => void clickVisible("#open-inventory-report"),
    });
  if (isLoadPath(location.pathname) && SOURCE_IDS.some((source) => readLoadResult(source)))
    add({
      id: "action:weigh-in",
      title: "Weigh in a spool",
      subtitle: "Pick a spool, then use its Weigh in section",
      keywords: "scale tare remaining filament left weight calculator",
      aliases: ["scale", "tare", "weigh", "how much is left"],
      run: () => document.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT, { detail: { query: "weigh " } })),
    });
  if (document.getElementById("since-visit") && !document.getElementById("since-visit")?.hidden)
    add({
      id: "action:since-visit",
      title: "Show what changed since your last visit",
      subtitle: "Load page",
      keywords: "changes used added removed compare previous file snapshot",
      aliases: ["changes", "what changed", "recent changes", "diff"],
      run: () => {
        const panel = document.getElementById("since-visit");
        panel?.scrollIntoView({ block: "start", behavior: "smooth" });
        panel?.querySelector<HTMLElement>("h3")?.setAttribute("tabindex", "-1");
        panel?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
      },
    });
  if (available("#reorder-panel details"))
    add({
      id: "action:reorder",
      title: "Open the reorder list",
      subtitle: "Load page",
      keywords: "shopping list low stock buy shop link",
      aliases: ["shopping list", "buy filament", "low stock"],
      run: () => {
        const details = document.querySelector<HTMLDetailsElement>("#reorder-panel details");
        if (details) details.open = true;
        details?.scrollIntoView({ block: "start", behavior: "smooth" });
        details?.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
      },
    });
  if (available('[data-action="share-view"]'))
    add({
      id: "action:share-view",
      title: "Copy a link to the current table view",
      subtitle: "Load page",
      keywords: "saved view filters share url link",
      aliases: ["share view", "view link"],
      run: () => void clickVisible('[data-action="share-view"]'),
    });
  if (available("#sync-history-export"))
    add({
      id: "action:export-history",
      title: "Export sync history as JSON",
      subtitle: "Sync page",
      keywords: "download applies downloads log",
      aliases: ["history", "export log"],
      run: () => void clickVisible("#sync-history-export"),
    });
  add({
    id: "action:backup",
    title: "Download a backup of saved settings",
    subtitle: "Never includes connections or tokens",
    keywords: "export settings preferences views file history watchlist",
    aliases: ["backup", "export settings", "save settings"],
    run: () => {
      try {
        download(backupFilename(new Date()), createBackup(), "application/json");
      } catch {
        showToast("Could not create the backup", "error");
      }
    },
  });
  if (available("[data-open-saved-data]"))
    add({
      id: "action:restore",
      title: "Restore settings from a backup",
      subtitle: "Opens saved settings",
      keywords: "import settings backup file merge replace",
      aliases: ["restore", "import settings"],
      run: () => void clickVisible("[data-open-saved-data]"),
    });
  if (available("#unload-all"))
    add({
      id: "action:unload-all",
      title: t("palette.unload"),
      subtitle: t("palette.loadPage"),
      keywords: "clear reset remove inventories",
      aliases: ["clear all", "reset", "unload everything"],
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
