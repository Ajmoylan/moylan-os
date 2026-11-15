/**
 * Tracks NEX's page anchor (the layout-only `data-stage-anchor` element) without reading layout
 * on every animation frame. The anchor's box is measured only after something that can move or
 * resize it: scrolling, a window resize, a ResizeObserver notification (the anchor itself, or the
 * page body for responsive reflow and enlarged text), web fonts finishing loading, or a new anchor
 * after a route change. Between those events `read()` returns the cached box: no DOM measurement
 * and no allocation.
 *
 * `onChange` runs after each such event so an on-demand render loop (reduced motion) draws a new
 * frame. Every listener and observer is removed by `detach()`.
 */

export interface AnchorBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** An anchor is in the document and laid out (a `display: none` anchor has no box). */
  present: boolean;
  /**
   * Launch sprint: the anchor asks for NEX to be kept inside the viewport
   * (`data-nex-contain="<media query>"`, evaluated when the box is measured).
   */
  contain: boolean;
}

export class AnchorTracker {
  readonly box: AnchorBox = {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    present: false,
    contain: false,
  };
  /** Incremented whenever `box` changes, so consumers recompute placement only then. */
  version = 0;
  /** DOM measurements taken so far (diagnostics and tests). */
  measurements = 0;
  private element: Element | null = null;
  private dirty = true;
  /** The current element's box has been measured since it last could have changed. */
  private measured = false;
  private observer: ResizeObserver | null = null;
  private attached = false;

  constructor(
    private readonly win: Window,
    private readonly onChange: () => void,
  ) {}

  private readonly invalidate = () => {
    this.dirty = true;
    this.onChange();
  };

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.win.addEventListener("scroll", this.invalidate, { passive: true });
    this.win.addEventListener("resize", this.invalidate);
    this.win.document.fonts?.addEventListener("loadingdone", this.invalidate);
    const Observer = (this.win as Window & typeof globalThis).ResizeObserver;
    if (typeof Observer === "function") {
      const observer = new Observer(this.invalidate);
      observer.observe(this.win.document.body);
      if (this.element) observer.observe(this.element);
      this.observer = observer;
    }
    this.invalidate();
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.win.removeEventListener("scroll", this.invalidate);
    this.win.removeEventListener("resize", this.invalidate);
    this.win.document.fonts?.removeEventListener("loadingdone", this.invalidate);
    this.observer?.disconnect();
    this.observer = null;
  }

  /** Follow a new anchor (or none) after a route change. Returns whether the element changed. */
  setElement(element: Element | null): boolean {
    if (element === this.element) return false;
    if (this.element) this.observer?.unobserve(this.element);
    this.element = element;
    this.measured = false;
    if (element) this.observer?.observe(element);
    this.invalidate();
    return true;
  }

  /** The anchor's viewport box, measured only if something changed since the last read. */
  read(): AnchorBox {
    const element = this.element;
    const connected = element !== null && element.isConnected;
    if (!connected) {
      if (this.box.present) {
        this.box.present = false;
        this.version++;
      }
      return this.box;
    }
    if (!this.dirty && this.measured) return this.box;
    this.dirty = false;
    this.measured = true;
    this.measurements++;
    const rect = element.getBoundingClientRect();
    const box = this.box;
    // An anchor that isn't laid out (e.g. a NEX slot hidden on narrow screens) is no anchor: the
    // agent leaves as on a page without one. Its ResizeObserver reports when it is laid out again.
    if (rect.width === 0 || rect.height === 0) {
      if (box.present) {
        box.present = false;
        this.version++;
      }
      return box;
    }
    const query = element.getAttribute("data-nex-contain");
    const contain = query !== null && (query === "" || this.win.matchMedia(query).matches);
    if (
      !box.present ||
      contain !== box.contain ||
      rect.left !== box.left ||
      rect.top !== box.top ||
      rect.width !== box.width ||
      rect.height !== box.height
    ) {
      box.left = rect.left;
      box.top = rect.top;
      box.width = rect.width;
      box.height = rect.height;
      box.present = true;
      box.contain = contain;
      this.version++;
    }
    return box;
  }
}
