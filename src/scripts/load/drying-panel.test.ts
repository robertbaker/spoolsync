import { beforeEach, expect, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import { wireDryingPanel } from "./drying-panel";

const results = (...materials: Array<[string, string]>): Map<SourceId, LoadResult> =>
  new Map([
    [
      "spoolman",
      {
        source: "spoolman",
        spools: materials.map(([id, material]) =>
          makeSpool("spoolman", id, { vendor: "Acme", name: `Colour ${id}`, material }),
        ),
        warnings: [],
        loadedAt: "2026-11-04T10:00:00.000Z",
      },
    ],
  ]);

let root: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement("div");
  document.body.append(root);
});

test("stays hidden when nothing needs drying", () => {
  const panel = wireDryingPanel(root, results(["1", "PLA"]));
  panel.update();
  expect(root.hidden).toBe(true);
});

test("lists moisture-prone spools by material with the usual settings", () => {
  const panel = wireDryingPanel(root, results(["1", "PETG"], ["2", "Nylon"], ["3", "PLA"]));
  panel.update();
  expect(root.hidden).toBe(false);
  expect(root.textContent).toContain("Drying guide (2 spools worth drying)");
  const details = root.querySelector("details")!;
  details.open = true;
  details.dispatchEvent(new Event("toggle"));
  expect(root.textContent).toContain("Nylon (PA): 80 °C for 12 h (typical)");
  expect(root.textContent).toContain("PETG: 65 °C for 6 h (typical)");
  expect(root.textContent).not.toContain("Colour 3");
});

test("uses catalog drying settings and can include low-risk materials", () => {
  const panel = wireDryingPanel(root, results(["1", "PETG"], ["3", "PLA"]), (spool) =>
    spool.sourceId === "1" ? { dryingTemp: 70, dryingHours: 5 } : null,
  );
  panel.update();
  const details = root.querySelector("details")!;
  details.open = true;
  details.dispatchEvent(new Event("toggle"));
  expect(root.textContent).toContain("PETG: 70 °C for 5 h (from the catalog)");

  const include = root.querySelector<HTMLInputElement>("#drying-include-low")!;
  include.checked = true;
  include.dispatchEvent(new Event("change"));
  expect(root.textContent).toContain("Colour 3");
  expect(root.textContent).toContain("PLA: 45 °C for 4 h (typical)");
});
