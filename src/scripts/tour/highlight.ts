export function createTourHighlight() {
  let activeTarget: Element | null = null;

  function removeHighlight(): void {
    activeTarget?.classList.remove("spoolsync-tour-highlight");
    activeTarget = null;
  }

  function visible(element: Element): boolean {
    return !element.closest("[hidden]");
  }

  function highlight(selector: string): void {
    removeHighlight();
    let target = document.querySelector(selector);
    if (target && !visible(target)) target = document.querySelector("#tour-sync");
    if (target) {
      activeTarget = target;
      target.classList.add("spoolsync-tour-highlight");
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      });
    }
  }
  return { highlight, clear: removeHighlight };
}
