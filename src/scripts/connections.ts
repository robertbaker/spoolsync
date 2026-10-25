import {
  browserEnvironment,
  diagnoseConnection,
  normalizeBaseUrl,
} from "@spoolsync/core/adapters/spoolman";
import { signIn } from "@spoolsync/core/adapters/tigertag/cloud";

import {
  clearSpoolmanConnection,
  clearTigertagSession,
  loadSpoolmanConnection,
  loadTigertagSession,
  saveSpoolmanConnection,
  saveTigertagSession,
} from "~/lib/browser/storage";

import { wireCorsHelp } from "./connections/cors";
import { wirePasswordToggle } from "./connections/presentation";
import { wireSpoolmanConnection } from "./connections/spoolman";
import { wireTigertagConnection } from "./connections/tigertag";
wireCorsHelp();
wirePasswordToggle("toggle-spoolman-token", "spoolman-token");
wirePasswordToggle("toggle-tigertag-password", "tigertag-password");
wireSpoolmanConnection({
  browserEnvironment,
  diagnoseConnection,
  normalizeBaseUrl,
  clearSpoolmanConnection,
  loadSpoolmanConnection,
  saveSpoolmanConnection,
});
wireTigertagConnection({ signIn, clearTigertagSession, loadTigertagSession, saveTigertagSession });
