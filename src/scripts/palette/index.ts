import { OPEN_PALETTE_EVENT, handleLandingParams } from "./commands";
import { closePalette, isPaletteOpen, openPalette } from "./dialog";

/** Ctrl/Cmd+K toggles the palette from anywhere, including text fields, as in most apps. */
export function wirePalette(): void {
  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return;
    if (event.altKey || event.shiftKey || event.defaultPrevented) return;
    event.preventDefault();
    if (isPaletteOpen()) closePalette();
    else openPalette();
  });
  for (const trigger of document.querySelectorAll("[data-open-palette]"))
    trigger.addEventListener("click", () => openPalette());
  // An action can ask for the palette again with a search already typed (see `OPEN_PALETTE_EVENT`).
  document.addEventListener(OPEN_PALETTE_EVENT, (event) => {
    const query = (event as CustomEvent<{ query?: unknown } | null>).detail?.query;
    openPalette(typeof query === "string" ? query : "");
  });
  handleLandingParams();
}
