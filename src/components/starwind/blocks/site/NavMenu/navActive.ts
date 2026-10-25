export type NavActiveMatch = "exact" | "startsWith" | "includes";

/**
 * Check if a link is active based on current path and match mode.
 *
 * @param href The link path
 * @param currentPath The current page path
 * @param activeMatch The matching strategy ('exact' or 'startsWith')
 */
export function isLinkActive(
  href: string,
  currentPath: string,
  activeMatch: NavActiveMatch = "startsWith",
): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const path = href.split(/[?#]/, 1)[0]!.replace(/\/+$/, "") || "/";
  const current = currentPath.replace(/\/+$/, "") || "/";
  if (activeMatch === "exact" || path === "/") return current === path;
  return current === path || current.startsWith(`${path}/`);
}
