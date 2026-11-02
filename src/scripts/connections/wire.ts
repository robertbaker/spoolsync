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
import { CONNECTION_CHANGED } from "./events";
import { wirePasswordToggle } from "./presentation";
import { wireSpoolmanConnection } from "./spoolman";
import { wireTigertagConnection } from "./tigertag";

const notify = () => document.dispatchEvent(new CustomEvent(CONNECTION_CHANGED));

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
      notify();
    },
    loadSpoolmanConnection,
    saveSpoolmanConnection: (connection) => {
      saveSpoolmanConnection(connection);
      notify();
    },
  });
}

export function wireTigertagForm(): void {
  wirePasswordToggle("toggle-tigertag-password", "tigertag-password");
  wireTigertagConnection({
    signIn,
    clearTigertagSession: () => {
      clearTigertagSession();
      notify();
    },
    loadTigertagSession,
    saveTigertagSession: (session, remember) => {
      saveTigertagSession(session, remember);
      notify();
    },
  });
}
