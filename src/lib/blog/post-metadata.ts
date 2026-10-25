import type { CollectionEntry } from "astro:content";

import { formatDate } from "~/components/starwind/lib/format";
import { SITE_TITLE, SITE_URL } from "~/config";

export function postMetadata(post: CollectionEntry<"blog">, coverImageSrc: string) {
  const siteBaseUrl = SITE_URL.startsWith("http") ? SITE_URL : `https://${SITE_URL}`;
  const canonicalUrl = new URL(`/resources/${post.id}/`, siteBaseUrl).toString();
  const publishDateIso = formatDate(post.data.pubDate, "iso");
  const postTopics = Array.from(new Set(post.data.tags ?? [])).filter(
    (tag): tag is string => typeof tag === "string" && tag.length > 0,
  );
  const articleStructuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.data.title,
    description: post.data.description,
    datePublished: publishDateIso,
    dateModified: publishDateIso,
    mainEntityOfPage: canonicalUrl,
    image: new URL(coverImageSrc, siteBaseUrl).toString(),
    author: {
      "@type": "Person",
      name: post.data.author,
    },
    publisher: {
      "@type": "Person",
      name: SITE_TITLE,
    },
    ...(postTopics.length ? { keywords: postTopics.join(", ") } : {}),
  };
  return { articleStructuredData, publishDateIso, postTopics };
}
