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
  /** An anchor is in the document. */
  present: boolean;
}

export class AnchorTracker {
  readonly box: AnchorBox = { left: 0, top: 0, width: 0, height: 0, present: false };
  /** Incremented whenever `box` changes, so consumers recompute placement only then. */
  version = 0;
  /** DOM measurements taken so far (diagnostics and tests). */
  measurements = 0;
  private element: Element | null = null;
  private dirty = true;
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

  /** Follow a new anchor (or none) after a route change. */
  setElement(element: Element | null): void {
    if (element === this.element) return;
    if (this.element) this.observer?.unobserve(this.element);
    this.element = element;
    if (element) this.observer?.observe(element);
    this.invalidate();
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
    if (!this.dirty && this.box.present) return this.box;
    this.dirty = false;
    this.measurements++;
    const rect = element.getBoundingClientRect();
    const box = this.box;
    if (
      !box.present ||
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
      this.version++;
    }
    return box;
  }
}
