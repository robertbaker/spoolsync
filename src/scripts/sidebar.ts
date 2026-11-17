import { local, read, write } from "~/lib/browser/storage/access";
import {
  SIDEBAR_KEY,
  SIDEBAR_TOGGLE_EVENT,
  hasUnreadChangelog,
  loadedBadge,
  otherSidebarMode,
  parseSidebarMode,
  sidebarSteps,
  workflowStepForPath,
  type SidebarMode,
} from "~/lib/sidebar";
import { DISPLAY_CHANGED, readDisplaySettings, updateDisplaySettings } from "~/lib/units";

import { INVENTORIES_CHANGED_EVENT } from "./load/state";
import { countLoaded, workflowProgress } from "./workflow-steps";

/** Same key the changelog dialog writes when it is opened (see `changelog-dialog.ts`). */
const CHANGELOG_READ_KEY = "spoolsync:changelog-read";

const DESKTOP = "(min-width: 1024px)";
const TABLET = "(min-width: 768px)";

function applyMode(mode: SidebarMode): void {
  document.documentElement.dataset["sidebar"] = mode;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-sb-collapse]")) {
    const expanded = mode === "expanded";
    button.setAttribute("aria-expanded", String(expanded));
    const label = expanded ? "Collapse sidebar" : "Expand sidebar";
    button.setAttribute("aria-label", label);
    button.title = `${label} (Ctrl+B)`;
  }
  syncBrand(mode);
}

/** On the desktop rail the logo expands the sidebar; elsewhere it stays the home link. */
function railActsAsExpand(): boolean {
  return (
    document.documentElement.dataset["sidebar"] === "collapsed" &&
    window.matchMedia(DESKTOP).matches
  );
}

function syncBrand(_mode: SidebarMode): void {
  const brand = document.querySelector<HTMLAnchorElement>(".sb-brand");
  if (!brand) return;
  if (railActsAsExpand()) {
    brand.setAttribute("aria-label", "Expand sidebar");
    brand.title = "Expand sidebar (Ctrl+B)";
  } else {
    brand.setAttribute("aria-label", "SpoolSync home");
    brand.title = "SpoolSync home";
  }
}

/** The mode the inline script in the layout head set before first paint, or the stored one. */
function currentMode(): SidebarMode {
  return parseSidebarMode(document.documentElement.dataset["sidebar"] ?? read(local, SIDEBAR_KEY));
}

function isTextEditing(element: Element | null): boolean {
  return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * Wires the sidebar and bottom bar: collapse state, the phone drawer, workflow progress, badges,
 * the units quick toggle and the Ctrl/Cmd+B shortcut. Does nothing on pages without a sidebar. Call
 * it before the other `wire*` functions so the drawer closes before a dialog opens.
 */
export function wireSidebar(): void {
  const root = document.getElementById("app-sidebar");
  if (!root) return;
  const controller = new AbortController();
  const options = { signal: controller.signal };

  // ---- Collapse (desktop) and peek (tablet) -----------------------------------------------
  applyMode(currentMode());
  const setMode = (mode: SidebarMode) => {
    applyMode(mode);
    write(local, SIDEBAR_KEY, mode);
  };
  for (const button of document.querySelectorAll("[data-sb-collapse]"))
    button.addEventListener("click", () => setMode(otherSidebarMode(currentMode())), options);
  root.querySelector(".sb-brand")?.addEventListener(
    "click",
    (event) => {
      if (!railActsAsExpand()) return;
      event.preventDefault();
      setMode("expanded");
    },
    options,
  );
  window.matchMedia(DESKTOP).addEventListener("change", () => syncBrand(currentMode()), options);

  // ---- Phone drawer ------------------------------------------------------------------------
  const supportsPopover = typeof root.showPopover === "function";
  const openers = [...document.querySelectorAll<HTMLElement>("[data-sb-open]")];
  const isOpen = () =>
    supportsPopover ? root.matches(":popover-open") : root.hasAttribute("data-open");
  const syncOpeners = () => {
    for (const opener of openers) opener.setAttribute("aria-expanded", String(isOpen()));
  };
  const openDrawer = () => {
    if (isOpen()) return;
    if (supportsPopover) root.showPopover();
    else root.setAttribute("data-open", "");
    syncOpeners();
    root.querySelector<HTMLElement>("[data-sb-close]")?.focus({ preventScroll: true });
  };
  const closeDrawer = (restoreFocus = true) => {
    if (!isOpen()) return;
    if (supportsPopover) root.hidePopover();
    else root.removeAttribute("data-open");
    syncOpeners();
    if (restoreFocus && !supportsPopover) openers[0]?.focus();
  };
  if (supportsPopover) {
    root.addEventListener("toggle", syncOpeners, options);
  } else {
    // Without the Popover API the buttons toggle a class instead.
    for (const opener of openers)
      opener.addEventListener("click", () => (isOpen() ? closeDrawer() : openDrawer()), options);
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && isOpen()) closeDrawer();
      },
      options,
    );
  }
  root.querySelector("[data-sb-close]")?.addEventListener("click", () => closeDrawer(), options);
  // Following a link or running a tool dismisses the drawer first, so dialogs open on a clean page.
  root.addEventListener(
    "click",
    (event) => {
      const target =
        event.target instanceof Element ? event.target.closest("a, [data-sb-action]") : null;
      if (target && isOpen()) closeDrawer(false);
    },
    options,
  );
  const railQuery = window.matchMedia(TABLET);
  railQuery.addEventListener(
    "change",
    () => {
      if (railQuery.matches) closeDrawer(false);
      root.removeAttribute("data-peek");
    },
    options,
  );

  // ---- Toggle shortcut and palette action --------------------------------------------------
  const peek = (on: boolean) => {
    if (on) {
      root.setAttribute("data-peek", "");
      root.querySelector<HTMLElement>("[data-sb-link]")?.focus({ preventScroll: true });
    } else {
      root.removeAttribute("data-peek");
    }
  };
  const toggle = () => {
    if (window.matchMedia(DESKTOP).matches) setMode(otherSidebarMode(currentMode()));
    else if (window.matchMedia(TABLET).matches) peek(!root.hasAttribute("data-peek"));
    else if (isOpen()) closeDrawer();
    else openDrawer();
  };
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key.toLowerCase() === "b" && (event.ctrlKey || event.metaKey)) {
        if (event.altKey || event.shiftKey || event.defaultPrevented) return;
        if (isTextEditing(document.activeElement)) return;
        event.preventDefault();
        toggle();
        return;
      }
      if (event.key === "Escape" && root.hasAttribute("data-peek")) peek(false);
    },
    options,
  );
  document.addEventListener(SIDEBAR_TOGGLE_EVENT, toggle, options);
  document.addEventListener(
    "click",
    (event) => {
      if (
        root.hasAttribute("data-peek") &&
        event.target instanceof Node &&
        !root.contains(event.target)
      )
        peek(false);
    },
    options,
  );

  // ---- Inventory progress and badges -------------------------------------------------------
  const renderSteps = () => {
    const step = workflowStepForPath(location.pathname, location.hash);
    const loaded = countLoaded();
    const views = sidebarSteps(workflowProgress(step ?? "load", loaded), step !== null, loaded);
    for (const view of views) {
      const item = root.querySelector<HTMLElement>(`[data-sb-step="${view.id}"]`);
      if (!item) continue;
      item.dataset["state"] = view.state;
      const link = item.querySelector("a");
      if (link) {
        if (view.state === "current") link.setAttribute("aria-current", "step");
        else link.removeAttribute("aria-current");
      }
      const meta = item.querySelector("[data-sb-step-meta]");
      if (meta) meta.textContent = view.meta;
    }
    const badge = loadedBadge(loaded);
    for (const element of root.querySelectorAll<HTMLElement>("[data-sb-loaded]")) {
      element.textContent = badge;
      element.hidden = badge === "";
    }
    const description = root.querySelector("[data-sb-loaded-desc]");
    if (description)
      description.textContent =
        loaded === 0 ? "" : `${loaded} ${loaded === 1 ? "inventory" : "inventories"} loaded`;
  };
  document.addEventListener(INVENTORIES_CHANGED_EVENT, renderSteps, options);
  window.addEventListener("hashchange", renderSteps, options);
  window.addEventListener("pageshow", renderSteps, options);
  renderSteps();

  // ---- Changelog "New" badge ---------------------------------------------------------------
  const changelog = root.querySelector<HTMLElement>("[data-open-changelog]");
  const renderChangelog = () => {
    const badge = root.querySelector<HTMLElement>("[data-sb-changelog-new]");
    if (!badge) return;
    badge.hidden = !hasUnreadChangelog(
      read(local, CHANGELOG_READ_KEY),
      changelog?.dataset["version"] ?? "",
    );
  };
  // Opening the changelog records the version as read; re-check once that has happened.
  changelog?.addEventListener("click", () => setTimeout(renderChangelog, 0), options);
  window.addEventListener("storage", renderChangelog, options);
  window.addEventListener("pageshow", renderChangelog, options);
  renderChangelog();

  // ---- Units quick toggle ------------------------------------------------------------------
  const units = root.querySelector<HTMLButtonElement>("[data-sb-units]");
  const renderUnits = () => {
    if (!units) return;
    const grams = readDisplaySettings().weightUnit === "g";
    const value = units.querySelector("[data-sb-units-value]");
    if (value) value.textContent = grams ? "g" : "oz";
    units.setAttribute(
      "aria-label",
      `Units: ${grams ? "grams" : "ounces"}. Switch to ${grams ? "ounces" : "grams"}`,
    );
  };
  units?.addEventListener(
    "click",
    () =>
      updateDisplaySettings({ weightUnit: readDisplaySettings().weightUnit === "g" ? "oz" : "g" }),
    options,
  );
  document.addEventListener(DISPLAY_CHANGED, renderUnits, options);
  renderUnits();
}
