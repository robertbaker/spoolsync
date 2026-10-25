/**
 * Per-part style and copy overrides.
 *
 * `class` only reaches a component's root. Blocks that render inner elements (a title, a panel, a
 * list item) also accept a `classes` map keyed by part name, so a site can restyle any one of them
 * without a library release. Consumer classes are merged with `tailwind-merge`, so a conflicting
 * utility wins over the default instead of fighting it on specificity:
 *
 * <CallToActionSection classes={{ title: "text-6xl", panel: "rounded-none bg-card" }} />
 *
 * Hardcoded strings (aria labels, button text, empty-state copy) are exposed the same way through a
 * `labels` map, merged over the component's defaults with {@link withLabels}.
 */

import { twMerge } from "tailwind-merge";

/** Anything `class:list` accepts: strings, falsy values, nested arrays, `{ cls: boolean }` maps. */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | readonly ClassValue[]
  | { readonly [cls: string]: unknown };

/** Per-part class overrides. Parts a component does not render are ignored. */
export type ClassOverrides<Part extends string> = Partial<Record<Part, ClassValue>>;

/** Mix into a component's `Props` to declare the `classes` prop. */
export interface ClassesProps<Part extends string> {
  /** Extra classes for inner parts, merged over the defaults (conflicting utilities win). */
  classes?: ClassOverrides<Part>;
}

/** Mix into a component's `Props` to declare the `labels` prop. */
export interface LabelsProps<Labels extends object> {
  /** Override built-in copy and accessible names. Missing keys keep their defaults. */
  labels?: Partial<Labels>;
}

const flatten = (value: ClassValue, out: string[]): void => {
  if (!value && value !== 0) return;
  if (typeof value === "string" || typeof value === "number") {
    out.push(String(value));
  } else if (Array.isArray(value)) {
    for (const item of value) flatten(item, out);
  } else if (typeof value === "object") {
    for (const [cls, on] of Object.entries(value)) if (on) out.push(cls);
  }
};

/** Join class values and resolve Tailwind conflicts; later values win. */
export function cx(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) flatten(value, out);
  return twMerge(out.join(" "));
}

/**
 * Bind a `classes` map once, then resolve each part as `cls("title", "default classes", …)`. The
 * override for that part is appended last, so it wins any conflict.
 */
export function partClasses<Part extends string>(classes: ClassOverrides<Part> | undefined) {
  return (part: Part, ...base: ClassValue[]): string => cx(...base, classes?.[part]);
}

/** Merge consumer label overrides over defaults, ignoring `undefined` entries. */
export function withLabels<Labels extends object>(
  defaults: Labels,
  overrides: Partial<Labels> | undefined,
): Labels {
  if (!overrides) return defaults;
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}
