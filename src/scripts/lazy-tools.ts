import { isLoadPath } from "./setup/launch";
import { isTypingTarget } from "./shortcuts";

/**
 * Loads a module the first time it is needed and remembers it. A failed load (for example a chunk
 * that cannot be fetched offline) is forgotten so the next use tries again.
 */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}

/** Runs `action` with the module once it has loaded; a failed load just leaves the control inert. */
function use<T>(load: () => Promise<T>, action: (module: T) => void): void {
  load().then(action, () => undefined);
}

/**
 * Wires the page-wide tools (command palette, shortcuts list, saved-data and changelog dialogs)
 * with tiny listeners that load each tool on first use. Every handler acts on the event
 * synchronously (default prevented, trigger known) and then waits for the module, so a key press or
 * click that arrives before the code has loaded is not lost: it is replayed when it arrives.
 */
export function wireLazyTools(): void {
  const palette = once(() => import("./palette"));
  const shortcuts = once(() => import("./shortcuts-help"));
  const savedData = once(() => import("./saved-data-dialog"));
  const changelog = once(() => import("./changelog-dialog"));

  document.addEventListener("keydown", (event) => {
    // Ctrl/Cmd+K toggles the palette from anywhere, including text fields, as in most apps.
    if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) {
      if (event.altKey || event.shiftKey || event.defaultPrevented) return;
      event.preventDefault();
      use(palette, (module) => module.togglePalette());
      return;
    }
    // "?" opens the shortcuts list from anywhere a letter would not be typed into a field.
    if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.defaultPrevented || isTypingTarget(document.activeElement)) return;
    event.preventDefault();
    use(shortcuts, (module) => module.openShortcutsHelp());
  });

  for (const trigger of document.querySelectorAll("[data-open-palette]"))
    trigger.addEventListener("click", () => use(palette, (module) => module.openPalette()));
  for (const trigger of document.querySelectorAll("[data-open-shortcuts]"))
    trigger.addEventListener("click", () => use(shortcuts, (module) => module.openShortcutsHelp()));
  for (const trigger of document.querySelectorAll("[data-open-saved-data]"))
    trigger.addEventListener("click", () => use(savedData, (module) => module.openSavedData()));
  for (const trigger of document.querySelectorAll<HTMLElement>("[data-open-changelog]"))
    trigger.addEventListener("click", () =>
      use(changelog, (module) => void module.openChangelog(trigger.dataset["version"] ?? "")),
    );

  // The palette sends people to the Load page with `?panel=` or `?spool=` to act on once there.
  if (isLoadPath(location.pathname)) {
    const params = new URLSearchParams(location.search);
    if (params.has("panel") || params.has("spool"))
      use(palette, (module) => module.handleLandingParams());
  }

  // The palette is the one tool people reach for by key, so fetch it once the page is idle.
  const warm = () => use(palette, () => undefined);
  if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 4000 });
  else setTimeout(warm, 2000);
}
