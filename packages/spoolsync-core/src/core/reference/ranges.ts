/** Limits for reference values, applied when a record is read and again when one is restored. */
export type Range = readonly [number, number];

export const NOZZLE_RANGE: Range = [100, 500];
export const BED_RANGE: Range = [0, 200];
export const DIAMETER_RANGE: Range = [0.5, 10];
export const DENSITY_RANGE: Range = [0.5, 5];
export const WEIGHT_RANGE: Range = [1, 20_000];
export const EMPTY_SPOOL_RANGE: Range = [1, 3_000];
export const DRYING_TEMP_RANGE: Range = [30, 120];
export const DRYING_HOURS_RANGE: Range = [0.5, 48];
export const PRICE_RANGE: Range = [0, 100_000];

export function inRange(value: number, [low, high]: Range): boolean {
  return Number.isFinite(value) && value >= low && value <= high;
}
