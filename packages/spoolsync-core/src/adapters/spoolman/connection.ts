export interface SpoolmanConnection {
  /** Base URL as the user typed it, e.g. `http://192.168.1.20:7912`. */
  baseUrl: string;
  /** Spoolman-NG `SPOOLMAN_API_TOKEN`; upstream Spoolman has none. */
  token?: string | undefined;
  timeoutMs?: number | undefined;
}

export type SpoolmanErrorKind = "invalid-url" | "network" | "timeout" | "http" | "auth" | "parse";

export class SpoolmanError extends Error {
  constructor(
    readonly kind: SpoolmanErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SpoolmanError";
  }
}

/**
 * Parses and tidies a user-entered Spoolman URL. Accepts a bare host (`spoolman.local:7912`),
 * strips a trailing `/api/v1` and slashes, and refuses credentials in the URL.
 */
export function normalizeBaseUrl(input: string): URL {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new SpoolmanError("invalid-url", "Enter a URL such as http://192.168.1.20:7912");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SpoolmanError("invalid-url", "The URL must start with http:// or https://");
  }
  if (url.username || url.password) {
    throw new SpoolmanError("invalid-url", "Leave credentials out of the URL; use the token field");
  }
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether a hostname is on this machine or the home network: loopback, private IPv4 ranges,
 * link-local, unique-local IPv6, and `.local` / `.localhost` names.
 */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local"))
    return true;
  const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  return /^\[f[cd][0-9a-f]{2}:/.test(host) || host.startsWith("[fe80:");
}

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
