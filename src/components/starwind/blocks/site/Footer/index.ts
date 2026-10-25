/**
 * Footer Components
 *
 * Shared, prop-driven footer sub-components for the site footer.
 */

export { default as FooterNav } from "./FooterNav.astro";
export { default as FooterContact } from "./FooterContact.astro";
export { default as SocialLinks } from "./SocialLinks.astro";

export type { FooterLink, FooterSection, SocialLink } from "./footerTypes";

export * from "./footerStyle";
