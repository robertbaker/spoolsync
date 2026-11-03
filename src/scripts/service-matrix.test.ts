import { beforeEach, expect, test } from "bun:test";

import { SERVICE_COUNT } from "~/lib/services";

import { matrixStatus, visibleServiceIds, wireServiceMatrix } from "./service-matrix";

test("filters narrow the list and search narrows it further", () => {
  expect(visibleServiceIds("", "all")).toHaveLength(SERVICE_COUNT);
  const writable = visibleServiceIds("", "write");
  expect(writable).toContain("spoolman");
  expect(writable).not.toContain("spoolstock");
  expect(visibleServiceIds("", "file")).not.toContain("spoolman");
  expect(visibleServiceIds("excel", "all")).toEqual(["spoolmaster"]);
  expect(visibleServiceIds("excel", "write")).toEqual([]);
  expect(visibleServiceIds("self-hosted", "api")).toEqual(["spoolman", "bambuddy", "filadex", "filamentdb"]);
});

test("the status sentence reflects the visible count", () => {
  expect(matrixStatus(SERVICE_COUNT, "", "all")).toBe(`Showing all ${SERVICE_COUNT} tools.`);
  expect(matrixStatus(2, "csv", "all")).toBe(`Showing 2 of ${SERVICE_COUNT} tools.`);
  expect(matrixStatus(0, "zzz", "all")).toBe("No tools match.");
  expect(matrixStatus(SERVICE_COUNT, "  ", "write")).toBe(`Showing ${SERVICE_COUNT} of ${SERVICE_COUNT} tools.`);
});

beforeEach(() => {
  document.body.innerHTML = `
    <input data-matrix-search />
    <button data-matrix-filter="all" aria-pressed="true">All</button>
    <button data-matrix-filter="write" aria-pressed="false">Write</button>
    <p id="matrix-status"></p>
    <ul>
      <li data-matrix-row="spoolman"></li>
      <li data-matrix-row="spoolstock"></li>
    </ul>
    <p id="matrix-empty" hidden></p>`;
});

test("wiring hides rows, marks the pressed filter, and shows the empty message", () => {
  wireServiceMatrix();
  const rows = [...document.querySelectorAll<HTMLElement>("[data-matrix-row]")];
  const writeButton = document.querySelector<HTMLButtonElement>('[data-matrix-filter="write"]')!;
  writeButton.click();
  expect(rows.map((row) => row.hidden)).toEqual([false, true]);
  expect(writeButton.getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelector('[data-matrix-filter="all"]')!.getAttribute("aria-pressed")).toBe("false");

  const search = document.querySelector<HTMLInputElement>("[data-matrix-search]")!;
  search.value = "no such tool";
  search.dispatchEvent(new Event("input"));
  expect(rows.every((row) => row.hidden)).toBe(true);
  expect(document.getElementById("matrix-empty")!.hidden).toBe(false);
  expect(document.getElementById("matrix-status")!.textContent).toBe("No tools match.");
});

test("wiring does nothing when the section is absent", () => {
  document.body.innerHTML = "";
  expect(() => wireServiceMatrix()).not.toThrow();
});
