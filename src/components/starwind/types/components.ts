/**
 * Shared data structures used across multiple components
 *
 * NOTE: Component-specific props are now defined inline within component files to reduce file tree
 * jumping. This file only contains data structures that are used in multiple places (e.g., pricing
 * data, FAQ items).
 *
 * @module types/components
 */

/** Price type options for pricing items */
export type PriceType = "one-time" | "monthly" | "annually" | "per-service" | "custom";

/** Pricing item structure Used in PricingColorCycleGrid and pricing content collections */
export interface PricingItem {
  type: string;
  description: string;
  price: number | string;
  priceType?: PriceType;
}

/** FAQ item structure Used in FAQ component and FAQ content collections */
export interface FAQItem {
  question: string;
  answer: string;
  id?: string;
  icon?: string;
  subtitle?: string;
}
