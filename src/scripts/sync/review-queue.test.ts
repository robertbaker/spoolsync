import { describe, expect, test } from "bun:test";

import { ReviewQueue, resultAnnouncement } from "./review-queue";

describe("ReviewQueue", () => {
  test("steps through pairs in order and reports progress against the starting total", () => {
    const queue = new ReviewQueue();
    queue.sync(["a", "b", "c"]);
    expect(queue.view()).toMatchObject({ current: "a", position: 1, total: 3, pending: 3 });
    queue.sync(["b", "c"]);
    expect(queue.view()).toMatchObject({ current: "b", position: 2, total: 3, pending: 2 });
  });

  test("a skipped pair stays pending, is passed over, and is offered again at the end", () => {
    const queue = new ReviewQueue();
    queue.sync(["a", "b"]);
    queue.skip("a");
    expect(queue.view()).toMatchObject({ current: "b", skipped: 1, pending: 2 });
    queue.sync(["a"]);
    expect(queue.view()).toMatchObject({ current: null, skipped: 1, pending: 1 });
    queue.reviewSkipped();
    expect(queue.view()).toMatchObject({ current: "a", skipped: 0 });
  });

  test("a pair that returns after an undo becomes current; new pairs join the end", () => {
    const queue = new ReviewQueue();
    queue.sync(["a", "b", "c"]);
    queue.sync(["b", "c"]);
    queue.sync(["c"]);
    expect(queue.view().current).toBe("c");
    queue.sync(["b", "c"]);
    expect(queue.view()).toMatchObject({ current: "b", position: 2 });
    queue.sync(["b", "c", "d"]);
    expect(queue.view().total).toBe(4);
  });

  test("skipping something that is not pending does nothing", () => {
    const queue = new ReviewQueue();
    queue.sync(["a"]);
    queue.skip("zzz");
    expect(queue.view().skipped).toBe(0);
  });
});

describe("resultAnnouncement", () => {
  const done = { current: null, position: 0, total: 2, pending: 0, skipped: 0 };
  test("says when the review is finished or only skipped pairs remain", () => {
    expect(resultAnnouncement("same", done)).toBe(
      "Marked as the same spool. All matches reviewed.",
    );
    expect(resultAnnouncement("skip", { ...done, pending: 2, skipped: 2 })).toContain(
      "2 still pending",
    );
  });
});
