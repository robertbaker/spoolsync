import { SOURCE_IDS, SOURCE_LABELS, type SourceId } from "@spoolsync/core/core/model";
import type { FingerprintChanges, WeightChange } from "@spoolsync/core/workflow";

import { local, read, write } from "./browser/storage/access";

/**
 * "Since your last visit": what changed per spool between the previous file loaded for a service
 * and the one loaded now. The comparison itself is made when a file loads (see `LoadInsights`);
 * this module keeps a compact copy of the result so the panel still has it after a page reload, and
 * turns it into text. Like the snapshots it comes from, it holds ids, names and weights only.
 */

export const SINCE_VISIT_KEY = "spoolsync:since-visit";
/** Spools listed per kind of change and service; the counts still cover all of them. */
export const MAX_LISTED = 40;
const MAX_ID_LENGTH = 200;
const MAX_NAME_LENGTH = 80;

interface Named {
  id: string;
  name: string | null;
}

export interface VisitSummary {
  source: SourceId;
  /** When the file this one was compared with was loaded. */
  since: string;
  /** The `loadedAt` of the inventory this describes, to tell when it has gone stale. */
  loadedAt: string;
  added: Named[];
  removed: Named[];
  drops: WeightChange[];
  gains: WeightChange[];
  /** Full counts, which can exceed the listed spools. */
  counts: { added: number; removed: number; drops: number; gains: number };
  unchanged: number;
  /** Net change in grams over every spool that changed weight (negative means filament used). */
  netGrams: number;
}

const capped = <T>(items: readonly T[]): T[] => items.slice(0, MAX_LISTED);
const sum = (changes: readonly WeightChange[]): number =>
  changes.reduce((total, change) => total + change.delta, 0);

/** The summary for one comparison, or `null` when the file had nothing earlier to compare with. */
export function summarizeVisit(entry: {
  source: SourceId;
  loadedAt: string;
  since: string | null;
  changes: FingerprintChanges | null;
}): VisitSummary | null {
  const { changes, since } = entry;
  if (!changes || !since) return null;
  return {
    source: entry.source,
    since,
    loadedAt: entry.loadedAt,
    added: capped(changes.added),
    removed: capped(changes.removed),
    drops: capped(changes.drops),
    gains: capped(changes.gains),
    counts: {
      added: changes.added.length,
      removed: changes.removed.length,
      drops: changes.drops.length,
      gains: changes.gains.length,
    },
    unchanged: changes.unchanged,
    netGrams: Math.round(sum(changes.drops) + sum(changes.gains)),
  };
}

export const visitHasChanges = (visit: VisitSummary): boolean =>
  visit.counts.added + visit.counts.removed + visit.counts.drops + visit.counts.gains > 0;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000;
const isGrams = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e7;
const isIso = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

function cleanNamed(raw: unknown): Named[] {
  if (!Array.isArray(raw)) return [];
  const result: Named[] = [];
  for (const item of raw) {
    const entry = item as Partial<Named> | null;
    if (!entry || typeof entry.id !== "string" || !entry.id || entry.id.length > MAX_ID_LENGTH)
      continue;
    const name = typeof entry.name === "string" ? entry.name.slice(0, MAX_NAME_LENGTH) : null;
    result.push({ id: entry.id, name });
    if (result.length >= MAX_LISTED) break;
  }
  return result;
}

function cleanChanges(raw: unknown): WeightChange[] {
  if (!Array.isArray(raw)) return [];
  const result: WeightChange[] = [];
  for (const item of raw) {
    const entry = item as Partial<WeightChange> | null;
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !entry.id ||
      entry.id.length > MAX_ID_LENGTH ||
      !isGrams(entry.before) ||
      !isGrams(entry.after) ||
      !isGrams(entry.delta)
    )
      continue;
    result.push({
      id: entry.id,
      name: typeof entry.name === "string" ? entry.name.slice(0, MAX_NAME_LENGTH) : null,
      before: entry.before,
      after: entry.after,
      delta: entry.delta,
    });
    if (result.length >= MAX_LISTED) break;
  }
  return result;
}

/** Well-formed summaries for known services only; anything damaged or hand-edited is dropped. */
export function sanitizeVisits(raw: unknown): Partial<Record<SourceId, VisitSummary>> {
  const result: Partial<Record<SourceId, VisitSummary>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  for (const source of SOURCE_IDS) {
    const entry = (raw as Record<string, unknown>)[source] as Partial<VisitSummary> | undefined;
    if (!entry || typeof entry !== "object" || !isIso(entry.since) || !isIso(entry.loadedAt))
      continue;
    const counts = entry.counts as Partial<VisitSummary["counts"]> | undefined;
    if (
      !counts ||
      !isCount(counts.added) ||
      !isCount(counts.removed) ||
      !isCount(counts.drops) ||
      !isCount(counts.gains) ||
      !isCount(entry.unchanged) ||
      !isGrams(entry.netGrams)
    )
      continue;
    result[source] = {
      source,
      since: entry.since,
      loadedAt: entry.loadedAt,
      added: cleanNamed(entry.added),
      removed: cleanNamed(entry.removed),
      drops: cleanChanges(entry.drops),
      gains: cleanChanges(entry.gains),
      counts: {
        added: counts.added,
        removed: counts.removed,
        drops: counts.drops,
        gains: counts.gains,
      },
      unchanged: entry.unchanged,
      netGrams: entry.netGrams,
    };
  }
  return result;
}

/**
 * The summaries to show: fresh ones win over stored ones for the same service, and a summary is
 * kept only while its service is loaded and still holds the inventory it describes.
 */
export function currentVisits(
  stored: Partial<Record<SourceId, VisitSummary>>,
  fresh: readonly VisitSummary[],
  loadedAt: ReadonlyMap<SourceId, string>,
): VisitSummary[] {
  const merged = new Map<SourceId, VisitSummary>();
  for (const source of SOURCE_IDS) {
    const kept = stored[source];
    if (kept) merged.set(source, kept);
  }
  for (const visit of fresh) merged.set(visit.source, visit);
  return SOURCE_IDS.flatMap((source) => {
    const visit = merged.get(source);
    return visit && loadedAt.get(source) === visit.loadedAt ? [visit] : [];
  });
}

/** Filament used and added across the summaries, in grams, plus how many spools moved. */
export function visitTotals(visits: readonly VisitSummary[]): {
  usedGrams: number;
  refilledGrams: number;
  spoolsChanged: number;
} {
  let used = 0;
  let refilled = 0;
  let changed = 0;
  for (const visit of visits) {
    used += -sum(visit.drops);
    refilled += sum(visit.gains);
    changed += visit.counts.drops + visit.counts.gains;
  }
  return {
    usedGrams: Math.round(used),
    refilledGrams: Math.round(refilled),
    spoolsChanged: changed,
  };
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

const label = (item: Named): string =>
  item.name ? `${item.name} (ID ${item.id})` : `ID ${item.id}`;

/** Plain text for the clipboard. `weight` formats grams in the visitor's unit. */
export function visitText(
  visits: readonly VisitSummary[],
  weight: (grams: number) => string,
  dateOf: (iso: string) => string = (iso) => iso.slice(0, 10),
): string {
  if (!visits.length) return "SpoolSync: no earlier file to compare with yet.";
  const lines = ["SpoolSync: what changed since your last visit"];
  for (const visit of visits) {
    lines.push("", `${SOURCE_LABELS[visit.source]} (compared with ${dateOf(visit.since)})`);
    if (!visitHasChanges(visit)) {
      lines.push(`- No changes (${plural(visit.unchanged, "spool")} the same).`);
      continue;
    }
    for (const drop of visit.drops)
      lines.push(
        `- Used ${weight(-drop.delta)}: ${label(drop)} (${weight(drop.before)} to ${weight(drop.after)})`,
      );
    if (visit.counts.drops > visit.drops.length)
      lines.push(`- ...and ${visit.counts.drops - visit.drops.length} more with less filament`);
    for (const gain of visit.gains)
      lines.push(
        `- Gained ${weight(gain.delta)}: ${label(gain)} (${weight(gain.before)} to ${weight(gain.after)})`,
      );
    if (visit.counts.gains > visit.gains.length)
      lines.push(`- ...and ${visit.counts.gains - visit.gains.length} more with more filament`);
    for (const item of visit.added) lines.push(`- Added: ${label(item)}`);
    if (visit.counts.added > visit.added.length)
      lines.push(`- ...and ${visit.counts.added - visit.added.length} more added`);
    for (const item of visit.removed) lines.push(`- Removed: ${label(item)}`);
    if (visit.counts.removed > visit.removed.length)
      lines.push(`- ...and ${visit.counts.removed - visit.removed.length} more removed`);
  }
  return lines.join("\n");
}

// ---- Storage --------------------------------------------------------------------------------

export function readVisits(): Partial<Record<SourceId, VisitSummary>> {
  try {
    return sanitizeVisits(JSON.parse(read(local, SINCE_VISIT_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

/** Keeps exactly these summaries (an empty list removes the entry). Returns false when it fails. */
export function writeVisits(visits: readonly VisitSummary[]): boolean {
  if (!visits.length) return write(local, SINCE_VISIT_KEY, null);
  return write(
    local,
    SINCE_VISIT_KEY,
    JSON.stringify(Object.fromEntries(visits.map((visit) => [visit.source, visit]))),
  );
}
