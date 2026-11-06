import { OPEN_PALETTE_EVENT } from "./commands";
import { closePalette, isPaletteOpen, openPalette } from "./dialog";

export { openPalette } from "./dialog";
export { handleLandingParams } from "./commands";

/** Ctrl/Cmd+K toggles the palette from anywhere, including text fields, as in most apps. */
export function togglePalette(): void {
  if (isPaletteOpen()) closePalette();
  else openPalette();
}

// An action can ask for the palette again with a search already typed (see `OPEN_PALETTE_EVENT`).
// Only the palette's own commands send it, so listening from when this module loads is enough.
document.addEventListener(OPEN_PALETTE_EVENT, (event) => {
  const query = (event as CustomEvent<{ query?: unknown } | null>).detail?.query;
  openPalette(typeof query === "string" ? query : "");
});
