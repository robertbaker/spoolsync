import {
  decodeSnapshot,
  snapshotPath,
  type ReferenceProviderId,
  type ReferenceSnapshot,
} from "@spoolsync/core/core/reference";

/** Largest snapshot the page will read; the biggest real one is about 5 MB of text. */
const MAX_SNAPSHOT_CHARS = 60_000_000;

/**
 * Reads the catalog snapshot the site was built with (`/reference/<provider>.json`, see
 * `tools/reference-snapshot.ts`). It comes from SpoolSync's own host, so it costs the reference
 * service nothing, and the ordinary HTTP cache serves repeat visits. A site built without one (the
 * service was down at build time, or this is the dev server) answers 404 and gives `null`, and the
 * caller fetches live instead.
 */
export const browserSnapshots = {
  async load(
    providerId: ReferenceProviderId,
    signal?: AbortSignal,
  ): Promise<ReferenceSnapshot | null> {
    try {
      const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
      const response = await fetch(`${base}${snapshotPath(providerId)}`, {
        credentials: "same-origin",
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) return null;
      const text = await response.text();
      if (text.length > MAX_SNAPSHOT_CHARS) return null;
      return decodeSnapshot(JSON.parse(text));
    } catch {
      return null;
    }
  },
};
