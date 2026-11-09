export const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether a request from this page to `url` needs Chrome's Local Network Access exemption: an https
 * page calling plain http. Flagging it `targetAddressSpace: "local"` lets Chromium allow it (after
 * the user grants the permission prompt) instead of blocking it as mixed content. Loopback is
 * already trusted, and https targets are not mixed content.
 *
 * @see https://developer.chrome.com/blog/local-network-access
 */
export function needsLocalNetworkFlag(url: URL, pageProtocol: string | undefined): boolean {
  return (
    pageProtocol === "https:" &&
    url.protocol === "http:" &&
    !LOOPBACK_HOSTS.has(url.hostname) &&
    !url.hostname.startsWith("127.")
  );
}

/** Extra `fetch` options for a self-hosted server at `baseUrl`; none when it needs no exemption. */
export function localNetworkInit(
  baseUrl: string,
  pageProtocol: string | undefined = globalThis.location?.protocol,
): { targetAddressSpace?: string } {
  return needsLocalNetworkFlag(new URL(baseUrl), pageProtocol)
    ? { targetAddressSpace: "local" }
    : {};
}
