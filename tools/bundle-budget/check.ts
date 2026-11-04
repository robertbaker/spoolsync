/**
 * Size budgets for the built site's scripts and styles, measured gzipped (what visitors download).
 * A page script growing past its budget is a decision to make on purpose, not to find out later.
 * The budgets sit about 15% above the sizes when they were set; raise one in the same change that
 * adds the weight, with the reason in the commit.
 */
export interface Budgets {
  /** All JavaScript in `dist/_astro`. */
  totalJs: number;
  /** The single largest JavaScript file. */
  largestJs: number;
  /** All CSS in `dist/_astro`. */
  totalCss: number;
}

export const BUDGETS: Budgets = {
  totalJs: 330_000,
  largestJs: 65_000,
  totalCss: 50_000,
};

export interface AssetSize {
  file: string;
  gzipBytes: number;
}

export interface BudgetReport {
  totals: { js: number; css: number; largestJs: AssetSize | null };
  failures: string[];
}

const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;

export function checkBudgets(
  assets: readonly AssetSize[],
  budgets: Budgets = BUDGETS,
): BudgetReport {
  const js = assets.filter((asset) => asset.file.endsWith(".js"));
  const css = assets.filter((asset) => asset.file.endsWith(".css"));
  const sum = (list: readonly AssetSize[]) =>
    list.reduce((total, asset) => total + asset.gzipBytes, 0);
  const largestJs = js.reduce<AssetSize | null>(
    (largest, asset) => (!largest || asset.gzipBytes > largest.gzipBytes ? asset : largest),
    null,
  );
  const totals = { js: sum(js), css: sum(css), largestJs };
  const failures: string[] = [];
  if (totals.js > budgets.totalJs)
    failures.push(`JavaScript is ${kb(totals.js)} gzipped; the budget is ${kb(budgets.totalJs)}.`);
  if (largestJs && largestJs.gzipBytes > budgets.largestJs)
    failures.push(
      `${largestJs.file} is ${kb(largestJs.gzipBytes)} gzipped; no single script may exceed ${kb(budgets.largestJs)}.`,
    );
  if (totals.css > budgets.totalCss)
    failures.push(`CSS is ${kb(totals.css)} gzipped; the budget is ${kb(budgets.totalCss)}.`);
  return { totals, failures };
}
