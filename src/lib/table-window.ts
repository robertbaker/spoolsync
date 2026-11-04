/**
 * Progressive rendering for the loaded-spools table. Building a few thousand rows of buttons and
 * listeners at once freezes the page, so the table draws a window of rows and offers "Show more".
 * Sorting, filtering and grouping still work on the whole list; only the DOM is windowed.
 */

/** Rows drawn first, and added by each "Show more". */
export const WINDOW_STEP = 200;

export interface WindowedSection<T> {
  label: string;
  /** The rows of this section that are drawn. */
  spools: T[];
  /** Every row the section has, drawn or not. */
  total: number;
}

export interface WindowedRows<T> {
  sections: WindowedSection<T>[];
  shown: number;
  total: number;
}

/** Keeps the first `limit` rows across sections, in order, and drops sections left empty. */
export function windowSections<T>(
  sections: ReadonlyArray<{ label: string; spools: readonly T[] }>,
  limit: number,
): WindowedRows<T> {
  const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : Number.POSITIVE_INFINITY;
  let remaining = cap;
  let total = 0;
  let shown = 0;
  const result: WindowedSection<T>[] = [];
  for (const section of sections) {
    total += section.spools.length;
    if (remaining <= 0) continue;
    const spools = section.spools.slice(0, remaining);
    remaining -= spools.length;
    shown += spools.length;
    if (spools.length) result.push({ label: section.label, spools, total: section.spools.length });
  }
  return { sections: result, shown, total };
}

/** The next window size after "Show more", never past the total. */
export function nextLimit(current: number, total: number, step: number = WINDOW_STEP): number {
  return Math.min(Math.max(current, 0) + step, Math.max(total, 0));
}
