/** Services storing total/used weights need an explicit fallback for incomplete source data. */
export function exportWeights(
  initial: number | null,
  remaining: number | null,
  label: string,
): {
  total: number;
  used: number;
  warnings: string[];
} {
  const total = initial ?? remaining ?? 0;
  const warnings: string[] = [];
  if (
    [initial, remaining].some(
      (weight) => weight !== null && (!Number.isFinite(weight) || weight < 0),
    )
  )
    throw new Error(
      `${label}: weights must be non-negative numbers. Resolve the weights before exporting.`,
    );
  if (initial === null && remaining !== null)
    warnings.push(
      `${label}: initial weight was unknown; the remaining weight was used as the total.`,
    );
  if (remaining === null)
    warnings.push(`${label}: remaining weight was unknown; the exported spool is treated as full.`);
  if (initial !== null && remaining !== null && remaining > initial)
    throw new Error(
      `${label}: remaining weight cannot exceed initial weight. Resolve the weights before exporting.`,
    );
  return { total, used: Math.max(0, total - (remaining ?? total)), warnings };
}
