/** Accent palettes the sidebar picker offers. The CSS for each lives in styles/theme.css. */
export const PALETTE_STORAGE_KEY = "spoolsync:palette";

export const PALETTES = [
  { id: "filament", label: "Filament", swatch: "oklch(0.68 0.19 48)" },
  { id: "ocean", label: "Ocean", swatch: "oklch(0.62 0.17 250)" },
  { id: "teal", label: "Teal", swatch: "oklch(0.62 0.17 195)" },
  { id: "forest", label: "Forest", swatch: "oklch(0.62 0.17 150)" },
  { id: "violet", label: "Violet", swatch: "oklch(0.62 0.17 295)" },
  { id: "rose", label: "Rose", swatch: "oklch(0.62 0.17 355)" },
  { id: "crimson", label: "Crimson", swatch: "oklch(0.62 0.17 25)" },
] as const;

export type PaletteId = (typeof PALETTES)[number]["id"];

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((palette) => palette.id === value);
}

/** The saved palette, or the default when nothing valid is stored. */
export function readPalette(storage: Pick<Storage, "getItem"> = localStorage): PaletteId {
  try {
    const stored = storage.getItem(PALETTE_STORAGE_KEY);
    return isPaletteId(stored) ? stored : "filament";
  } catch {
    return "filament";
  }
}

/** Applies the palette to the page and remembers it; the default palette clears the attribute. */
export function applyPalette(id: PaletteId, persist = true): void {
  if (id === "filament") document.documentElement.removeAttribute("data-palette");
  else document.documentElement.setAttribute("data-palette", id);
  if (!persist) return;
  try {
    if (id === "filament") localStorage.removeItem(PALETTE_STORAGE_KEY);
    else localStorage.setItem(PALETTE_STORAGE_KEY, id);
  } catch {
    // Storage can be blocked; the palette then lasts for this page only.
  }
}
