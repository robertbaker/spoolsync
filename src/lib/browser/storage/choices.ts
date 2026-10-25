import type { GroupResolution } from "@spoolsync/core/core/compare";
import type { MatchDecisions } from "@spoolsync/core/core/match";

import { read, write, local, session } from "./access";

const DECISIONS_KEY = "spoolsync:match-decisions";
const RESOLUTIONS_KEY = "spoolsync:resolutions";

/** Match confirmations and rejections, kept across visits so the same question is not asked twice. */
export function loadMatchDecisions(): MatchDecisions {
  try {
    const parsed = JSON.parse(read(local, DECISIONS_KEY) ?? "{}") as Partial<MatchDecisions>;
    return {
      confirmed: Array.isArray(parsed.confirmed)
        ? parsed.confirmed.filter((p) => typeof p === "string")
        : [],
      rejected: Array.isArray(parsed.rejected)
        ? parsed.rejected.filter((p) => typeof p === "string")
        : [],
    };
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
