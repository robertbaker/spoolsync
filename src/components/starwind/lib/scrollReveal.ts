/**
 * ScrollRevealManager
 *
 * Lightweight IntersectionObserver that adds `.is-visible` to elements with scroll-reveal classes
 * (`.scroll-reveal`, `.scroll-reveal-fade`, `.scroll-reveal-scale`, `.scroll-reveal-left`,
 * `.scroll-reveal-right`) when they enter the viewport.
 *
 * Usage:
 *
 * 1. Add a scroll-reveal class to any element.
 * 2. Import and call `bootstrapScrollReveal()` in your layout.
 *
 * Designed for 2026 trend: scroll-triggered entrance animations. GPU-composited (opacity +
 * transform only). Respects reduced motion.
 */

import { prefersReducedMotion } from "./accessibility";
import { initOnDomReadyAndAstroPageLoad } from "./initOnAstroPageLoad";

const REVEAL_SELECTOR = [
  ".scroll-reveal",
  ".scroll-reveal-fade",
  ".scroll-reveal-scale",
  ".scroll-reveal-left",
  ".scroll-reveal-right",
].join(",");

const VISIBLE_CLASS = "is-visible";
const EAGER_REVEAL_VIEWPORT_MARGIN_PX = 80;
const OBSERVER_OPTIONS: IntersectionObserverInit = {
  threshold: 0.1,
  rootMargin: "0px 0px -40px 0px",
};

declare global {
  interface Window {
    __r5iScrollRevealCleanup?: () => void;
    __r5iScrollRevealBootstrapped?: boolean;
  }
}

export class ScrollRevealManager {
  private observer: IntersectionObserver | null = null;

  private shouldRevealOnInit(element: Element): boolean {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    if (viewportHeight <= 0 || rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    return rect.bottom > 0 && rect.top < viewportHeight + EAGER_REVEAL_VIEWPORT_MARGIN_PX;
  }

  init(): boolean {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return false;
    }

    const elements = Array.from(document.querySelectorAll(REVEAL_SELECTOR));
    if (elements.length === 0) return false;

    // Skip animation entirely if user prefers reduced motion
    if (prefersReducedMotion()) {
      elements.forEach((el) => el.classList.add(VISIBLE_CLASS));
      return true;
    }

    const elementsToObserve = elements.filter((el) => {
      if (!this.shouldRevealOnInit(el)) {
        return true;
      }

      el.classList.add(VISIBLE_CLASS);
      return false;
    });

    if (elementsToObserve.length === 0) {
      return true;
    }

    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add(VISIBLE_CLASS);
          // Once revealed, stop observing (one-shot animation)
          this.observer?.unobserve(entry.target);
        }
      }
    }, OBSERVER_OPTIONS);

    elementsToObserve.forEach((el) => this.observer!.observe(el));
    return true;
  }

  cleanup(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}

/** Init scroll reveal, cleaning up any previous instance. */
export function initScrollReveal(): void {
  window.__r5iScrollRevealCleanup?.();
  delete window.__r5iScrollRevealCleanup;

  const manager = new ScrollRevealManager();
  if (!manager.init()) return;

  const cleanup = () => {
    manager.cleanup();
    if (window.__r5iScrollRevealCleanup === cleanup) {
      delete window.__r5iScrollRevealCleanup;
    }
  };

  window.__r5iScrollRevealCleanup = cleanup;
  document.addEventListener("astro:before-swap", cleanup, { once: true });
}

/** Idempotent bootstrap — call once in your layout `<script>`. */
export function bootstrapScrollReveal(): void {
  if (typeof window === "undefined") return;
  if (window.__r5iScrollRevealBootstrapped) return;
  window.__r5iScrollRevealBootstrapped = true;
  initOnDomReadyAndAstroPageLoad(initScrollReveal);
}
