import type { GroupResolution } from "@spoolsync/core/core/compare";
import { canonicalDecisions, type MatchDecisions } from "@spoolsync/core/core/match";

import { read, write, local, session } from "./access";

const DECISIONS_KEY = "spoolsync:match-decisions";
const RESOLUTIONS_KEY = "spoolsync:resolutions";

/** Match confirmations and rejections, kept across visits so the same question is not asked twice. */
export function loadMatchDecisions(): MatchDecisions {
  const raw = read(local, DECISIONS_KEY);
  // Charts, the action bar and the Sync page ask on every render; parse only when the stored text
  // changed. Callers get their own arrays, so mutating a result never corrupts the cache.
  if (!lastDecisions || lastDecisions.raw !== raw)
    lastDecisions = { raw, decisions: parseDecisions(raw) };
  const { confirmed, rejected } = lastDecisions.decisions;
  return { confirmed: [...confirmed], rejected: [...rejected] };
}

let lastDecisions: { raw: string | null; decisions: MatchDecisions } | null = null;

function parseDecisions(raw: string | null): MatchDecisions {
  try {
    const parsed = JSON.parse(raw ?? "{}") as Partial<MatchDecisions>;
    // Decisions saved before `%` and `|` in record IDs were escaped are re-keyed on read.
    return canonicalDecisions({
      confirmed: Array.isArray(parsed.confirmed)
        ? parsed.confirmed.filter((p) => typeof p === "string")
        : [],
      rejected: Array.isArray(parsed.rejected)
        ? parsed.rejected.filter((p) => typeof p === "string")
        : [],
    });
  } catch {
    return { confirmed: [], rejected: [] };
  }
}

export function saveMatchDecisions(decisions: MatchDecisions): void {
  write(local, DECISIONS_KEY, JSON.stringify(decisions));
}

/** Choices made on the sync page, for this tab only. */
export function loadResolutions(): Map<string, GroupResolution> {
  try {
    const parsed = JSON.parse(read(session, RESOLUTIONS_KEY) ?? "[]") as Array<
      [string, GroupResolution]
    >;
    return new Map(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Map();
  }
}

export function saveResolutions(resolutions: ReadonlyMap<string, GroupResolution>): void {
  write(session, RESOLUTIONS_KEY, JSON.stringify([...resolutions]));
}

export function clearResolutions(): void {
  write(session, RESOLUTIONS_KEY, null);
}

export function clearMatchDecisions(): void {
  write(local, DECISIONS_KEY, null);
}
