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

/** Active when the link's own path matches, or any of its `matchPaths` does. */
export function isNavItemActive(
  item: { href: string; matchPaths?: readonly string[] },
  currentPath: string,
  activeMatch: NavActiveMatch = "startsWith",
): boolean {
  if (isLinkActive(item.href, currentPath, activeMatch)) return true;
  return item.matchPaths?.some((path) => isLinkActive(path, currentPath, activeMatch)) ?? false;
}
