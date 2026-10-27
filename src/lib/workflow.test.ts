import { expect, test } from "bun:test";

import { exportInventory, loadInventoryFile } from "@spoolsync/core/workflow";

test("JSON inventories accept a UTF-8 BOM and preserve unrelated backup data", async () => {
  const text = JSON.stringify({
    version: 1,
    filaments: [],
    printLogs: [{ id: "log-1" }],
    settings: { theme: "dark" },
  });
  const loaded = await loadInventoryFile("spoolio", `\uFEFF${text}`);
  const exported = await exportInventory("spoolio", loaded, []);
  expect(JSON.parse(exported.text)).toMatchObject(JSON.parse(text));
  expect(exported.total).toBe(0);
});

test("empty imports have an actionable error", async () => {
  for (const text of ["", " \r\n\t", "\uFEFF  "]) {
    expect(loadInventoryFile("spoolio", text)).rejects.toThrow("inventory file is empty");
  }
});

test("export rejects inventory belonging to another service", async () => {
  const loaded = await loadInventoryFile("spoolman", "[]");
  expect(exportInventory("spoolio", loaded, [])).rejects.toThrow(
    "Cannot export spoolman inventory as spoolio",
  );
});
