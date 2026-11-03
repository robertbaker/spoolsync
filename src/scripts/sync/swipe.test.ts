import { describe, expect, mock, test } from "bun:test";

import { attachSwipe, SwipeTracker, type SwipeDirection } from "./swipe";

describe("SwipeTracker", () => {
  test("a long horizontal movement commits in its direction on release", () => {
    const tracker = new SwipeTracker();
    tracker.start(100, 100);
    expect(tracker.move(105, 101)).toBe("undecided");
    expect(tracker.move(150, 104)).toBe("horizontal");
    expect(tracker.pending).toBeNull();
    tracker.move(200, 110);
    expect(tracker.pending).toBe("right");
    expect(tracker.end()).toBe("right");
    expect(tracker.state).toBe("idle");

    tracker.start(300, 100);
    tracker.move(180, 100);
    expect(tracker.end()).toBe("left");
  });

  test("a short horizontal movement does nothing", () => {
    const tracker = new SwipeTracker();
    tracker.start(0, 0);
    tracker.move(60, 0);
    expect(tracker.offset).toBe(60);
    expect(tracker.end()).toBeNull();
  });

  test("a mostly vertical movement is left to scrolling and cannot turn into a swipe", () => {
    const tracker = new SwipeTracker();
    tracker.start(0, 0);
    expect(tracker.move(20, 60)).toBe("vertical");
    expect(tracker.move(300, 60)).toBe("vertical");
    expect(tracker.offset).toBe(0);
    expect(tracker.end()).toBeNull();
  });

  test("a diagonal movement is not horizontal until clearly wider than tall", () => {
    const tracker = new SwipeTracker();
    tracker.start(0, 0);
    expect(tracker.move(30, 25)).toBe("vertical");
  });

  test("moves before a start or after cancel are ignored", () => {
    const tracker = new SwipeTracker();
    expect(tracker.move(500, 0)).toBe("idle");
    tracker.start(0, 0);
    tracker.move(120, 0);
    tracker.cancel();
    expect(tracker.end()).toBeNull();
  });
});

function pointer(type: string, props: Record<string, unknown>): Event {
  return Object.assign(new Event(type, { bubbles: true }), {
    pointerId: 1,
    isPrimary: true,
    pointerType: "touch",
    clientX: 0,
    clientY: 0,
    ...props,
  });
}

function gesture(element: HTMLElement, from: [number, number], to: [number, number], extra = {}) {
  element.dispatchEvent(pointer("pointerdown", { clientX: from[0], clientY: from[1], ...extra }));
  element.dispatchEvent(pointer("pointermove", { clientX: to[0], clientY: to[1], ...extra }));
  element.dispatchEvent(pointer("pointerup", { clientX: to[0], clientY: to[1], ...extra }));
}

describe("attachSwipe", () => {
  function setup(reducedMotion = false) {
    const element = document.createElement("article");
    const onSwipe = mock((_direction: SwipeDirection) => {});
    const detach = attachSwipe(element, { onSwipe, reducedMotion: () => reducedMotion });
    return { element, onSwipe, detach };
  }

  test("right and left swipes are reported and the card is reset afterwards", () => {
    const { element, onSwipe } = setup();
    gesture(element, [0, 0], [150, 5]);
    gesture(element, [200, 0], [40, 5]);
    expect(onSwipe.mock.calls.map(([direction]) => direction)).toEqual(["right", "left"]);
    expect(element.style.transform).toBe("");
    expect(element.dataset["swipe"]).toBeUndefined();
  });

  test("vertical scrolls, short drags, mouse input and control targets are ignored", () => {
    const { element, onSwipe } = setup();
    gesture(element, [0, 0], [10, 200]);
    gesture(element, [0, 0], [40, 0]);
    gesture(element, [0, 0], [200, 0], { pointerType: "mouse" });
    const control = document.createElement("button");
    element.append(control);
    gesture(control, [0, 0], [200, 0]);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  test("a cancelled pointer drops the gesture", () => {
    const { element, onSwipe } = setup();
    element.dispatchEvent(pointer("pointerdown", { clientX: 0 }));
    element.dispatchEvent(pointer("pointermove", { clientX: 150 }));
    element.dispatchEvent(pointer("pointercancel", {}));
    element.dispatchEvent(pointer("pointerup", { clientX: 150 }));
    expect(onSwipe).not.toHaveBeenCalled();
  });

  test("reduced motion keeps the swipe but never moves the card", () => {
    const { element, onSwipe } = setup(true);
    element.dispatchEvent(pointer("pointerdown", { clientX: 0 }));
    element.dispatchEvent(pointer("pointermove", { clientX: 150 }));
    expect(element.style.transform).toBe("");
    expect(element.dataset["swipe"]).toBe("right");
    element.dispatchEvent(pointer("pointerup", { clientX: 150 }));
    expect(onSwipe).toHaveBeenCalledWith("right");
  });

  test("normal motion follows the finger, and detaching stops listening", () => {
    const { element, onSwipe, detach } = setup();
    element.dispatchEvent(pointer("pointerdown", { clientX: 0 }));
    element.dispatchEvent(pointer("pointermove", { clientX: 120 }));
    expect(element.style.transform).toBe("translateX(120px)");
    element.dispatchEvent(pointer("pointercancel", {}));
    detach();
    gesture(element, [0, 0], [200, 0]);
    expect(onSwipe).not.toHaveBeenCalled();
    expect(element.classList.contains("swipe-card")).toBe(false);
  });
});
