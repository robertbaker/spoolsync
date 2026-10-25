/** HeaderCoreManager Handles sticky scroll behavior and header sizing for the site header. */
export class HeaderCoreManager {
  private header: HTMLElement | null;
  private lastScroll = 0;
  private stickyType: string | null | undefined;
  private pendingHeaderHeight: number | null = null;
  private pendingHeaderMeasurement = false;
  private headerOffsetFrame: number | null = null;
  private headerOffsetScheduled = false;
  private lastHeaderOffset: string | null = null;
  private handleScrollBound: () => void;
  private scheduleHeaderOffsetBound: () => void;
  private resizeObserver?: ResizeObserver;

  constructor() {
    this.header = document.getElementById("main-header");
    this.stickyType = this.header?.getAttribute("data-sticky");

    this.handleScrollBound = this.handleScroll.bind(this);
    this.scheduleHeaderOffsetBound = this.scheduleHeaderOffset.bind(this);
  }

  public init() {
    this.observeHeaderSize();

    if (this.stickyType === "scroll-up" && this.header && window.scrollY <= 0) {
      this.header.classList.remove("header-hidden");
      this.header.classList.remove("-translate-y-full");
    }
  }

  private setHeaderOffset(height?: number) {
    if (!this.header) return;
    const nextHeight =
      typeof height === "number" ? height : this.header.getBoundingClientRect().height;
    const nextOffset = `${nextHeight}px`;
    if (nextOffset === this.lastHeaderOffset) return;
    document.body.style.setProperty("--header-offset", nextOffset);
    this.lastHeaderOffset = nextOffset;
  }

  private getObservedHeaderHeight(entry?: ResizeObserverEntry): number | undefined {
    const borderBoxSize = entry?.borderBoxSize;
    const borderBoxEntry = Array.isArray(borderBoxSize)
      ? borderBoxSize[0]
      : (borderBoxSize as ResizeObserverSize | undefined);

    return borderBoxEntry?.blockSize ?? entry?.contentRect.height;
  }

  private scheduleHeaderOffset(height?: number) {
    if (!this.header) return;

    if (typeof height === "number") {
      this.pendingHeaderHeight = height;
    } else {
      this.pendingHeaderMeasurement = true;
      this.pendingHeaderHeight = null;
    }

    if (this.headerOffsetScheduled) {
      return;
    }

    this.headerOffsetScheduled = true;
    this.headerOffsetFrame = requestAnimationFrame(() => {
      this.headerOffsetScheduled = false;
      this.headerOffsetFrame = null;

      const nextHeight = this.pendingHeaderMeasurement
        ? this.header?.getBoundingClientRect().height
        : this.pendingHeaderHeight;

      this.pendingHeaderMeasurement = false;
      this.pendingHeaderHeight = null;

      if (typeof nextHeight === "number") {
        this.setHeaderOffset(nextHeight);
      }
    });
  }

  private observeHeaderSize() {
    if (!this.header) return;

    this.setHeaderOffset();
    if (this.header.style.top !== "0px") {
      this.header.style.top = "0px";
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver((entries) =>
      this.scheduleHeaderOffset(this.getObservedHeaderHeight(entries[0])),
    );
    this.resizeObserver.observe(this.header);
    window.addEventListener("resize", this.scheduleHeaderOffsetBound, { passive: true });

    if (this.stickyType === "scroll-up") {
      window.addEventListener("scroll", this.handleScrollBound, { passive: true });
    }
  }

  private handleScroll() {
    if (!this.header) return;
    const currentScroll = window.scrollY;

    if (currentScroll <= 0) {
      this.header.classList.remove("header-hidden");
      this.header.classList.remove("-translate-y-full");
      this.header.classList.add("translate-y-0");
      return;
    }

    if (currentScroll > this.lastScroll && currentScroll > 80) {
      this.header.classList.add("header-hidden");
      this.header.classList.remove("translate-y-0");
      this.header.classList.add("-translate-y-full");
    } else {
      this.header.classList.remove("header-hidden");
      this.header.classList.remove("-translate-y-full");
      this.header.classList.add("translate-y-0");
    }

    this.lastScroll = currentScroll;
  }

  public cleanup() {
    window.removeEventListener("scroll", this.handleScrollBound);
    window.removeEventListener("resize", this.scheduleHeaderOffsetBound);

    if (this.headerOffsetScheduled && this.headerOffsetFrame !== null) {
      cancelAnimationFrame(this.headerOffsetFrame);
    }

    this.headerOffsetFrame = null;
    this.headerOffsetScheduled = false;
    this.pendingHeaderMeasurement = false;
    this.pendingHeaderHeight = null;
    this.resizeObserver?.disconnect();
  }
}
