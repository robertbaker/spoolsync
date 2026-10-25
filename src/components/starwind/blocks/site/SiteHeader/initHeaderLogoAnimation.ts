import { initOnDomReadyAndAstroPageLoad } from "../../../lib/initOnAstroPageLoad.ts";

const LOGO_SELECTOR = "[data-site-header-logo]";
const ANIMATING_CLASS = "site-header-logo--animating";
const BOOTSTRAP_KEY = "__r5iHeaderLogoAnimationBootstrapped";
const CLEANUP_KEY = "__r5iHeaderLogoAnimationCleanup";

declare global {
  interface Window {
    [BOOTSTRAP_KEY]?: boolean;
    [CLEANUP_KEY]?: (() => void) | undefined;
  }
}

/**
 * HeaderLogoAnimationManager
 *
 * Manages stroke drawing animations on the site navbar/header logo.
 *
 * - Triggers on page load / view-transition swap.
 * - Triggers on click / tap.
 * - Measures SVG path lengths dynamically for precise stroke-dasharray animations.
 * - Respects prefers-reduced-motion: reduce.
 */
export class HeaderLogoAnimationManager {
  private logoElements: HTMLElement[] = [];
  private clickHandlers = new Map<HTMLElement, EventListener>();
  private mutationObserver: MutationObserver | null = null;
  private swapHandler: (() => void) | null = null;
  private animTimer: ReturnType<typeof setTimeout> | null = null;

  init(): boolean {
    if (typeof document === "undefined") return false;

    this.cleanup();

    const logos = Array.from(document.querySelectorAll<HTMLElement>(LOGO_SELECTOR));
    if (logos.length === 0) return false;

    this.logoElements = logos;

    // Measure SVG path lengths and assign them to CSS custom properties
    this.setupPathLengths();

    // Bind click handlers to logo containers and their anchor links
    this.setupClickHandlers();

    // Trigger initial load animation
    this.handleLoadAnimation();

    // Teardown listener on Astro view transition
    this.swapHandler = () => this.cleanup();
    document.addEventListener("astro:before-swap", this.swapHandler, { once: true });

    return true;
  }

  private isReducedMotion(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  private setupPathLengths(): void {
    for (const logo of this.logoElements) {
      const svg = logo.querySelector("svg");
      if (!svg) continue;

      const vectorElements = svg.querySelectorAll<SVGGeometryElement>(
        "path, polygon, rect, circle, ellipse, line, polyline",
      );

      vectorElements.forEach((el) => {
        try {
          if (typeof el.getTotalLength === "function") {
            const length = Math.ceil(el.getTotalLength());
            if (length > 0) {
              el.style.setProperty("--path-len", `${length}px`);
            }
          }
        } catch {
          // Fallback if measurement fails
          el.style.setProperty("--path-len", "600px");
        }
      });
    }
  }

  private setupClickHandlers(): void {
    for (const logo of this.logoElements) {
      const target = (logo.closest("#logo-link") as HTMLElement | null) ?? logo;
      const handler = (_e: Event) => {
        // Animate on click (even if navigating or staying on same page)
        this.play(logo);
      };

      target.addEventListener("click", handler);
      this.clickHandlers.set(target, handler);
    }
  }

  private handleLoadAnimation(): void {
    if (this.isReducedMotion()) return;

    for (const logo of this.logoElements) {
      const navbarWrapper = logo.closest<HTMLElement>("[data-hero-logo-navbar]");

      // If wrapped in a hero-logo shrink container that is currently hidden,
      // wait until it becomes visible before playing the entrance animation
      if (navbarWrapper?.classList.contains("hero-logo-navbar--hidden")) {
        this.observeVisibility(navbarWrapper, logo);
      } else {
        // Trigger entrance animation shortly after mount
        this.animTimer = setTimeout(() => {
          this.play(logo);
        }, 80);
      }
    }
  }

  private observeVisibility(wrapper: HTMLElement, logo: HTMLElement): void {
    this.mutationObserver?.disconnect();
    this.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class" &&
          wrapper.classList.contains("hero-logo-navbar--visible")
        ) {
          this.mutationObserver?.disconnect();
          this.mutationObserver = null;
          this.play(logo);
          break;
        }
      }
    });

    this.mutationObserver.observe(wrapper, { attributes: true, attributeFilter: ["class"] });
  }

  play(logo?: HTMLElement): void {
    if (this.isReducedMotion()) return;

    const targets = logo ? [logo] : this.logoElements;

    for (const target of targets) {
      // Re-trigger CSS animation cleanly by toggling class with reflow
      target.classList.remove(ANIMATING_CLASS);
      void target.offsetWidth; // Force reflow
      target.classList.add(ANIMATING_CLASS);
    }
  }

  cleanup(): void {
    if (this.animTimer) {
      clearTimeout(this.animTimer);
      this.animTimer = null;
    }

    this.mutationObserver?.disconnect();
    this.mutationObserver = null;

    for (const [target, handler] of this.clickHandlers) {
      target.removeEventListener("click", handler);
    }
    this.clickHandlers.clear();

    for (const logo of this.logoElements) {
      logo.classList.remove(ANIMATING_CLASS);
    }
    this.logoElements = [];

    if (this.swapHandler) {
      document.removeEventListener("astro:before-swap", this.swapHandler);
      this.swapHandler = null;
    }
  }
}

/** Initialize Header Logo animation manager. Safe to call multiple times. */
export function initHeaderLogoAnimation(): HeaderLogoAnimationManager | null {
  if (typeof window === "undefined") return null;

  window[CLEANUP_KEY]?.();
  window[CLEANUP_KEY] = undefined;

  const manager = new HeaderLogoAnimationManager();
  if (manager.init()) {
    window[CLEANUP_KEY] = () => manager.cleanup();
    return manager;
  }
  return null;
}

/** Bootstrap Header Logo animation across page lifecycle. */
export function bootstrapHeaderLogoAnimation(): void {
  if (typeof window !== "undefined" && window[BOOTSTRAP_KEY]) return;
  if (typeof window !== "undefined") window[BOOTSTRAP_KEY] = true;
  if (typeof document === "undefined") return;

  initOnDomReadyAndAstroPageLoad(initHeaderLogoAnimation);
}
