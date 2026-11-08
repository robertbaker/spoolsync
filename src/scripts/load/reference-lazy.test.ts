import { expect, mock, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";

import { wireLazyReferencePanel } from "./reference-lazy";

type Load = NonNullable<Parameters<typeof wireLazyReferencePanel>[3]>;
type Module = Awaited<ReturnType<Load>>;
type Wired = ReturnType<Module["wireReferencePanel"]>;

const loaded = () =>
  new Map<SourceId, LoadResult>([
    ["spoolman", { source: "spoolman", spools: [], warnings: [], loadedAt: "now" }],
  ]);

function fakeModule(selected: unknown = null) {
  const update = mock(() => {});
  const module = {
    wireReferencePanel: () =>
      ({ update, open() {}, controller: { selectedFor: () => selected } }) as unknown as Wired,
  } as Module;
  return { module, update };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("nothing is downloaded and the panel stays hidden until a spool is loaded", () => {
  const root = document.createElement("div");
  const load = mock(async () => fakeModule().module);
  wireLazyReferencePanel(root, new Map(), () => {}, load).update();
  expect(load).not.toHaveBeenCalled();
  expect(root.hidden).toBe(true);
});

test("the panel loads once, then takes every redraw and tells the page it is ready", async () => {
  const { module, update } = fakeModule({ reference: "chosen" });
  const load = mock(async () => module);
  const onReady = mock(() => {});
  const panel = wireLazyReferencePanel(document.createElement("div"), loaded(), onReady, load);
  panel.update();
  panel.update();
  expect(panel.selectedFor("spoolman:1")).toBeNull();
  await flush();
  expect(load).toHaveBeenCalledTimes(1);
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledTimes(1);
  panel.update();
  expect(update).toHaveBeenCalledTimes(2);
  expect(panel.selectedFor("spoolman:1")).toEqual({ reference: "chosen" } as never);
});

test("a failed download is tried again on the next redraw", async () => {
  const { module, update } = fakeModule();
  let attempts = 0;
  const load = mock(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("offline");
    return module;
  });
  const panel = wireLazyReferencePanel(document.createElement("div"), loaded(), () => {}, load);
  panel.update();
  await flush();
  panel.update();
  await flush();
  expect(load).toHaveBeenCalledTimes(2);
  expect(update).toHaveBeenCalledTimes(1);
});
