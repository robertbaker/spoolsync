import { expect, mock, test } from "bun:test";

import type { PlannedUpdate } from "@spoolsync/core/core/compare";
import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";
import { buildRollback, serializeRollback } from "@spoolsync/core/workflow";

import type { ApplyController } from "./apply-controller";
import { createRollbackView, rollbackEnabled, rollbackToggle } from "./rollback-view";

const update = (id: string, from: number | null, to: number): PlannedUpdate => ({
  kind: "update",
  source: "spoolman",
  groupId: `g${id}`,
  spool: makeSpool("spoolman", id, { vendor: "Prusament", material: "PLA", name: `Galaxy ${id}` }),
  changes: [{ field: "density", from, to }],
  links: {},
});

const file = (text: string) => ({ name: "rollback.json", text: async () => text });

function setup(loaded: Map<SourceId, LoadResult>) {
  const run = mock(async () => {});
  const controller = { run, logs: new Map() } as unknown as ApplyController;
  const view = createRollbackView(loaded, controller);
  document.body.append(view.container);
  const input = view.container.querySelector<HTMLInputElement>("#rollback-file")!;
  const choose = async (text: string) => {
    Object.defineProperty(input, "files", { configurable: true, value: [file(text)] });
    input.dispatchEvent(new Event("change"));
    await new Promise((resolve) => setTimeout(resolve, 5));
  };
  return { view, run, choose };
}

const spoolmanLoaded = (density: number | null) =>
  new Map<SourceId, LoadResult>([
    [
      "spoolman",
      {
        source: "spoolman",
        spools: [
          makeSpool("spoolman", "1", {
            vendor: "Prusament",
            material: "PLA",
            name: "Galaxy 1",
            density,
          }),
        ],
        warnings: [],
        loadedAt: "2026-11-04T10:05:00.000Z",
      },
    ],
  ]);

const rollbackText = () =>
  serializeRollback(
    buildRollback("spoolman", [update("1", null, 1.24)], { target: "Spoolman", now: new Date() }),
  );

test("a file that is not a rollback file is explained, and a service that is not loaded is asked for", async () => {
  const { view, choose } = setup(new Map());
  await choose("not json");
  expect(view.container.textContent).toContain("Cannot use that file");
  expect(view.container.textContent).toContain("not valid JSON");
  await choose(rollbackText());
  expect(view.container.textContent).toContain("Load Spoolman first");
});

test("it shows what can be put back and restores it through the confirmed apply step", async () => {
  const { view, run, choose } = setup(spoolmanLoaded(1.24));
  await choose(rollbackText());
  expect(view.container.textContent).toContain("1 field in 1 spool can be put back");
  expect(view.container.textContent).toContain("Density");
  const restore = view.container.querySelector<HTMLButtonElement>(
    "[data-action='restore-rollback']",
  )!;
  expect(restore.disabled).toBe(false);
  restore.click();
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(run).toHaveBeenCalledTimes(1);
  const [source, changes] = run.mock.calls[0] as unknown as [string, PlannedUpdate[]];
  expect(source).toBe("spoolman");
  expect(changes[0]!.changes).toEqual([{ field: "density", from: 1.24, to: null }]);
});

test("a field changed again since is left alone and nothing is offered", async () => {
  const { view, run, choose } = setup(spoolmanLoaded(1.5));
  await choose(rollbackText());
  expect(view.container.textContent).toContain("0 fields in 0 spools can be put back");
  expect(view.container.textContent).toContain("changed again");
  const restore = view.container.querySelector<HTMLButtonElement>(
    "[data-action='restore-rollback']",
  )!;
  expect(restore.disabled).toBe(true);
  expect(run).not.toHaveBeenCalled();
});

test("the checkbox is on by default and remembers being turned off", () => {
  localStorage.clear();
  expect(rollbackEnabled()).toBe(true);
  const toggle = rollbackToggle();
  document.body.append(toggle);
  const box = toggle.querySelector<HTMLInputElement>("#rollback-before-apply")!;
  expect(box.checked).toBe(true);
  box.checked = false;
  box.dispatchEvent(new Event("change"));
  expect(rollbackEnabled()).toBe(false);
  box.checked = true;
  box.dispatchEvent(new Event("change"));
  expect(rollbackEnabled()).toBe(true);
  localStorage.clear();
});
