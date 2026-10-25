const NAV_SELECTOR = "[data-nav-menu], [data-desktop-mega-nav], [data-fab-menu]";
const OPEN_DETAILS_SELECTOR =
  "[data-nav-menu] details[open], [data-desktop-mega-nav] details[open], details[data-fab-menu][open]";

export function initNavigationDisclosures(root: Document = document): () => void {
  const syncSummaryAria = (detail: HTMLDetailsElement) => {
    const summary = detail.querySelector<HTMLElement>(":scope > summary");
    if (summary) {
      summary.removeAttribute("aria-expanded");
    }
  };

  const close = (detail: HTMLDetailsElement, restoreFocus = false) => {
    detail.open = false;
    syncSummaryAria(detail);
    if (restoreFocus) detail.querySelector<HTMLElement>(":scope > summary")?.focus();
  };

  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof Node)) return;
    root.querySelectorAll<HTMLDetailsElement>(OPEN_DETAILS_SELECTOR).forEach((detail) => {
      if (detail.closest(NAV_SELECTOR)?.getAttribute("data-close-on-outside") === "false") return;
      if (!detail.contains(event.target as Node)) close(detail);
    });
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (!(event.target instanceof Element)) return;

    if (event.key === "Escape") {
      const detail = event.target.closest<HTMLDetailsElement>("details[open]");
      if (!detail?.closest(NAV_SELECTOR)) return;
      event.preventDefault();
      close(detail, true);
      return;
    }

    // Keyboard navigation improvement: ArrowDown on open summary focuses first link in panel
    if (event.key === "ArrowDown" && event.target.tagName.toLowerCase() === "summary") {
      const detail = event.target.closest<HTMLDetailsElement>("details");
      if (detail?.closest(NAV_SELECTOR) && detail.open) {
        const firstLink = detail.querySelector<HTMLElement>(
          "div a[href], div button:not([disabled])",
        );
        if (firstLink) {
          event.preventDefault();
          firstLink.focus();
        }
      }
    }
  };

  const onToggle = (event: Event) => {
    const detail = event.target;
    if (!(detail instanceof HTMLDetailsElement)) return;
    syncSummaryAria(detail);
    if (detail.hasAttribute("data-fab-menu")) {
      const trigger = detail.querySelector("[data-fab-menu-trigger]");
      const menu = detail.querySelector("#fab-menu-items");
      trigger?.setAttribute("aria-expanded", String(detail.open));
      trigger?.setAttribute("aria-label", detail.open ? "Close menu" : "Open menu");
      menu?.setAttribute("aria-hidden", String(!detail.open));
      menu?.toggleAttribute("inert", !detail.open);
    }
    if (!detail.open) return;
    const nav = detail.closest(NAV_SELECTOR);
    nav?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((other) => {
      if (other !== detail && !other.contains(detail) && !detail.contains(other)) close(other);
    });
  };
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  root.addEventListener("toggle", onToggle, true);
  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKeydown);
    root.removeEventListener("toggle", onToggle, true);
  };
}

let cleanup: (() => void) | undefined;

export function bootstrapNavigationDisclosures(): void {
  if (cleanup || typeof document === "undefined") return;
  // Delegation reads the live document, so Astro swaps need no re-registration.
  cleanup = initNavigationDisclosures();
}
