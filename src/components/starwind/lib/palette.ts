/**
 * Per-component colour overrides.
 *
 * Every shipped block and the root of each `src/ui` primitive accepts a `palette` prop. It writes
 * the seed tokens from `styles/tokens.css` onto that component's root as inline custom properties
 * and marks it `data-palette`, which is the attribute `tokens.css` re-derives on — so the text on a
 * `bg-primary` button inside follows the new `--primary` through `contrast-color()` without the
 * caller naming a foreground at all.
 *
 * <HeroNavCenteredImage palette={{ primary: "oklch(0.62 0.19 150)" }} /> <Button palette="#e11d48"
 * variant="primary">Delete</Button> (a string is `primary`) <PricingTable palette={{ primary:
 * "var(--brand-500)", radius: "1rem" }} />
 *
 * Values are any CSS colour — hex (`#e11d48`, or bare `e11d48`), `oklch()`, `rgb()`, a named
 * colour, or a `var()` reference into the site's own tokens. Derived tokens (`primaryForeground`
 * etc.) can be pinned too, which opts that one out of derivation.
 */

/** The seed tokens a site sets, in camelCase. Each maps to `--kebab-case` on the element. */
export interface PaletteTokens {
  primary?: string;
  secondary?: string;
  accent?: string;
  neutral?: string;
  background?: string;
  foreground?: string;
  card?: string;
  cardForeground?: string;
  popover?: string;
  popoverForeground?: string;
  muted?: string;
  mutedForeground?: string;
  border?: string;
  input?: string;
  ring?: string;
  outline?: string;
  error?: string;
  info?: string;
  success?: string;
  warning?: string;
  /** Modal backdrop colour; overlays apply their own alpha. */
  scrim?: string;
  /** Base corner radius; `rounded-sm/md/lg` scale from it. */
  radius?: string;

  /* Derived — normally left alone. Setting one pins it and stops it following its seed. */
  primaryForeground?: string;
  primaryAccent?: string;
  secondaryForeground?: string;
  secondaryAccent?: string;
  accentForeground?: string;
  neutralForeground?: string;
  errorForeground?: string;
  infoForeground?: string;
  successForeground?: string;
  warningForeground?: string;
}

/**
 * What the `palette` prop accepts: a token map, or a single colour as shorthand for `primary`. Raw
 * `--custom-property` keys pass through untouched, for tokens a block defines itself.
 */
export type Palette = string | (PaletteTokens & { [customProperty: `--${string}`]: string });

/** Mix into a component's `Props` to declare the prop. */
export interface PaletteProps {
  /** Override theme colours for this component and everything inside it. */
  palette?: Palette;
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const BARE_HEX = /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * One palette value, ready for an inline style — or null when it is not safe to write there.
 *
 * Any CSS colour passes through (`#e11d48`, `oklch(…)`, `rgb(…)`, `var(--brand)`, `red`). A bare
 * hex from a colour picker or a CMS field (`e11d48`, `fff`) gets its `#`. Anything that could end
 * the declaration or the attribute (`;`, braces, quotes, angle brackets) is dropped, because these
 * values often come from content rather than from code.
 */
export function normalizeColor(value: unknown): string | null {
  if (value === undefined || value === null || value === false) return null;
  const v = String(value).trim();
  if (!v || /[;{}<>"'\\]/.test(v)) return null;
  return BARE_HEX.test(v) ? `#${v}` : v;
}

/** The palette as a `{ "--primary": "…" }` map. Empty for `undefined`. */
export function paletteVars(palette: Palette | undefined): Record<string, string> {
  if (palette === undefined || palette === null) return {};
  if (typeof palette === "string") {
    const primary = normalizeColor(palette);
    return primary ? { "--primary": primary } : {};
  }
  const vars: Record<string, string> = {};
  for (const [key, raw] of Object.entries(palette)) {
    const value = normalizeColor(raw);
    if (value === null || !/^(--)?[a-zA-Z][\w-]*$/.test(key)) continue;
    vars[key.startsWith("--") ? key : `--${kebab(key)}`] = value;
  }
  return vars;
}

type Attrs = Record<string, unknown> & { palette?: Palette; style?: unknown };

/**
 * Serialize a trusted inline style string or object for composition with generated declarations.
 * Adds a trailing separator, converts camelCase properties, and preserves custom properties. This
 * does not sanitize untrusted CSS or infer units for numeric values.
 */
export const styleToString = (style: unknown): string => {
  if (!style) return "";
  if (typeof style === "string") {
    const s = style.trim();
    return s && !s.endsWith(";") ? `${s};` : s;
  }
  if (typeof style === "object") {
    return Object.entries(style as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null && v !== false && v !== "")
      .map(([k, v]) => `${k.startsWith("--") ? k : kebab(k)}:${String(v)};`)
      .join("");
  }
  return "";
};

/**
 * Take `palette` out of a component's spread attributes and fold it into `style` and
 * `data-palette`. Spread the result where the component spread its rest props: <div
 * {...withPalette(rest)}> With no palette the attributes come back unchanged (minus the `palette`
 * key), so a component that is never given one renders exactly as before.
 */
export function withPalette<T extends Attrs>(attrs: T): Omit<T, "palette"> {
  const { palette, ...rest } = attrs;
  const vars = paletteVars(palette);
  const keys = Object.keys(vars);
  if (keys.length === 0) return rest;
  const declarations = keys.map((k) => `${k}:${vars[k]};`).join("");
  return {
    ...rest,
    "data-palette": "",
    style: styleToString(rest.style) + declarations,
  } as Omit<T, "palette">;
}
