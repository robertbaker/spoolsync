import {
  DEFAULT_LOW_STOCK,
  isLowStockPercent,
  lowStockRule,
  type LowStockRule,
} from "@spoolsync/core/core/stock";

import { local, read, write } from "./browser/storage/access";

const KEY = "spoolsync:low-stock-percent";
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
