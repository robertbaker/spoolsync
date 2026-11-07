import type { SpoolmanError } from "@spoolsync/core/adapters/spoolman";
import type { LoadResult } from "@spoolsync/core/core/model";

import {
  loadSpoolmanConnection,
  loadBambuddyConnection,
  saveBambuddyConnection,
  loadFilamentDbConnection,
  saveFilamentDbConnection,
  loadTigertagSession,
  saveTigertagSession,
} from "~/lib/browser/storage";

import { CONNECTION_CHANGED } from "../connections/events";
import { byId, h, notice } from "../dom";
import { plural, warningsNotice } from "./presentation";
import { wireRemoteSource } from "./remote-source";
import type { LoadContext } from "./state";

function success(result: LoadResult, from: string, includeWarnings = true): HTMLElement[] {
  const warnings = includeWarnings ? warningsNotice(result) : null;
  return [
    notice("success", `Loaded ${plural(result.spools.length, "spool")} from ${from}`),
    ...(warnings ? [warnings] : []),
  ];
}

function wireSpoolman(context: LoadContext): void {
  const button = byId<HTMLButtonElement>("spoolman-load");
  const target = byId("spoolman-target");
  // Read at use time: the connection can be edited in this page's settings panel.
  const refresh = () => {
    const connection = loadSpoolmanConnection();
    target.textContent = connection
      ? `From ${connection.baseUrl}`
      : "No Spoolman server configured yet.";
    button.disabled = !connection;
  };
  refresh();
  document.addEventListener(CONNECTION_CHANGED, refresh);
  wireRemoteSource(context, {
    source: "spoolman",
    button,
    message: byId("spoolman-message"),
    prepare() {
      const connection = loadSpoolmanConnection();
      if (!connection) return null;
      return {
        loading: notice("info", "Fetching…", h("p", {}, connection.baseUrl)),
        async load(signal) {
          const { loadSpoolman } = await import("@spoolsync/core/adapters/spoolman");
          return loadSpoolman(connection, { signal });
        },
        success: (result) => success(result, connection.baseUrl, false),
      };
    },
    error(error) {
      return notice(
        "error",
        "Could not load Spoolman",
        h("p", { class: "mt-1" }, (error as Error).message),
        (error as SpoolmanError).name === "SpoolmanError" &&
          (error as SpoolmanError).kind === "network"
          ? h(
              "p",
              { class: "mt-2" },
              h(
                "button",
                { type: "button", class: "underline", "data-open-settings": "spoolman" },
                "Test the connection to see why →",
              ),
            )
          : null,
      );
    },
  });
}

function wireBambuddy(context: LoadContext): void {
  const url = byId<HTMLInputElement>("bambuddy-url");
  const key = byId<HTMLInputElement>("bambuddy-key");
  const button = byId<HTMLButtonElement>("bambuddy-fetch");
  const message = byId("bambuddy-message");
  const previous = loadBambuddyConnection();
  if (previous) {
    url.value = previous.baseUrl;
    key.value = previous.apiKey;
  }
  button.disabled = !previous;
  const updateEnabled = () => {
    button.disabled = !url.value.trim() || !key.value.trim();
  };
  url.addEventListener("input", updateEnabled);
  key.addEventListener("input", updateEnabled);
  wireRemoteSource(context, {
    source: "bambuddy",
    button,
    message,
    prepare() {
      const connection = { baseUrl: url.value.trim().replace(/\/$/, ""), apiKey: key.value.trim() };
      if (!connection.baseUrl || !connection.apiKey) {
        message.replaceChildren(notice("error", "Enter the Bambuddy address and API key first."));
        return null;
      }
      return {
        loading: notice("info", "Fetching Bambuddy inventory…"),
        async load() {
          const { loadBambuddyApi } = await import("@spoolsync/core/adapters/bambuddy");
          return loadBambuddyApi(connection);
        },
        success(result) {
          saveBambuddyConnection(connection);
          return success(result, "Bambuddy.");
        },
      };
    },
  });
}

function wireFilamentDb(context: LoadContext): void {
  const url = byId<HTMLInputElement>("filamentdb-url");
  const token = byId<HTMLInputElement>("filamentdb-token");
  const button = byId<HTMLButtonElement>("filamentdb-fetch");
  const previous = loadFilamentDbConnection();
  if (previous) {
    url.value = previous.baseUrl;
    token.value = previous.token ?? "";
  }
  const updateEnabled = () => {
    button.disabled = !url.value.trim();
  };
  updateEnabled();
  url.addEventListener("input", updateEnabled);
  wireRemoteSource(context, {
    source: "filamentdb",
    button,
    message: byId("filamentdb-message"),
    finish: updateEnabled,
    prepare() {
      const value = token.value.trim();
      const connection = { baseUrl: url.value.trim(), ...(value ? { token: value } : {}) };
      return {
        loading: notice("info", "Fetching FilamentDB spools…"),
        async load() {
          const { loadFilamentDb } = await import("@spoolsync/core/adapters/filamentdb");
          return loadFilamentDb(connection);
        },
        success(result) {
          saveFilamentDbConnection(connection);
          return success(result, "FilamentDB.");
        },
      };
    },
  });
}

function wireTigertag(context: LoadContext): void {
  const button = byId<HTMLButtonElement>("tigertag-cloud");
  const hint = byId("tigertag-cloud-hint");
  const refresh = () => {
    const session = loadTigertagSession();
    button.disabled = !session;
    hint.replaceChildren();
    if (session) hint.textContent = `Signed in as ${session.email}`;
    else {
      const open = h(
        "button",
        { type: "button", class: "underline", "data-open-settings": "tigertag" },
        "Sign in",
      );
      hint.append("Not signed in. ", open);
    }
  };
  refresh();
  document.addEventListener(CONNECTION_CHANGED, refresh);
  wireRemoteSource(context, {
    source: "tigertag",
    button,
    message: byId("tigertag-message"),
    prepare() {
      const session = loadTigertagSession();
      if (!session) return null;
      return {
        loading: notice("info", "Fetching from TigerTag…"),
        async load() {
          const { loadTigertagCloud, TigertagCloud } =
            await import("@spoolsync/core/adapters/tigertag/cloud");
          return loadTigertagCloud(
            new TigertagCloud(session, (fresh) => saveTigertagSession(fresh, session.remember)),
          );
        },
        success: (result) => success(result, "TigerTag"),
      };
    },
  });
}

export function wireApiSources(context: LoadContext): void {
  wireSpoolman(context);
  wireBambuddy(context);
  wireFilamentDb(context);
  wireTigertag(context);
}
