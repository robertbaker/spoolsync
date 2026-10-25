import type { BambuddyConnection } from "@spoolsync/core/adapters/bambuddy";
import type { FilamentDbConnection } from "@spoolsync/core/adapters/filamentdb";

import { read, write, session } from "./access";
import { invalidateApiInventory } from "./invalidate";
import { clearLoadResult } from "./inventories";

const BAMBUDDY_CONNECTION_KEY = "spoolsync:bambuddy-connection";
export function loadBambuddyConnection(): BambuddyConnection | null {
  try {
    const parsed = JSON.parse(
      read(session, BAMBUDDY_CONNECTION_KEY) ?? "null",
    ) as Partial<BambuddyConnection> | null;
    return parsed && typeof parsed.baseUrl === "string" && typeof parsed.apiKey === "string"
      ? (parsed as BambuddyConnection)
      : null;
  } catch {
    return null;
  }
}
export function saveBambuddyConnection(connection: BambuddyConnection): void {
  const previous = loadBambuddyConnection();
  if (previous?.baseUrl !== connection.baseUrl || previous?.apiKey !== connection.apiKey) {
    invalidateApiInventory("bambuddy");
  }
  write(session, BAMBUDDY_CONNECTION_KEY, JSON.stringify(connection));
}
export function clearBambuddyConnection(): void {
  write(session, BAMBUDDY_CONNECTION_KEY, null);
  clearLoadResult("bambuddy");
}
const FILAMENTDB_CONNECTION_KEY = "spoolsync:filamentdb-connection";
export function loadFilamentDbConnection(): FilamentDbConnection | null {
  try {
    const parsed = JSON.parse(
      read(session, FILAMENTDB_CONNECTION_KEY) ?? "null",
    ) as Partial<FilamentDbConnection> | null;
    return parsed && typeof parsed.baseUrl === "string" ? (parsed as FilamentDbConnection) : null;
  } catch {
    return null;
  }
}
export function saveFilamentDbConnection(connection: FilamentDbConnection): void {
  const previous = loadFilamentDbConnection();
  if (previous?.baseUrl !== connection.baseUrl || previous?.token !== connection.token) {
    invalidateApiInventory("filamentdb");
  }
  write(session, FILAMENTDB_CONNECTION_KEY, JSON.stringify(connection));
}
