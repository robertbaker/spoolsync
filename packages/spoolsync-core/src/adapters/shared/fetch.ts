export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Fetches with a deadline that runs until the response headers arrive. Reading the body is not
 * limited, so a large inventory is never cut off part-way through a download or after a write.
 * (`AbortSignal.timeout` would keep running into the body read, so it is not used here.)
 */
export async function fetchWithHeaderTimeout(
  fetchImpl: FetchLike,
  input: string | URL | Request,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
