import type { ColorVariant } from "../types/colors";

/** Contact method card displayed on contact-related UI surfaces. */
export interface ContactMethod {
  icon: string;
  title: string;
  description: string;
  value: string;
  link: string | null;
  color: ColorVariant;
}

/** Highlight explaining why a visitor should reach out. */
export interface WhyContactReason {
  icon: string;
  title: string;
  description: string;
  stat: string;
  color: ColorVariant;
}
