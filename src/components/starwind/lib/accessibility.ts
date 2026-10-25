/** Configure an element as an ARIA live region for dynamic content announcements. */
export function configureLiveRegion(
  element: HTMLElement | null,
  role: "status" | "alert",
  live: "polite" | "assertive",
): void {
  if (!element) return;
  element.setAttribute("role", role);
  element.setAttribute("aria-live", live);
  element.setAttribute("aria-atomic", "true");
}

/** Focus a visible live region element for screen reader announcement. */
export function focusLiveRegion(element: HTMLElement | null): void {
  if (!element || element.classList.contains("hidden")) return;
  element.setAttribute("tabindex", "-1");
  element.focus({ preventScroll: true });
}

/** True when the user has requested reduced motion. Safe to call outside the browser. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
  );
}
