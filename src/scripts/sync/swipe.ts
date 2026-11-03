export type SwipeDirection = "left" | "right";

export interface SwipeOptions {
  /** Horizontal distance, in pixels, that commits a swipe. */
  threshold: number;
  /** Movement before the gesture is judged horizontal or vertical. */
  slop: number;
  /** How much wider than tall a movement must be to count as horizontal. */
  ratio: number;
}

export const DEFAULT_SWIPE: SwipeOptions = { threshold: 80, slop: 10, ratio: 1.5 };

export type SwipeState = "idle" | "undecided" | "horizontal" | "vertical";

/**
 * Judges a pointer gesture. It is pure, so the rules can be tested without a browser: a movement
 * that is mostly vertical hands the gesture back to scrolling for good, and a horizontal one only
 * commits once it travels past the threshold and is released.
 */
export class SwipeTracker {
  private startX = 0;
  private startY = 0;
  private current: SwipeState = "idle";
  private dx = 0;

  constructor(private readonly options: SwipeOptions = DEFAULT_SWIPE) {}

  get state(): SwipeState {
    return this.current;
  }

  /** Horizontal travel so far; 0 until the gesture is judged horizontal. */
  get offset(): number {
    return this.current === "horizontal" ? this.dx : 0;
  }

  /** The direction a release now would commit, or `null` if short of the threshold. */
  get pending(): SwipeDirection | null {
    if (this.current !== "horizontal" || Math.abs(this.dx) < this.options.threshold) return null;
    return this.dx > 0 ? "right" : "left";
  }

  start(x: number, y: number): void {
    this.startX = x;
    this.startY = y;
    this.dx = 0;
    this.current = "undecided";
  }

  move(x: number, y: number): SwipeState {
    if (this.current === "idle" || this.current === "vertical") return this.current;
    const dx = x - this.startX;
    const dy = y - this.startY;
    if (this.current === "undecided") {
      if (Math.hypot(dx, dy) < this.options.slop) return this.current;
      this.current = Math.abs(dx) > Math.abs(dy) * this.options.ratio ? "horizontal" : "vertical";
    }
    if (this.current === "horizontal") this.dx = dx;
    return this.current;
  }

  /** Ends the gesture; returns the committed direction, if any. */
  end(): SwipeDirection | null {
    const result = this.pending;
    this.cancel();
    return result;
  }

  cancel(): void {
    this.current = "idle";
    this.dx = 0;
  }
}

export interface SwipeBinding {
  onSwipe(direction: SwipeDirection): void;
  /** Read at each gesture so a changed system setting applies without a reload. */
  reducedMotion?: () => boolean;
}

const INTERACTIVE = "button, a, input, select, textarea, summary, label, [role='button']";

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Lets a touch or pen swipe answer a card. The card keeps `touch-action: pan-y`, so the browser
 * still scrolls vertically and never needs `preventDefault`. Mouse input is ignored (text selection
 * and clicks stay normal), as are gestures that start on a control. Returns a function that detaches
 * the listeners.
 */
export function attachSwipe(
  element: HTMLElement,
  binding: SwipeBinding,
  options: SwipeOptions = DEFAULT_SWIPE,
): () => void {
  const tracker = new SwipeTracker(options);
  let pointerId: number | null = null;

  const reset = () => {
    tracker.cancel();
    pointerId = null;
    element.style.transform = "";
    element.style.transition = "";
    delete element.dataset["swipe"];
  };

  const down = (event: PointerEvent) => {
    if (pointerId !== null || !event.isPrimary) return;
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    if ((event.target as Element | null)?.closest(INTERACTIVE)) return;
    pointerId = event.pointerId;
    tracker.start(event.clientX, event.clientY);
  };

  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    const state = tracker.move(event.clientX, event.clientY);
    if (state === "vertical") return reset();
    if (state !== "horizontal") return;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // The pointer may already be gone; the gesture then ends through pointercancel.
    }
    const pending = tracker.pending;
    if (pending) element.dataset["swipe"] = pending;
    else delete element.dataset["swipe"];
    if (!(binding.reducedMotion ?? prefersReducedMotion)()) {
      element.style.transition = "none";
      element.style.transform = `translateX(${Math.round(tracker.offset)}px)`;
    }
  };

  const up = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    const direction = tracker.end();
    reset();
    if (direction) binding.onSwipe(direction);
  };

  const cancel = (event: PointerEvent) => {
    if (event.pointerId === pointerId) reset();
  };

  element.classList.add("swipe-card");
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", cancel);
  return () => {
    reset();
    element.classList.remove("swipe-card");
    element.removeEventListener("pointerdown", down);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", up);
    element.removeEventListener("pointercancel", cancel);
  };
}
