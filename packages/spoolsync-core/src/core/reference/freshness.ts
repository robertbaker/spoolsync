import type { ReferenceIO } from "./fetch";
import type { ReferenceProvider } from "./providers";

/**
 * Asks a service whether its catalog changed since a copy was taken: one small request instead of
 * the whole catalog. Returns the service's token, or `null` when the provider has no such check or
 * the request failed (offline, blocked, unreadable). It never throws, so a failed check only means
 * "unknown", and the caller keeps whatever copy it has.
 */
export async function probeFreshness(
  provider: Pick<ReferenceProvider, "defaults">,
  io: Pick<ReferenceIO, "fetch">,
  signal?: AbortSignal,
): Promise<string | null> {
  const freshness = provider.defaults?.freshness;
  if (!freshness) return null;
  try {
    const response = await io.fetch(freshness.url, {
      headers: { Accept: "application/json" },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return null;
    return freshness.token(await response.json());
  } catch {
    return null;
  }
}
