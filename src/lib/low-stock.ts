import {
  DEFAULT_LOW_STOCK,
  sanitizeLowStockOverrides,
  isLowStockPercent,
  lowStockRule,
  type LowStockOverrides,
  type LowStockPolicy,
  type LowStockRule,
} from "@spoolsync/core/core/stock";

import { local, read, write } from "./browser/storage/access";

const KEY = "spoolsync:low-stock-percent";
const OVERRIDES_KEY = "spoolsync:low-stock-rules";
export const DEFAULT_LOW_STOCK_PERCENT = Math.round(DEFAULT_LOW_STOCK.fraction * 100);
/** Choices offered in the picker, from strict to generous. */
export const LOW_STOCK_CHOICES = [10, 15, 20, 25, 30, 40, 50] as const;

/** The visitor's saved threshold, or the default when none is saved or the value is unusable. */
export function loadLowStockPercent(): number {
  const saved = Number(read(local, KEY));
  return isLowStockPercent(saved) ? saved : DEFAULT_LOW_STOCK_PERCENT;
}

export function saveLowStockPercent(percent: number): void {
  write(local, KEY, isLowStockPercent(percent) ? String(percent) : null);
}

export function currentLowStockRule(): LowStockRule {
  return lowStockRule(loadLowStockPercent());
}

/** The default plus any per-spool, material, or brand overrides saved in this browser. */
export function loadLowStockPolicy(): LowStockPolicy {
  let saved: unknown;
  try {
    saved = JSON.parse(read(local, OVERRIDES_KEY) ?? "null");
  } catch {
    saved = null;
  }
  return {
    defaultPercent: loadLowStockPercent(),
    overrides: sanitizeLowStockOverrides(saved),
  };
}

export function saveLowStockOverrides(overrides: LowStockOverrides): boolean {
  const clean = sanitizeLowStockOverrides(overrides);
  const empty = !Object.values(clean).some((scope) => Object.keys(scope).length > 0);
  return write(local, OVERRIDES_KEY, empty ? null : JSON.stringify(clean));
}
