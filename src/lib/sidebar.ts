import type { WorkflowStepId } from "~/config/site";

/** localStorage key holding the desktop sidebar's state. Registered in `saved-data.ts`. */
export const SIDEBAR_KEY = "spoolsync:sidebar";

/** Fired on `document` to toggle the sidebar (collapse on desktop, open the drawer on phones). */
export const SIDEBAR_TOGGLE_EVENT = "spoolsync:toggle-sidebar";

export type SidebarMode = "expanded" | "collapsed";

/** Reads a stored mode; anything unexpected falls back to the expanded default. */
export function parseSidebarMode(raw: string | null | undefined): SidebarMode {
  return raw === "collapsed" ? "collapsed" : "expanded";
}

export function otherSidebarMode(mode: SidebarMode): SidebarMode {
  return mode === "expanded" ? "collapsed" : "expanded";
}

const trimPath = (path: string) => path.replace(/\/+$/, "") || "/";

export interface NavTarget {
  href: string;
  matchPaths?: readonly string[] | undefined;
}

/**
 * Whether a navigation entry is the current page. An entry is current on its own path, on any of
 * its `matchPaths`, and (except the home page) on pages beneath it, so a blog post keeps
 * "Resources" current.
 */
export function isNavCurrent(link: NavTarget, pathname: string): boolean {
  const path = trimPath(pathname);
  return [link.href, ...(link.matchPaths ?? [])].some((candidate) => {
    const target = trimPath(candidate.split("#")[0] ?? candidate);
    return target === path || (target !== "/" && path.startsWith(`${target}/`));
  });
}

/** Which workflow step a path and hash belong to, or null when the page is not part of the flow. */
export function workflowStepForPath(pathname: string, hash: string): WorkflowStepId | null {
  const path = trimPath(pathname);
  if (path === "/load") return "load";
  if (path === "/sync") return hash === "#tour-apply" ? "apply" : "review";
  return null;
}

export type SidebarStepState = "done" | "current" | "todo";

export interface SidebarStepInput {
  id: WorkflowStepId;
  state: SidebarStepState;
  meta: string;
}

/**
 * Adjusts the stepper's progress for the sidebar. Off the inventory pages nothing is "current",
 * so the Load step falls back to done (something is loaded) or todo.
 */
export function sidebarSteps(
  views: readonly SidebarStepInput[],
  onInventoryPage: boolean,
  loaded: number,
): SidebarStepInput[] {
  if (onInventoryPage) return views.map((view) => ({ ...view }));
  return views.map((view) => ({
    ...view,
    state: view.id === "load" && loaded > 0 ? "done" : "todo",
  }));
}

/**
 * Whether the changelog has news the visitor has not opened: they have opened it before and the
 * running version is newer than the one they last read. A first-ever visit shows nothing.
 */
export function hasUnreadChangelog(readVersion: string | null, current: string): boolean {
  return Boolean(current) && readVersion !== null && readVersion !== current;
}

/** Short badge text for a count of loaded inventories, or "" when there is nothing to show. */
export function loadedBadge(loaded: number): string {
  return loaded > 0 ? String(loaded) : "";
}
