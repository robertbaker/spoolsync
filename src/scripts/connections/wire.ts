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

import { wireCorsHelp } from "./cors";
import { announceConnectionChange } from "./events";
import { wirePasswordToggle } from "./presentation";
import { wireSpoolmanConnection } from "./spoolman";
import { wireTigertagConnection } from "./tigertag";

/** Wires whichever connection forms and help blocks exist on the current page. */
export function wireSpoolmanForm(): void {
  if (document.getElementById("cors-line")) wireCorsHelp();
  wirePasswordToggle("toggle-spoolman-token", "spoolman-token");
  wireSpoolmanConnection({
    browserEnvironment,
    diagnoseConnection,
    normalizeBaseUrl,
    clearSpoolmanConnection: () => {
      clearSpoolmanConnection();
      announceConnectionChange("spoolman");
    },
    loadSpoolmanConnection,
    saveSpoolmanConnection: (connection) => {
      saveSpoolmanConnection(connection);
      announceConnectionChange("spoolman");
    },
  });
}

export function wireTigertagForm(): void {
  wirePasswordToggle("toggle-tigertag-password", "tigertag-password");
  wireTigertagConnection({
    signIn,
    clearTigertagSession: () => {
      clearTigertagSession();
      announceConnectionChange("tigertag");
    },
    loadTigertagSession,
    saveTigertagSession: (session, remember) => {
      saveTigertagSession(session, remember);
      announceConnectionChange("tigertag");
    },
  });
}
