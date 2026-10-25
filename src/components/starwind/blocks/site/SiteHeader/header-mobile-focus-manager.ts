const FOCUSABLE_MENU_CONTROL_SELECTOR =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";

export function getFocusableMenuControls(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>(FOCUSABLE_MENU_CONTROL_SELECTOR)).filter(
    (element) => {
      if (
        element.hasAttribute("disabled") ||
        element.tabIndex < 0 ||
        element.getAttribute("aria-disabled") === "true"
      )
        return false;
      let current: HTMLElement | null = element;
      while (current) {
        const style = window.getComputedStyle(current);
        if (
          current.hidden ||
          current.hasAttribute("inert") ||
          current.getAttribute("aria-hidden") === "true" ||
          style.display === "none" ||
          style.visibility === "hidden"
        )
          return false;
        if (
          current instanceof HTMLDetailsElement &&
          !current.open &&
          !current.querySelector(":scope > summary")?.contains(element)
        )
          return false;
        current = current.parentElement;
      }
      return true;
    },
  );
}

export class HeaderMobileFocusManager {
  public focusFirstMenuControl(menu: HTMLElement): void {
    const first = getFocusableMenuControls(menu)[0];
    if (first) first.focus();
    else {
      menu.tabIndex = -1;
      menu.focus();
    }
  }
}
