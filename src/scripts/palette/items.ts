import { SOURCE_LABELS, type CommonSpool, type LoadResult } from "@spoolsync/core/core/model";

import { formatWeight, type WeightUnit } from "~/lib/units";

import type { Rankable } from "./rank";

export type PaletteGroup = "Pages" | "Panels" | "Actions" | "Spools";

export interface PaletteItem extends Rankable {
  group: PaletteGroup;
  run(): void;
}

/** Same key as core's `spoolKey`: unique across services. Kept here so the palette stays small. */
export function spoolKeyOf(spool: Pick<CommonSpool, "source" | "sourceId">): string {
  return `${spool.source}:${spool.sourceId}`;
}

export function spoolTitle(spool: CommonSpool): string {
  return (
    [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ").trim() || spool.sourceId
  );
}

/** One entry per loaded spool; searching, not listing, is how they are reached. */
export function spoolItems(
  results: Iterable<LoadResult>,
  open: (key: string) => void,
  unit?: WeightUnit,
): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const result of results) {
    for (const spool of result.spools) {
      const key = spoolKeyOf(spool);
      items.push({
        id: `spool:${key}`,
        group: "Spools",
        title: spoolTitle(spool),
        subtitle: `${SOURCE_LABELS[spool.source]} · ${
          spool.remainingWeight === null
            ? "weight unknown"
            : `${formatWeight(spool.remainingWeight, unit)} left`
        }`,
        keywords: [spool.sourceId, spool.upc, spool.location, spool.lotNr, "spool", "weigh in scale"]
          .filter(Boolean)
          .join(" "),
        run: () => open(key),
      });
    }
  }
  return items;
}
