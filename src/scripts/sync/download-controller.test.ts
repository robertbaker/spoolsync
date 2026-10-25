import { expect, mock, test } from "bun:test";

import type { LoadResult, WritableSourceId } from "@spoolsync/core/core/model";
import type { InventoryExport } from "@spoolsync/core/workflow";

import { DownloadController } from "./download-controller";

function fixture(source: WritableSourceId = "filameter") {
  const inventory: LoadResult = { source, spools: [], warnings: [], loadedAt: "now" };
  const result: InventoryExport = {
    source,
    text: "primary-json",
    mediaType: "application/json",
    total: 1,
    updated: 1,
    created: 0,
    warnings: ["Primary warning"],
    alternateFiles: [
      {
        extension: "csv",
        mediaType: "text/csv",
        text: "alternate-csv",
        label: "CSV",
        warnings: ["CSV metadata warning"],
      },
    ],
  };
  const exportInventory = mock(async () => result);
  const download = mock((_filename: string, _text: string, _type: string) => {});
  const controller = new DownloadController({
    exportInventory,
    download,
    today: () => "2026-10-27",
  });
  return {
    inventory,
    result,
    exportInventory,
    download,
    controller,
    status: document.createElement("div"),
  };
}

test("alternate downloads retain their format, filename, counts and combined warnings", async () => {
  const f = fixture();
  await f.controller.run("filameter", () => f.inventory, [], f.status, 0);
  expect(f.download).toHaveBeenCalledWith("filameter-2026-10-27.csv", "alternate-csv", "text/csv");
  expect(f.status.textContent).toContain("Downloaded 1 FilaMeter row");
  expect(f.status.textContent).toContain("1 updated, 0 new.");
  expect(f.status.textContent).toContain("Primary warning");
  expect(f.status.textContent).toContain("CSV metadata warning");
  expect(f.result.warnings).toEqual(["Primary warning"]);
});

test("TigerTag uses record counts and retains Restore guidance even without export warnings", async () => {
  const f = fixture("tigertag");
  f.result.records = 2;
  f.result.warnings = [];
  await f.controller.run("tigertag", () => f.inventory, [], f.status);
  expect(f.download).toHaveBeenCalledWith(
    "tigertag-spoolsync-2026-10-27.ttag",
    "primary-json",
    "application/json",
  );
  expect(f.status.textContent).toContain("Downloaded 2 records");
  expect(f.status.textContent).toContain("choose Restore");
});

test("Spoolman downloads retain their filename and negative-ID explanation", async () => {
  const f = fixture("spoolman");
  await f.controller.run("spoolman", () => f.inventory, [], f.status);
  expect(f.download).toHaveBeenCalledWith(
    "spoolman-spools-2026-10-27.json",
    "primary-json",
    "application/json",
  );
  expect(f.status.textContent).toContain("new spools have negative IDs");
});

test("export errors replace the status without initiating a download", async () => {
  const f = fixture();
  f.exportInventory.mockRejectedValue(new Error("Cannot export this inventory"));
  await f.controller.run("filameter", () => f.inventory, [], f.status);
  expect(f.download).not.toHaveBeenCalled();
  expect(f.status.querySelector('[role="alert"]')).not.toBeNull();
  expect(f.status.textContent).toContain("Could not export inventory");
  expect(f.status.textContent).toContain("Cannot export this inventory");
});

test("inventory getters are evaluated for each download attempt", async () => {
  const f = fixture();
  let current = f.inventory;
  const getInventory = () => current;
  await f.controller.run("filameter", getInventory, [], f.status);
  current = { ...f.inventory, loadedAt: "newer" };
  await f.controller.run("filameter", getInventory, [], f.status);
  expect(f.exportInventory).toHaveBeenLastCalledWith("filameter", current, []);
});
