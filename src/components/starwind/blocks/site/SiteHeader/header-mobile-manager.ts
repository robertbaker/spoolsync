import { HeaderMobileFocusManager, getFocusableMenuControls } from "./header-mobile-focus-manager";

/** HeaderMobileManager Handles mobile menu toggling, accessibility, and focus management. */
export class HeaderMobileManager {
  private btn: HTMLElement | null;
  private closeMenuTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly focusManager = new HeaderMobileFocusManager();
  private previousOverflow: string | null = null;
  private focusSessionId = 0;
  private toggleMenuBound: () => void;
  private handleEscapeBound: (event: KeyboardEvent) => void;
  private handleDocumentClickBound: (event: MouseEvent) => void;
  private handleCloseMenuButtonBound: () => void;
  private syncCloseButtonPositionBound: () => void;
  private closeMenuButtons: HTMLElement[] = [];

  constructor() {
    this.btn = document.getElementById("mobile-menu-btn");

    this.toggleMenuBound = this.toggleMenu.bind(this);
    this.handleEscapeBound = this.handleEscape.bind(this);
    this.handleDocumentClickBound = this.handleDocumentClick.bind(this);
    this.handleCloseMenuButtonBound = this.handleCloseMenuButton.bind(this);
    this.syncCloseButtonPositionBound = this.syncCloseButtonPosition.bind(this);
  }

  public init(mobileVariant?: string) {
    this.bindEvents(mobileVariant);
    this.syncMenuA11yState();
  }

  private bindEvents(mobileVariant?: string) {
    if (this.btn) {
      this.btn.addEventListener("click", this.toggleMenuBound);
    }

    document.addEventListener("keydown", this.handleEscapeBound);
    document.addEventListener("click", this.handleDocumentClickBound);

    if (mobileVariant === "glass" || mobileVariant === "grid" || mobileVariant === "overlay") {
      this.closeMenuButtons = Array.from(
        document.querySelectorAll<HTMLElement>("[data-close-menu]"),
      );
      this.closeMenuButtons.forEach((btn) =>
        btn.addEventListener("click", this.handleCloseMenuButtonBound),
      );
    }
  }

  private getTargetMenu() {
    if (!this.btn) return null;
    const targetId = this.btn.getAttribute("data-target") || "#navbar-menu";
    const targetMenu = document.querySelector<HTMLElement>(targetId);
    if (!targetMenu) return null;
    return { targetId, targetMenu };
  }

  private syncCloseButtonPosition(triggerRect?: DOMRect, triggerSize?: number) {
    if (!this.btn) return;
    const menu = this.getTargetMenu();
    if (!menu) return;
    // Full-screen menus pad their content below the header, whose height varies by site (logo size,
    // banners). A fixed offset let a tall header cover the menu's first row.
    const headerBottom = document.getElementById("main-header")?.getBoundingClientRect().bottom;
    if (headerBottom !== undefined) {
      menu.targetMenu.style.setProperty(
        "--mobile-menu-header-bottom",
        `${Math.round(headerBottom)}px`,
      );
    }
    const closeBtn = menu.targetMenu.querySelector<HTMLElement>("[data-close-menu]");
    if (!closeBtn) return;

    const rect = triggerRect ?? this.btn.getBoundingClientRect();
    const sizeSource = triggerSize ?? (this.btn.offsetWidth || rect.width);
    const size = Math.round(sizeSource);
    menu.targetMenu.style.setProperty("--mobile-menu-trigger-top", `${Math.round(rect.top)}px`);
    menu.targetMenu.style.setProperty("--mobile-menu-trigger-size", `${size}px`);
    menu.targetMenu.style.setProperty("--mobile-menu-trigger-left", `${Math.round(rect.left)}px`);
  }

  private syncMenuA11yState() {
    if (!this.btn) return;
    const menu = this.getTargetMenu();
    const isOpen = this.btn.classList.contains("is-open");
    this.btn.setAttribute("aria-expanded", String(isOpen));
    if (menu) {
      menu.targetMenu.setAttribute("aria-hidden", String(!isOpen));
      menu.targetMenu.toggleAttribute("inert", !isOpen);
    }
  }

  private shouldFocusMenu(menu: HTMLElement, focusSessionId: number): boolean {
    return (
      this.focusSessionId === focusSessionId &&
      this.btn?.classList.contains("is-open") === true &&
      this.getTargetMenu()?.targetMenu === menu
    );
  }

  private focusFirstMenuControl(menu: HTMLElement) {
    this.focusManager.focusFirstMenuControl(menu);
  }

  private invalidatePendingFocus() {
    this.focusSessionId += 1;
  }

  private queueMenuFocus(menu: HTMLElement) {
    const focusSessionId = ++this.focusSessionId;
    requestAnimationFrame(() => {
      if (!this.shouldFocusMenu(menu, focusSessionId)) {
        return;
      }

      menu.classList.remove("opacity-0", "scale-95", "invisible");
      menu.classList.add("opacity-100", "scale-100");
      this.focusFirstMenuControl(menu);
    });
  }

  private closeMenu(targetMenu: HTMLElement, restoreFocus: boolean) {
    if (!this.btn) return;

    this.invalidatePendingFocus();
    targetMenu.classList.remove("opacity-100", "scale-100");
    targetMenu.classList.add("opacity-0", "scale-95");

    if (this.closeMenuTimeout) {
      clearTimeout(this.closeMenuTimeout);
    }
    this.closeMenuTimeout = setTimeout(() => {
      targetMenu.classList.add("hidden");
      targetMenu.classList.add("invisible");
    }, 300);

    this.btn.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    this.syncMenuA11yState();
    if (this.previousOverflow !== null) {
      document.body.style.overflow = this.previousOverflow;
      this.previousOverflow = null;
    }
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.removeAttribute("inert");
    }
    window.removeEventListener("resize", this.syncCloseButtonPositionBound);

    if (restoreFocus) {
      this.btn.focus();
    }
  }

  private openMenu(targetId: string, targetMenu: HTMLElement) {
    if (!this.btn) return;

    if (this.closeMenuTimeout) {
      clearTimeout(this.closeMenuTimeout);
      this.closeMenuTimeout = null;
    }

    const stableRect = this.btn.getBoundingClientRect();
    const stableSize = this.btn.offsetWidth || this.btn.clientWidth || stableRect.width;
    targetMenu.classList.remove("hidden");
    this.syncCloseButtonPosition(stableRect, stableSize);
    this.btn.classList.add("is-open");
    document.body.classList.add("menu-open");
    this.syncMenuA11yState();

    if (targetId.includes("glass") || targetId.includes("grid") || targetId.includes("overlay")) {
      this.previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const mainEl = document.querySelector("main");
      if (mainEl && !targetMenu.contains(mainEl)) {
        mainEl.setAttribute("inert", "");
      }
    }

    window.addEventListener("resize", this.syncCloseButtonPositionBound, { passive: true });

    this.queueMenuFocus(targetMenu);
  }

  private toggleMenu(options: { restoreFocus?: boolean } = {}) {
    if (!this.btn) return;
    const menu = this.getTargetMenu();
    if (!menu) return;
    const { targetId, targetMenu } = menu;
    const { restoreFocus = false } = options;

    const isCurrentlyOpen = this.btn.classList.contains("is-open");

    if (!isCurrentlyOpen) {
      this.openMenu(targetId, targetMenu);
      return;
    }

    this.closeMenu(targetMenu, restoreFocus);
  }

  private handleCloseMenuButton() {
    if (!this.btn?.classList.contains("is-open")) return;
    this.toggleMenu({ restoreFocus: true });
  }

  private handleEscape(event: KeyboardEvent) {
    if (!this.btn?.classList.contains("is-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.toggleMenu({ restoreFocus: true });
      return;
    }
    const menu = this.getTargetMenu()?.targetMenu;
    if (event.key !== "Tab" || menu?.getAttribute("aria-modal") !== "true") return;
    const controls = getFocusableMenuControls(menu);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) {
      event.preventDefault();
      this.focusFirstMenuControl(menu);
      return;
    }
    if (
      !menu.contains(document.activeElement) ||
      (event.shiftKey ? document.activeElement === first : document.activeElement === last)
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  private handleDocumentClick(event: MouseEvent) {
    if (!this.btn?.classList.contains("is-open")) return;
    const menu = this.getTargetMenu();
    if (!menu) return;

    const target = event.target;
    if (!(target instanceof Node) || this.btn.contains(target)) return;

    const clickedInsideMenu = menu.targetMenu.contains(target);
    const clickedMenuLink =
      clickedInsideMenu && target instanceof Element && Boolean(target.closest("a[href]"));
    const isGridMenu = menu.targetId.includes("grid");
    const clickedInsideMenuPanel =
      clickedInsideMenu &&
      isGridMenu &&
      target instanceof Element &&
      Boolean(target.closest("[data-menu-panel]"));

    if (clickedMenuLink || !clickedInsideMenu || (isGridMenu && !clickedInsideMenuPanel)) {
      this.toggleMenu();
    }
  }

  public cleanup() {
    this.invalidatePendingFocus();
    this.btn?.removeEventListener("click", this.toggleMenuBound);
    document.removeEventListener("keydown", this.handleEscapeBound);
    document.removeEventListener("click", this.handleDocumentClickBound);
    this.closeMenuButtons.forEach((btn) =>
      btn.removeEventListener("click", this.handleCloseMenuButtonBound),
    );
    this.closeMenuButtons = [];

    if (this.closeMenuTimeout) {
      clearTimeout(this.closeMenuTimeout);
      this.closeMenuTimeout = null;
    }

    document.body.classList.remove("menu-open");
    if (this.previousOverflow !== null) {
      document.body.style.overflow = this.previousOverflow;
      this.previousOverflow = null;
    }
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.removeAttribute("inert");
    }
    window.removeEventListener("resize", this.syncCloseButtonPositionBound);
  }
}
