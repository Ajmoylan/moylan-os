import {
  LinearSRGBColorSpace,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type WebGLRendererParameters,
} from "three";
import { Resources } from "./resources";

/**
 * The stage engine (Milestone 2.4a, ADR-002 as amended): one persistent canvas, one
 * `WebGLRenderer`, one scene, one perspective camera and one requestAnimationFrame loop, with no
 * UI framework inside. `Stage.tsx` is a thin React wrapper that owns the policy (lifecycle state,
 * quality, motion, context-loss limits) and forwards discrete props; the engine owns the
 * mechanics.
 *
 * Ownership. The engine creates and owns its canvas (appended to the container), its WebGL2
 * context (acquired by the engine with the attributes Three.js would request, then handed to the
 * renderer), the renderer, the size and pixel-ratio observers and the canvas context-event
 * listeners. It owns the layers added to it: `dispose()` disposes them, then releases everything
 * else in reverse order of acquisition, and removes the canvas. Construction is transactional: if
 * any step throws (the renderer's constructor included, after the context exists), everything
 * acquired before it is released, the context explicitly lost and the canvas removed, before the
 * original error propagates. A canvas is never reused (a released context is lost for good).
 *
 * Frame scheduling. Loop modes: `always` (a frame every animation frame), `demand` (one frame per
 * `invalidate()`, coalesced; an invalidation during a frame asks for exactly one more) and `never`.
 * Each frame runs explicit phases in order, whatever order the layers were added in:
 *   1. `simulate`: shared simulations that other layers read (the pointer flow map, ADR-004);
 *   2. `update`: environments and agents (ambient field, NEX) write their uniforms;
 *   3. render: the scene is drawn (post-processing will replace this step, not add a phase).
 * The frame delta is in seconds, from a clock restarted whenever the loop mode changes, so a pause
 * (hidden tab, lost context, reduced motion) is never one huge step.
 *
 * Invalidation. `invalidate()` is the single way to request a frame on demand. The engine calls it
 * itself on size, pixel-ratio, loop-mode and layer changes; the Stage calls it once after
 * forwarding props that changed something; event sources (the NEX anchor tracker) call it when
 * layout moves. Layers never need to know about each other's order or invalidations.
 *
 * Errors. A throw from a layer update or from rendering is fatal for the visit: the loop stops at
 * once (no further frames are scheduled), the engine ignores every later request, and `onFatal`
 * is called exactly once. The Stage then disposes the engine and falls back to the static design
 * for the rest of the session. Errors are never swallowed while the loop keeps running.
 */

export type FrameLoop = "always" | "demand" | "never";

/** Frame phases, in execution order (rendering follows the last). */
export const FRAME_PHASES = ["simulate", "update"] as const;
export type FramePhase = (typeof FRAME_PHASES)[number];

/** A stage layer: updated once per rendered frame in its phase, before the scene is drawn. */
export interface FrameLayer {
  readonly phase: FramePhase;
  update(engine: Engine, delta: number): void;
  /** Idempotent: the engine disposes its layers, and their owner may do so too. */
  dispose(): void;
}

/** requestAnimationFrame and a clock; replaceable in unit tests. */
export interface Scheduler {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
  now(): number;
}

const browserScheduler: Scheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

export interface CameraOptions {
  fov: number;
  near: number;
  far: number;
  position: readonly [number, number, number];
}

export interface EngineOptions {
  /** The element the engine's canvas is appended to; its box is the drawing size. */
  container: HTMLElement;
  gl: WebGLRendererParameters;
  camera: CameraOptions;
  /**
   * Called after the first frame has been drawn, and again after the first frame drawn following
   * each context restore (the Stage shows the canvas only once it has real content).
   */
  onFirstFrame?: () => void;
  /** Called once if a frame throws; the loop has already stopped. */
  onFatal?: (error: unknown) => void;
  onContextLost?: (event: Event) => void;
  onContextRestored?: () => void;
  /** Test seams. */
  scheduler?: Scheduler;
  createContext?: (
    canvas: HTMLCanvasElement,
    attributes: WebGLContextAttributes,
  ) => WebGL2RenderingContext | null;
  createRenderer?: (
    context: WebGL2RenderingContext,
    canvas: HTMLCanvasElement,
    gl: WebGLRendererParameters,
  ) => WebGLRenderer;
}

/** The device ratio clamped to the range (2 where the ratio is unknown; unchanged since M2.2). */
export function resolveDpr(
  [min, max]: readonly [number, number],
  device = window.devicePixelRatio || 2,
): number {
  return Math.min(Math.max(min, device), max);
}

/**
 * The WebGL2 context attributes Three.js itself requests for these renderer options (r186:
 * `alpha` is always requested, the renderer's own `alpha` option is then read back from the
 * context). Acquiring the context with exactly these keeps the renderer configuration unchanged.
 */
export function contextAttributes(gl: WebGLRendererParameters): WebGLContextAttributes {
  return {
    alpha: true,
    depth: gl.depth ?? true,
    stencil: gl.stencil ?? false,
    antialias: gl.antialias ?? false,
    premultipliedAlpha: gl.premultipliedAlpha ?? true,
    preserveDrawingBuffer: gl.preserveDrawingBuffer ?? false,
    powerPreference: gl.powerPreference ?? "default",
    failIfMajorPerformanceCaveat: gl.failIfMajorPerformanceCaveat ?? false,
  };
}

function createContext(
  canvas: HTMLCanvasElement,
  attributes: WebGLContextAttributes,
): WebGL2RenderingContext | null {
  return canvas.getContext("webgl2", attributes);
}

function createRenderer(
  context: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
  gl: WebGLRendererParameters,
): WebGLRenderer {
  return new WebGLRenderer({ ...gl, canvas, context });
}

/**
 * Releases a WebGL context now rather than at garbage collection (browsers cap live contexts).
 * Idempotent: a context that is already lost (released by the renderer, or by the browser) is left
 * alone, so the release never runs twice.
 */
export function releaseContext(context: WebGL2RenderingContext): void {
  try {
    if (!context.isContextLost()) context.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Nothing more can be done for a context that cannot be released.
  }
}

/**
 * Calls `onChange` when `window.devicePixelRatio` changes (another display, browser zoom): neither
 * resizes the canvas, so resize observers won't see it. A resolution query only matches the
 * current ratio, so after each change the old query is released and a new one is created.
 * Returns the function that stops watching.
 */
export function watchDpr(win: Window, onChange: () => void): () => void {
  if (typeof win.matchMedia !== "function") return () => {};
  let query: MediaQueryList | undefined;
  let stopped = false;
  const unlisten = () => {
    query?.removeEventListener?.("change", changed);
    query = undefined;
  };
  const listen = () => {
    try {
      query = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`);
      query?.addEventListener?.("change", changed);
    } catch {
      query = undefined;
    }
  };
  function changed() {
    if (stopped) return;
    unlisten();
    listen();
    onChange();
  }
  listen();
  return () => {
    stopped = true;
    unlisten();
  };
}

const PHASE_RANK: Record<FramePhase, number> = { simulate: 0, update: 1 };

export class Engine {
  readonly canvas: HTMLCanvasElement;
  /** The WebGL2 context the engine acquired and owns (handed to the renderer). */
  readonly context: WebGL2RenderingContext;
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  /** Drawing size in CSS pixels, and the pixel ratio in use. */
  width = 0;
  height = 0;
  dpr = 0;

  private readonly options: EngineOptions;
  private readonly scheduler: Scheduler;
  private readonly resources = new Resources();
  /** Layers in phase order; within a phase, in the order they were added. */
  private readonly layers: FrameLayer[] = [];
  private loop: FrameLoop = "never";
  private dprRange: readonly [number, number] = [1, 2];
  /** Pending on-demand frames. */
  private frames = 0;
  private handle = 0;
  private scheduled = false;
  private last = 0;
  private drawn = false;
  private state: "active" | "failed" | "disposed" = "active";

  constructor(options: EngineOptions) {
    this.options = options;
    this.scheduler = options.scheduler ?? browserScheduler;
    const own = this.resources;
    try {
      const { container } = options;
      const canvas = document.createElement("canvas");
      canvas.style.display = "block";
      container.appendChild(canvas);
      own.defer(() => canvas.remove());
      this.canvas = canvas;

      // The context is acquired here, not inside Three.js, so it is owned (and released) even if
      // the renderer's constructor throws after creating it. On success the renderer's own
      // disposal releases it (`forceContextLoss`), and this step finds it already lost.
      const context = (options.createContext ?? createContext)(
        canvas,
        contextAttributes(options.gl),
      );
      if (!context) throw new Error("WebGL2 context unavailable for the stage renderer.");
      own.defer(() => releaseContext(context));
      this.context = context;

      const renderer = (options.createRenderer ?? createRenderer)(context, canvas, options.gl);
      own.defer(() => {
        renderer.dispose();
        // Browsers cap live WebGL contexts: release this one now rather than at collection
        // (unless the browser has already lost it).
        try {
          if (!context.isContextLost()) renderer.forceContextLoss();
        } catch {
          // The context may already be gone.
        }
      });
      this.renderer = renderer;
      renderer.setClearColor(0x000000, 0);
      // No tone mapping, linear output: shader colours are written exactly as authored (as since M2.2).
      renderer.toneMapping = NoToneMapping;
      renderer.outputColorSpace = LinearSRGBColorSpace;

      const { camera } = options;
      this.camera = new PerspectiveCamera(camera.fov, 1, camera.near, camera.far);
      this.camera.position.set(...camera.position);
      this.camera.lookAt(0, 0, 0);

      const lost = (event: Event) => options.onContextLost?.(event);
      const restored = () => {
        // The restored context starts empty: the next drawn frame is a first frame again.
        this.drawn = false;
        options.onContextRestored?.();
      };
      canvas.addEventListener("webglcontextlost", lost);
      canvas.addEventListener("webglcontextrestored", restored);
      own.defer(() => {
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.removeEventListener("webglcontextrestored", restored);
      });

      const measure = () => {
        const box = container.getBoundingClientRect();
        this.setSize(box.width, box.height);
      };
      window.addEventListener("resize", measure);
      own.defer(() => window.removeEventListener("resize", measure));
      if (typeof ResizeObserver === "function") {
        const observer = new ResizeObserver(measure);
        own.defer(() => observer.disconnect());
        observer.observe(container);
      }
      own.defer(watchDpr(window, () => this.applyDpr()));
      measure();
    } catch (error) {
      this.state = "disposed";
      throw own.rollback(error);
    }
  }

  get isActive(): boolean {
    return this.state === "active";
  }

  /**
   * Adds a layer to its phase (after the layers already in it). The engine then owns it. A layer
   * added to a failed or disposed engine is disposed at once: nothing may outlive its engine.
   */
  add(layer: FrameLayer): void {
    if (this.state !== "active") {
      layer.dispose();
      return;
    }
    if (this.layers.includes(layer)) return;
    const rank = PHASE_RANK[layer.phase];
    const at = this.layers.findIndex((other) => PHASE_RANK[other.phase] > rank);
    this.layers.splice(at < 0 ? this.layers.length : at, 0, layer);
    this.invalidate();
  }

  remove(layer: FrameLayer): void {
    const index = this.layers.indexOf(layer);
    if (index >= 0) this.layers.splice(index, 1);
    this.invalidate();
  }

  setLoop(mode: FrameLoop): void {
    if (this.state !== "active" || mode === this.loop) return;
    this.loop = mode;
    this.last = this.scheduler.now();
    if (mode === "never") this.stop();
    else this.invalidate();
  }

  /** Requests a frame (demand mode); a no-op while the loop is `never` or after a failure. */
  invalidate = (): void => {
    if (this.state !== "active" || this.loop === "never") return;
    this.frames = 1;
    this.schedule();
  };

  setDpr(range: readonly [number, number]): void {
    if (this.state !== "active") return;
    this.dprRange = range;
    this.applyDpr();
  }

  setSize(width: number, height: number): void {
    if (this.state !== "active") return;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    if (height > 0) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.setSize(width, height, true);
    this.invalidate();
  }

  /**
   * Stops the loop and releases the layers, the renderer and its context, every listener and the
   * canvas. Idempotent; safe after a failure and from inside a frame.
   */
  dispose(): void {
    if (this.state === "disposed") return;
    this.state = "disposed";
    this.stop();
    let failure: { error: unknown } | null = null;
    for (const layer of this.layers.splice(0)) {
      try {
        layer.dispose();
      } catch (error) {
        failure ??= { error };
      }
    }
    try {
      this.resources.release();
    } catch (error) {
      failure ??= { error };
    }
    if (failure) throw failure.error;
  }

  /** Fatal error: no further frames, one report. */
  private fail(error: unknown): void {
    if (this.state !== "active") return;
    this.state = "failed";
    this.stop();
    this.options.onFatal?.(error);
  }

  private applyDpr(): void {
    if (this.state !== "active") return;
    const dpr = resolveDpr(this.dprRange);
    if (dpr === this.dpr) return;
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, true);
    this.invalidate();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.handle = this.scheduler.request(this.tick);
  }

  private stop(): void {
    if (!this.scheduled) return;
    this.scheduler.cancel(this.handle);
    this.scheduled = false;
  }

  private tick = (): void => {
    this.scheduled = false;
    if (this.state !== "active" || this.loop === "never") return;
    if (this.loop === "demand" && this.frames === 0) return;
    // Consumed before the layers run, so an invalidation during this frame asks for one more.
    this.frames = 0;
    const now = this.scheduler.now();
    const delta = (now - this.last) / 1000;
    this.last = now;
    if (this.width > 0 && this.height > 0) {
      try {
        // Layers are kept in phase order: simulate, then update; then the scene is drawn.
        for (const layer of this.layers) {
          layer.update(this, delta);
          if (this.state !== "active") return;
        }
        this.renderer.render(this.scene, this.camera);
        if (!this.drawn) {
          this.drawn = true;
          this.options.onFirstFrame?.();
        }
      } catch (error) {
        this.fail(error);
        return;
      }
    }
    if (this.state === "active" && (this.loop === "always" || this.frames > 0)) this.schedule();
  };
}
