import type { Engine, FrameLayer } from "../engine/Engine";
import type { StagePlacement } from "../transition/StageTransition";

/** The page's companion mirror (NexCompanion renders it inside the dock). */
const MIRROR = "canvas[data-nex-mirror]";
/** The mirror's fade (keep in step with `.nex-dock-mirror` in app.css). */
const FADE_MS = 450;
/** The one-time copy set-up runs this many frames after the stage starts (after its first frames). */
const WARM_AFTER_FRAMES = 45;

/**
 * NEX's companion mirror (launch sprint): keeps the docked NEX recognisable above the page.
 *
 * NEX is drawn by the one stage renderer behind the page, so content cards scrolling over the dock
 * would veil him. While he is docked, this layer copies just the dock's region of the frame the
 * stage has just drawn into a small 2D canvas in the dock, above the content (one GPU blit of
 * ≈ 250 × 250 device pixels per drawn frame; no second renderer, context or scene). The copy is
 * transparent wherever NEX isn't, so the content stays visible around him, and it is masked to a
 * soft circle in CSS. It never receives input (the dock's button above it does).
 *
 * Layout is read only when the dock (or the viewport) may have changed, never on ordinary frames.
 * The copy's measurement, buffer and first GPU copy happen in the background shortly after the
 * stage starts, so the first handover to the dock does no one-time work. It shows NEX only once he
 * has arrived (fading in), so his glide and the layer change never overlap; it fades out as he
 * leaves. Cleared when the stage goes away (lost context, motion Off).
 */
export class CompanionMirror implements FrameLayer {
  readonly phase = "update";
  private target: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private region = { x: 0, y: 0, width: 0, height: 0 };
  /** The stage's drawing-buffer size the region was measured for. */
  private sourceWidth = 0;
  private sourceHeight = 0;
  private stale = true;
  private shown = false;
  private visible = false;
  private disposed = false;
  /** Frames drawn so far, and whether the one-time copy set-up has been done. */
  private frames = 0;
  private warmed = false;
  /** The copy keeps running this long after NEX leaves the dock, while the mirror fades out. */
  private fadeOutUntil = 0;

  constructor(
    /** The stage's placement: the mirror shows NEX only once he has arrived in the dock. */
    private readonly placement: Readonly<StagePlacement>,
    private readonly win: Window = window,
  ) {
    win.addEventListener("resize", this.invalidate);
  }

  private readonly invalidate = () => {
    this.stale = true;
  };

  update(): void {}

  afterRender(engine: Engine): void {
    if (this.disposed) return;
    let target = this.target;
    if (!target || !target.isConnected) {
      target = this.win.document.querySelector<HTMLCanvasElement>(MIRROR);
      this.target = target;
      this.context = target?.getContext("2d") ?? null;
      this.stale = true;
    }
    const context = this.context;
    if (!target || !context) return;
    this.frames++;
    const source = engine.renderer.domElement;
    // A new device-pixel ratio (adaptive quality, another display) resizes the drawing buffer
    // without a window resize: the region, in device pixels, must be measured again.
    if (source.width !== this.sourceWidth || source.height !== this.sourceHeight) this.stale = true;
    // Measured (and the copy's buffer allocated) ahead of time, not at the first handover.
    if (this.stale && !this.measure(target, source)) return;

    const docked = target.dataset.active === "true";
    // Visible once NEX has arrived (not while he is still gliding in): one continuous movement,
    // then the mirror fades in over him. Leaving the dock, it fades out while still copying.
    const visible = docked && !this.placement.gliding;
    if (visible !== this.visible) {
      this.visible = visible;
      target.toggleAttribute("data-visible", visible);
      if (!visible) this.fadeOutUntil = performance.now() + FADE_MS;
    }
    const copying = visible || performance.now() < this.fadeOutUntil;
    if (!copying) {
      // One-time set-up of the copy path, in the background shortly after the stage starts: one
      // copy, cleared straight away.
      if (!this.warmed && this.frames > WARM_AFTER_FRAMES) this.copy(context, source, target);
      if (this.shown) this.clear();
      return;
    }
    this.copy(context, source, target);
  }

  /** Measures the dock's region of the frame and sizes the copy's buffer. False if not laid out. */
  private measure(target: HTMLCanvasElement, source: HTMLCanvasElement): boolean {
    // The dock is fixed: its box changes only with the viewport (or a new dock element).
    const box = target.getBoundingClientRect();
    if (box.width === 0 || box.height === 0 || source.clientWidth === 0) return false;
    const scale = source.width / Math.max(1, source.clientWidth);
    this.region = {
      x: box.left * scale,
      y: box.top * scale,
      width: box.width * scale,
      height: box.height * scale,
    };
    const width = Math.max(1, Math.round(this.region.width));
    const height = Math.max(1, Math.round(this.region.height));
    if (target.width !== width) target.width = width;
    if (target.height !== height) target.height = height;
    this.sourceWidth = source.width;
    this.sourceHeight = source.height;
    this.stale = false;
    return true;
  }

  private copy(
    context: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    target: HTMLCanvasElement,
  ): void {
    const { x, y, width, height } = this.region;
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(source, x, y, width, height, 0, 0, target.width, target.height);
    this.warmed = this.shown = true;
  }

  private clear(): void {
    const target = this.target;
    this.context?.clearRect(0, 0, target?.width ?? 0, target?.height ?? 0);
    this.shown = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.win.removeEventListener("resize", this.invalidate);
    this.target?.removeAttribute("data-visible");
    this.clear();
    this.target = null;
    this.context = null;
  }
}
