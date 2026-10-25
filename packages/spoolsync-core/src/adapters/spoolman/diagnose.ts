import {
  isLocalHostname,
  needsLocalNetworkFlag,
  SpoolmanClient,
  SpoolmanError,
  type SpoolmanConnection,
} from "./client";
import type { SpoolmanInfo } from "./schema";

export type DiagnosisCode =
  | "ok"
  | "invalid-url"
  | "auth"
  | "cors"
  | "local-network-denied"
  | "mixed-content-unsupported"
  | "unreachable"
  | "timeout"
  | "not-spoolman";

export interface Diagnosis {
  code: DiagnosisCode;
  title: string;
  detail: string;
  /** A line to paste into Spoolman's environment, when that is the fix. */
  envLine?: string;
  info?: SpoolmanInfo;
  spoolCount?: number;
}

interface Environment {
  pageOrigin: string;
  pageProtocol: string;
  pageHostname: string;
  /**
   * Whether the browser supports Chrome's Local Network Access (and so the mixed-content
   * exemption).
   */
  supportsLocalNetworkAccess: boolean;
  localNetworkPermission: PermissionState | "unknown";
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}

export async function browserEnvironment(): Promise<Environment> {
  let localNetworkPermission: Environment["localNetworkPermission"] = "unknown";
  let supportsLocalNetworkAccess = false;
  try {
    const status = await navigator.permissions.query({
      name: "local-network-access" as PermissionName,
    });
    localNetworkPermission = status.state;
    supportsLocalNetworkAccess = true;
  } catch {
    // Not Chromium, or a Chromium without Local Network Access.
  }
  return {
    pageOrigin: location.origin,
    pageProtocol: location.protocol,
    pageHostname: location.hostname,
    supportsLocalNetworkAccess,
    localNetworkPermission,
  };
}

/**
 * Tests a connection and, when it fails, works out why. Browsers hide the cause of a failed
 * cross-origin fetch, so this narrows it down: a `no-cors` probe that succeeds means the server is
 * up and only CORS is missing.
 */
export async function diagnoseConnection(
  connection: SpoolmanConnection,
  env: Environment,
): Promise<Diagnosis> {
  let client: SpoolmanClient;
  try {
    client = new SpoolmanClient(connection, env.fetchImpl, env.pageProtocol);
  } catch (error) {
    return { code: "invalid-url", title: "Invalid URL", detail: (error as Error).message };
  }
  const corsLine = `SPOOLMAN_CORS_ORIGIN=${env.pageOrigin}`;

  try {
    const info = await client.info();
    const spools = await client.listSpools();
    return {
      code: "ok",
      title: `Connected to Spoolman ${info.version}`,
      detail: `${spools.length} spool${spools.length === 1 ? "" : "s"} found.`,
      info,
      spoolCount: spools.length,
    };
  } catch (error) {
    if (!(error instanceof SpoolmanError)) throw error;
    switch (error.kind) {
      case "auth":
        return { code: "auth", title: "Authentication required", detail: error.message };
      case "timeout":
        return { code: "timeout", title: "Connection timed out", detail: error.message };
      case "parse":
      case "http":
        return {
          code: "not-spoolman",
          title: "Unexpected response from server",
          detail: `${error.message}. Make sure the URL points to your Spoolman web UI.`,
        };
      case "invalid-url":
        return { code: "invalid-url", title: "Invalid URL", detail: error.message };
      case "network":
        break;
    }
  }

  const mixed = needsLocalNetworkFlag(client.baseUrl, env.pageProtocol);
  if (mixed && !env.supportsLocalNetworkAccess) {
    return {
      code: "mixed-content-unsupported",
      title: "Browser blocked plain http:// from an https:// page",
      detail:
        "Use Chrome, Edge, or another Chromium browser (version 142+), which can reach http:// devices on your local network once allowed—or serve Spoolman over HTTPS.",
    };
  }
  // Local Network Access only gates a public page reaching into the local network.
  const crossesIntoLocalNetwork =
    !isLocalHostname(env.pageHostname) && isLocalHostname(client.baseUrl.hostname);
  if (crossesIntoLocalNetwork && env.localNetworkPermission === "denied") {
    return {
      code: "local-network-denied",
      title: "Local network access is blocked",
      detail:
        "Allow this site to access devices on your local network (via the address bar icon or site settings), then test again.",
    };
  }

  // A no-cors request succeeds whenever the server answers, CORS or not.
  try {
    const fetchImpl = env.fetchImpl ?? ((input: string, init?: RequestInit) => fetch(input, init));
    await fetchImpl(client.apiUrl("/health"), {
      ...client.requestInit(),
      mode: "no-cors",
      headers: {},
    });
    return {
      code: "cors",
      title: "Spoolman is reachable, but CORS is not configured for this site",
      detail: `Add this to Spoolman's environment (docker-compose.yml \`environment:\` or .env) and restart the server. On Spoolman-NG, also include the Spoolman host in SPOOLMAN_ALLOWED_HOSTS if configured.`,
      envLine: corsLine,
    };
  } catch {
    return {
      code: "unreachable",
      title: "Could not reach Spoolman",
      detail: `No response from ${client.baseUrl.origin}. Check the address and port, verify Spoolman is running, and ensure this device is on the same network. If Spoolman is running, it may also need ${corsLine}.`,
      envLine: corsLine,
    };
  }
}
