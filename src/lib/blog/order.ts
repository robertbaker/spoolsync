import type { CollectionEntry } from "astro:content";

/** Shared descending publication order for archive, topic, author, and related-post lists. */
export function newestFirst(a: CollectionEntry<"blog">, b: CollectionEntry<"blog">): number {
  return new Date(b.data.pubDate).valueOf() - new Date(a.data.pubDate).valueOf();
}
