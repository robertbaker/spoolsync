/** Footer Component Types */

export interface FooterLink {
  href: string;
  label: string;
  ariaLabel?: string;
  external?: boolean;
}

export interface FooterSection {
  id: string;
  title: string;
  links: readonly FooterLink[];
}

export interface SocialLink {
  facebook?: string;
  twitter?: string;
  x?: string;
  github?: string;
  linkedin?: string;
  youtube?: string;
  instagram?: string;
  tiktok?: string;
  yelp?: string;
  trustpilot?: string;
  tripadvisor?: string;
  google?: string;
  googlemaps?: string;
  applemaps?: string;
  apple?: string;
  glassdoor?: string;
  pinterest?: string;
  reddit?: string;
  threads?: string;
  bluesky?: string;
  discord?: string;
  slack?: string;
  mastodon?: string;
  dribbble?: string;
  behance?: string;
  medium?: string;
  whatsapp?: string;
  telegram?: string;
  [key: string]: string | undefined;
}
