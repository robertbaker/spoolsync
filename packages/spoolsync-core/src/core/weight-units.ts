/** Weight units used by browser entry and weigh-in tools. Inventory values stay in grams. */
export type WeightUnit = "g" | "oz";

const GRAMS_PER_OUNCE = 28.349523125;

export function gramsToUnit(grams: number, unit: WeightUnit): number {
  return unit === "oz" ? grams / GRAMS_PER_OUNCE : grams;
}

export function unitToGrams(value: number, unit: WeightUnit): number {
  return unit === "oz" ? value * GRAMS_PER_OUNCE : value;
}
