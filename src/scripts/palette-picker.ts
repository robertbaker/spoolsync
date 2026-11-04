import { PALETTES, applyPalette, isPaletteId, readPalette, type PaletteId } from "~/lib/palettes";

const ARROW_STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * Wires the sidebar's accent-color picker: a button that opens a row of swatches (a radio group).
 * Choosing one applies and remembers it at once; the brand mark and every accent follow
 * `--primary`.
 */
export function wirePalettePicker(): void {
  const toggle = document.querySelector<HTMLButtonElement>("[data-sb-palette-toggle]");
  const grid = document.querySelector<HTMLElement>("[data-sb-palette-grid]");
  if (!toggle || !grid) return;
  const swatches = [...grid.querySelectorAll<HTMLButtonElement>("[data-palette-id]")];

  const reflect = (id: PaletteId) => {
    for (const swatch of swatches) {
      const on = swatch.dataset["paletteId"] === id;
      swatch.setAttribute("aria-checked", String(on));
      swatch.tabIndex = on ? 0 : -1;
    }
    toggle.title = `Accent color: ${PALETTES.find((palette) => palette.id === id)?.label ?? ""}`;
  };

  const choose = (id: PaletteId) => {
    applyPalette(id);
    reflect(id);
  };

  const setOpen = (open: boolean) => {
    grid.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  };

  reflect(readPalette());
  toggle.addEventListener("click", () => {
    // In the collapsed desktop rail there is no room for the grid: step to the next accent.
    if (
      document.documentElement.dataset["sidebar"] === "collapsed" &&
      window.matchMedia("(min-width: 1024px)").matches
    ) {
      const index = PALETTES.findIndex((palette) => palette.id === readPalette());
      choose(PALETTES[(index + 1) % PALETTES.length]!.id);
      return;
    }
    const open = Boolean(grid.hidden);
    setOpen(open);
    if (open) grid.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  });
  for (const swatch of swatches) {
    swatch.addEventListener("click", () => {
      const id = swatch.dataset["paletteId"];
      if (isPaletteId(id)) choose(id);
    });
    swatch.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.focus();
        return;
      }
      const step = ARROW_STEP[event.key];
      if (!step) return;
      event.preventDefault();
      const next = swatches[(swatches.indexOf(swatch) + step + swatches.length) % swatches.length];
      const id = next?.dataset["paletteId"];
      if (next && isPaletteId(id)) {
        choose(id);
        next.focus();
      }
    });
  }
}
