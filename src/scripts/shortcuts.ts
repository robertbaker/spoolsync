/** Whether keyboard input is going to a control that needs plain keystrokes. */
export function isTypingTarget(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset"].includes(
      element.type,
    );
  }
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

/**
 * Focuses a search field when "/" is pressed outside any text field. `enabled` lets a page choose
 * which of several fields owns the shortcut right now.
 */
export function wireSlashFocus(
  input: HTMLInputElement | null,
  enabled: () => boolean = () => true,
): void {
  if (!input) return;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.defaultPrevented || isTypingTarget(document.activeElement) || !enabled()) return;
    if (input.offsetParent === null && getComputedStyle(input).position !== "fixed") return;
    event.preventDefault();
    input.focus();
    input.select();
  });
}

/** Clears a search input on Escape when it has text, dispatching an input event so listeners update. */
export function wireEscapeClear(input: HTMLInputElement | null): void {
  if (!input) return;
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !input.value) return;
    event.preventDefault();
    event.stopPropagation();
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
