const boundRoots = new WeakSet<Document>();

export function initBadgeDismiss(root: Document = document): void {
  if (boundRoots.has(root)) return;
  root.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("button[data-badge-dismiss]")
        : null;
    if (!button || button.disabled) return;
    button.closest("[data-badge]")?.remove();
  });
  boundRoots.add(root);
}
