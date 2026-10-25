/** Register a client initializer for Astro page-load events. */
export function onAstroPageLoad(init: () => void): void {
  if (typeof document === "undefined") return;
  document.addEventListener("astro:page-load", init);
}

/**
 * Run a client initializer immediately and again on Astro page-load events.
 *
 * This is useful for pages that need eager setup on first render while also re-initializing after
 * client-side navigation.
 */
export function initOnAstroPageLoad(init: () => void): void {
  if (typeof document === "undefined") return;
  init();
  onAstroPageLoad(init);
}

/**
 * Run a client initializer on DOM ready (or immediately when already ready) and again on Astro
 * page-load events.
 */
export function initOnDomReadyAndAstroPageLoad(init: () => void): void {
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  onAstroPageLoad(init);
}

/**
 * Initialize once the DOM is ready (or early on interaction), then on page loads. Dynamic imports
 * arriving after DOM ready initialize immediately.
 */
export function initOnDomReadyAndAstroAfterSwap(init: () => void): void {
  if (typeof document === "undefined") return;

  let initialized = false;

  const initialize = (): void => {
    if (initialized) return;
    initialized = true;
    init();
    removeListeners();
  };

  const removeListeners = (): void => {
    document.removeEventListener("DOMContentLoaded", initialize);
    window.removeEventListener("scroll", initialize, { capture: true });
    document.removeEventListener("pointerdown", initialize, { capture: true });
    document.removeEventListener("keydown", initialize, { capture: true });
  };

  // Try DOM ready first
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

  // Defer to first user interaction
  if (!initialized) {
    window.addEventListener("scroll", initialize, { capture: true, once: true });
    document.addEventListener("pointerdown", initialize, { capture: true, once: true });
    document.addEventListener("keydown", initialize, { capture: true, once: true });
  }

  // Re-initialize on page load and after swap
  const handlePageSwap = (): void => {
    initialized = false;
    initialize();
  };
  onAstroPageLoad(handlePageSwap);
  document.addEventListener("astro:after-swap", handlePageSwap);
}
