import { beforeEach, expect, test } from "bun:test";

import { EMPTY_VIEW, type ViewSettings } from "~/lib/saved-views";

import { wireViewsPanel, type ViewTable } from "./views-panel";

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

test("applying a saved view clears invalid weight input state", () => {
  localStorage.setItem(
    "spoolsync:saved-views",
    JSON.stringify([{ id: "all", name: "All spools", ...EMPTY_VIEW }]),
  );
  const root = document.createElement("section");
  document.body.append(root);
  let current: ViewSettings = { ...EMPTY_VIEW };
  const table: ViewTable = {
    getViewSettings: () => current,
    applyViewSettings: (settings) => {
      current = settings;
    },
    onRender: () => {},
  };
  wireViewsPanel(root, table, () => true);

  const min = root.querySelector<HTMLInputElement>("#view-min-grams")!;
  min.value = "-1";
  min.dispatchEvent(new Event("input"));
  expect(min.getAttribute("aria-invalid")).toBe("true");
  expect(root.querySelector('[role="alert"]')?.textContent).not.toBe("");

  const select = root.querySelector<HTMLSelectElement>("#view-select")!;
  select.value = "all";
  select.dispatchEvent(new Event("change"));

  expect(min.value).toBe("");
  expect(min.hasAttribute("aria-invalid")).toBe(false);
  expect(root.querySelector('[role="alert"]')?.textContent).toBe("");
});
