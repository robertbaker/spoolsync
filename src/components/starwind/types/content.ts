/**
 * Content Collection Types
 *
 * TypeScript interfaces for content collections including services, blog posts, FAQ, testimonials,
 * and pricing.
 */

import type { ImageMetadata } from "astro";

/** Service page frontmatter schema */
export interface ServiceFrontmatter {
  title: string;
  subtitle: string;
  ctaText: string;
  heroImage: ImageMetadata;
  pricingService?: string;
  faqService?: string;
  testimonials?: string[];
  description?: string;
  publishDate?: Date;
}

/** Blog post frontmatter schema */
export interface BlogPostFrontmatter {
  title: string;
  description: string;
  publishDate: Date;
  author?: string;
  heroImage?: ImageMetadata;
  tags?: string[];
  draft?: boolean;
  featured?: boolean;
}

/** FAQ collection data structure */
export interface FAQData {
  service: string;
  questions: ReadonlyArray<{
    question: string;
    answer: string;
  }>;
}

/** Testimonial entry structure */
export interface Testimonial {
  id: string;
  name: string;
  role?: string;
  company?: string;
  content: string;
  rating?: number;
  image?: ImageMetadata | string;
  date?: Date;
}

/** Pricing collection data structure */
export interface PricingData {
  services: Readonly<
    Record<
      string,
      ReadonlyArray<{
        type: string;
        description: string;
        price: string;
      }>
    >
  >;
}
