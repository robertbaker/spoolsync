import { expect, test } from "bun:test";

import type { MatchResult } from "@spoolsync/core/core/match";
import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import { createApplyView } from "./apply-view";

test("downloadAll sets aria-busy and Downloading… during export and restores them in finally", async () => {
  localStorage.clear();
  document.body.replaceChildren();
  const applyEl = document.createElement("div");
  applyEl.id = "apply";
  const jumpEl = document.createElement("nav");
  jumpEl.id = "sync-jump";
  document.body.append(applyEl, jumpEl);

  const loaded = new Map<SourceId, LoadResult>([
    [
      "spoolio",
      {
        source: "spoolio",
        spools: [makeSpool("spoolio", "1", { name: "Original" })],
        warnings: [],
        loadedAt: "now",
      },
    ],
    [
      "tigertag",
      {
        source: "tigertag",
        spools: [makeSpool("tigertag", "1", { name: "Original" })],
        warnings: [],
        loadedAt: "now",
      },
    ],
  ]);

  const match: MatchResult = {
    suggestions: [],
    problems: [],
    groups: [
      {
        id: "g1",
        status: "linked",
        members: {
          spoolio: loaded.get("spoolio")!.spools[0]!,
          tigertag: loaded.get("tigertag")!.spools[0]!,
        },
      },
    ],
  };

  const renderApply = createApplyView(loaded, () => {}, {
    excluded: () => new Set(),
    setExcluded: () => {},
    decisions: () => ({ confirmed: [], rejected: [] }),
    recordEdits: () =>
      new Map([
        ["spoolio:1", { name: "Updated" }],
        ["tigertag:1", { name: "Updated" }],
      ]),
  });

  renderApply(match, new Map());

  const downloadAll = document.getElementById("download-all") as HTMLButtonElement | null;
  expect(downloadAll).not.toBeNull();
  const originalLabel = downloadAll!.textContent;
  expect(originalLabel).toBe("Download all 2 updated files");

  // Stub URL.createObjectURL / revokeObjectURL so download() succeeds in happy-dom without errors.
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
  try {
    downloadAll!.click();
    expect(downloadAll!.disabled).toBe(true);
    expect(downloadAll!.getAttribute("aria-busy")).toBe("true");
    expect(downloadAll!.textContent).toBe("Downloading…");

    // Wait for both sequential 250ms-paced downloads to finish.
    await new Promise((resolve) => setTimeout(resolve, 650));

    expect(downloadAll!.disabled).toBe(false);
    expect(downloadAll!.hasAttribute("aria-busy")).toBe(false);
    expect(downloadAll!.textContent).toBe(originalLabel);
  } finally {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  }
});
