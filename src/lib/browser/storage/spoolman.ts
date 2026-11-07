import { read, write, local, session } from "./access";
import { invalidateApiInventory } from "./invalidate";

const CONNECTION_KEY = "spoolsync:spoolman-connection";
const TOKEN_KEY = "spoolsync:spoolman-token";

export interface StoredSpoolmanConnection {
  baseUrl: string;
  token?: string;
  /** Keep the token in localStorage across visits; otherwise it lasts for this tab only. */
  rememberToken: boolean;
}

export function loadSpoolmanConnection(): StoredSpoolmanConnection | null {
  const raw = read(local, CONNECTION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSpoolmanConnection>;
    if (typeof parsed.baseUrl !== "string" || !parsed.baseUrl) return null;
    const rememberToken = parsed.rememberToken === true;
    const token = read(rememberToken ? local : session, TOKEN_KEY) ?? undefined;
    return { baseUrl: parsed.baseUrl, rememberToken, ...(token ? { token } : {}) };
  } catch {
    return null;
  }
}

export function saveSpoolmanConnection(connection: StoredSpoolmanConnection): void {
  const previous = loadSpoolmanConnection();
  const nextToken = connection.token?.trim() || undefined;
  if (previous?.baseUrl !== connection.baseUrl || previous?.token !== nextToken) {
    invalidateApiInventory("spoolman");
  }
  write(
    local,
    CONNECTION_KEY,
    JSON.stringify({ baseUrl: connection.baseUrl, rememberToken: connection.rememberToken }),
  );
  const token = nextToken ?? null;
  write(connection.rememberToken ? local : session, TOKEN_KEY, token);
  write(connection.rememberToken ? session : local, TOKEN_KEY, null);
}

export function clearSpoolmanConnection(): void {
  invalidateApiInventory("spoolman");
  write(local, CONNECTION_KEY, null);
  write(local, TOKEN_KEY, null);
  write(session, TOKEN_KEY, null);
}
