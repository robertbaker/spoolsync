import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { defineCollection, type SchemaContext } from "astro:content";

const blogCollection = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/blog" }),
  schema: ({ image }: SchemaContext) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z
        .string()
        .min(1)
        .regex(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/, { message: "Invalid pubDate" }),
      author: z.string(),
      coverImage: image(),
      coverAlt: z.string(),
      tags: z.array(z.string()).optional(),
      series: z
        .object({
          name: z.string(),
          order: z.number(),
        })
        .optional(),
    }),
});

export const collections = {
  blog: blogCollection,
} as const;
