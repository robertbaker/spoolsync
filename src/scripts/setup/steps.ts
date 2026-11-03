import { SOURCE_IDS, type SourceId } from "@spoolsync/core/core/model";

import { local, read, write } from "~/lib/browser/storage/access";

export const SETUP_DISMISSED_KEY = "spoolsync:setup-dismissed";

export type SetupStep =
  | { kind: "choose" }
  | { kind: "guide"; source: SourceId }
  | { kind: "load" };

/** Keeps known services only, once each, in the order the Load page lists them. */
export function normalizeSelection(selected: Iterable<string>): SourceId[] {
  const wanted = new Set(selected);
  return SOURCE_IDS.filter((id) => wanted.has(id));
}

/** The wizard's pages: pick apps, one how-to per app, then load files. */
export function buildSteps(selected: Iterable<string>): SetupStep[] {
  return [
    { kind: "choose" },
    ...normalizeSelection(selected).map((source): SetupStep => ({ kind: "guide", source })),
    { kind: "load" },
  ];
}

/** Keeps a step number inside the list, so a changed selection never leaves the wizard stranded. */
export function clampStep(index: number, steps: readonly SetupStep[]): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(steps.length - 1, 0));
}

export function isSetupDismissed(): boolean {
  return read(local, SETUP_DISMISSED_KEY) === "1";
}

export function dismissSetup(): void {
  write(local, SETUP_DISMISSED_KEY, "1");
}

export function resetSetupDismissal(): void {
  write(local, SETUP_DISMISSED_KEY, null);
}

export interface AutoOpenContext {
  loadedCount: number;
  dismissed: boolean;
  /** The URL's query string, so a link with its own purpose is not interrupted. */
  search: string;
  /** Browser automation (`navigator.webdriver`) never gets an unprompted dialog in front of the page. */
  automated?: boolean;
}

/** Whether to offer the guide unprompted: only to someone with nothing loaded who has not said no. */
export function shouldAutoOpen({
  loadedCount,
  dismissed,
  search,
  automated = false,
}: AutoOpenContext): boolean {
  if (dismissed || loadedCount > 0 || automated) return false;
  const params = new URLSearchParams(search);
  return !["sample", "tour", "spool", "panel"].some((name) => params.has(name));
}
