import { LinearSRGBColorSpace, NoToneMapping, type WebGLRenderer } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  contextAttributes,
  Engine,
  releaseContext,
  resolveDpr,
  watchDpr,
  type EngineOptions,
  type FrameLayer,
  type FramePhase,
  type Scheduler,
} from "./Engine";

/**
 * The stage engine (Milestone 2.4a): loop modes, frame phases, the fatal-error policy,
 * transactional construction, sizing, pixel ratio and disposal. jsdom has no WebGL, so the renderer
 * is a recorder and frames are driven by a manual scheduler. The real renderer is covered by the
 * Playwright specs (lifecycle, draw calls, quality, context loss, fault injection).
 */

function fakeRenderer() {
  let ratio = 1;
  return {
    toneMapping: -1,
    outputColorSpace: "",
    setClearColor: vi.fn(),
    setPixelRatio: vi.fn((value: number) => {
      ratio = value;
    }),
    getPixelRatio: () => ratio,
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  };
}
type FakeRenderer = ReturnType<typeof fakeRenderer>;

/** A WebGL2 context stand-in with a real lost/not-lost state behind WEBGL_lose_context. */
function fakeContext() {
  let lost = false;
  const lose = {
    loseContext: vi.fn(() => {
      lost = true;
    }),
    restoreContext: vi.fn(() => {
      lost = false;
    }),
  };
  return {
    lose,
    isContextLost: () => lost,
    getExtension: (name: string) => (name === "WEBGL_lose_context" ? lose : null),
  };
}
type FakeContext = ReturnType<typeof fakeContext>;

class ManualScheduler implements Scheduler {
  time = 1000;
  private queue = new Map<number, (time: number) => void>();
  private next = 1;
  request(callback: (time: number) => void) {
    const handle = this.next++;
    this.queue.set(handle, callback);
    return handle;
  }
  cancel(handle: number) {
    this.queue.delete(handle);
  }
  now() {
    return this.time;
  }
  get pending() {
    return this.queue.size;
  }
  /** Runs one animation frame `ms` after the previous one. */
  frame(ms = 16) {
    this.time += ms;
    const callbacks = [...this.queue.values()];
    this.queue.clear();
    for (const callback of callbacks) callback(this.time);
  }
}

function layer(phase: FramePhase = "update", update?: () => void) {
  const deltas: number[] = [];
  return {
    phase,
    deltas,
    update: vi.fn((_engine: Engine, delta: number) => {
      deltas.push(delta);
      update?.();
    }),
    dispose: vi.fn(),
  } satisfies FrameLayer & { deltas: number[] };
}

/** Window listeners added minus removed, per type (everything the engine attaches). */
function trackWindowListeners() {
  const net = new Map<string, number>();
  const add = vi.spyOn(window, "addEventListener");
  const remove = vi.spyOn(window, "removeEventListener");
  add.mockImplementation(function (this: Window, type: string) {
    net.set(type, (net.get(type) ?? 0) + 1);
  });
  remove.mockImplementation(function (this: Window, type: string) {
    net.set(type, (net.get(type) ?? 0) - 1);
  });
  return net;
}

let scheduler: ManualScheduler;
let renderer: FakeRenderer;
let context: FakeContext;
let container: HTMLDivElement;
let box: { width: number; height: number };
let engines: Engine[];

const camera = { fov: 20, near: 0.1, far: 40, position: [0, 0, 7.8] as const };

function create(overrides: Partial<EngineOptions> = {}) {
  const engine = new Engine({
    container,
    gl: { alpha: true },
    camera,
    scheduler,
    createContext: () => context as unknown as WebGL2RenderingContext,
    createRenderer: () => renderer as unknown as WebGLRenderer,
    ...overrides,
  });
  engines.push(engine);
  return engine;
}

function resize(width: number, height: number) {
  box = { width, height };
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  scheduler = new ManualScheduler();
  renderer = fakeRenderer();
  context = fakeContext();
  // As in Three.js: the renderer's forceContextLoss() loses the context it was given.
  renderer.forceContextLoss.mockImplementation(() => context.lose.loseContext());
  container = document.createElement("div");
  document.body.append(container);
  box = { width: 1200, height: 800 };
  container.getBoundingClientRect = () => ({ ...box }) as DOMRect;
  engines = [];
});

afterEach(() => {
  for (const engine of engines) engine.dispose();
  container.remove();
  vi.restoreAllMocks();
});

describe("Engine setup and ownership", () => {
  it("creates and owns one canvas, with flat linear output and the configured camera", () => {
    const engine = create();
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(engine.canvas.parentElement).toBe(container);
    expect(engine.canvas.style.display).toBe("block");
    expect(renderer.setClearColor).toHaveBeenCalledWith(0x000000, 0);
    expect(renderer.toneMapping).toBe(NoToneMapping);
    expect(renderer.outputColorSpace).toBe(LinearSRGBColorSpace);
    expect(engine.camera.fov).toBe(20);
    expect(engine.camera.position.z).toBe(7.8);
    expect(engine.camera.aspect).toBe(1.5);
    expect(renderer.setSize).toHaveBeenLastCalledWith(1200, 800, true);
  });

  it("acquires the context itself, with the attributes Three.js would request", () => {
    const createContext = vi.fn(() => context as unknown as WebGL2RenderingContext);
    const factory = vi.fn(() => renderer as unknown as WebGLRenderer);
    const gl = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: true,
      preserveDrawingBuffer: false,
    } as const;
    const engine = create({ createContext, createRenderer: factory, gl });
    expect(createContext).toHaveBeenCalledWith(engine.canvas, contextAttributes(gl));
    expect(contextAttributes(gl)).toEqual({ ...gl, alpha: true });
    expect(factory).toHaveBeenCalledWith(context, engine.canvas, gl);
    expect(engine.context).toBe(context);
  });

  it("maps defaults exactly as Three.js r186 does when it creates the context itself", () => {
    expect(contextAttributes({})).toEqual({
      alpha: true,
      depth: true,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: false,
    });
  });

  it("forwards context loss and restoration from its canvas", () => {
    const onContextLost = vi.fn();
    const onContextRestored = vi.fn();
    const engine = create({ onContextLost, onContextRestored });
    const lost = new Event("webglcontextlost");
    engine.canvas.dispatchEvent(lost);
    engine.canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(onContextLost).toHaveBeenCalledWith(lost);
    expect(onContextRestored).toHaveBeenCalledTimes(1);
  });

  it("starts with no frames until a loop mode is set", () => {
    const engine = create();
    engine.add(layer());
    expect(scheduler.pending).toBe(0);
  });
});

describe("Engine frame phases", () => {
  it("runs simulate layers, then update layers, then renders, whatever the order added", () => {
    const calls: string[] = [];
    const engine = create();
    renderer.render.mockImplementation(() => calls.push("render"));
    engine.add(layer("update", () => calls.push("nex")));
    engine.add(layer("update", () => calls.push("ambient")));
    engine.add(layer("simulate", () => calls.push("flow")));
    engine.setLoop("always");
    scheduler.frame();
    expect(calls).toEqual(["flow", "nex", "ambient", "render"]);
  });

  it("calls onFirstFrame once, after the first frame is drawn", () => {
    const onFirstFrame = vi.fn();
    const engine = create({ onFirstFrame });
    renderer.render.mockImplementation(() => expect(onFirstFrame).not.toHaveBeenCalled());
    engine.setLoop("always");
    scheduler.frame();
    scheduler.frame();
    expect(onFirstFrame).toHaveBeenCalledTimes(1);
  });
});

describe("Engine first-frame report", () => {
  it("reports the first frame again after a context restore (the canvas may be shown again)", () => {
    const onFirstFrame = vi.fn();
    const engine = create({ onFirstFrame });
    engine.setLoop("always");
    scheduler.frame();
    scheduler.frame();
    expect(onFirstFrame).toHaveBeenCalledTimes(1);
    engine.canvas.dispatchEvent(new Event("webglcontextlost"));
    engine.setLoop("never");
    engine.canvas.dispatchEvent(new Event("webglcontextrestored"));
    engine.setLoop("always");
    scheduler.frame();
    scheduler.frame();
    expect(onFirstFrame).toHaveBeenCalledTimes(2);
  });
});

describe("Engine frame loop", () => {
  it("always: renders every frame", () => {
    const engine = create();
    engine.add(layer());
    engine.setLoop("always");
    for (let i = 0; i < 3; i++) scheduler.frame();
    expect(renderer.render).toHaveBeenCalledTimes(3);
    expect(scheduler.pending).toBe(1);
  });

  it("passes the frame delta in seconds, from a clock restarted on each mode change", () => {
    const engine = create();
    const l = layer();
    engine.add(l);
    engine.setLoop("always");
    scheduler.frame(20);
    scheduler.frame(10);
    expect(l.deltas).toEqual([0.02, 0.01]);
    engine.setLoop("never");
    scheduler.time += 5000; // a long pause (hidden tab) …
    engine.setLoop("always");
    scheduler.frame(16);
    expect(l.deltas.at(-1)).toBeCloseTo(0.016); // … is not one huge step
  });

  it("demand: one frame per invalidation, coalesced, then the loop stops", () => {
    const engine = create();
    engine.add(layer());
    engine.setLoop("demand"); // a mode change draws once
    scheduler.frame();
    scheduler.frame();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(0);

    engine.invalidate();
    engine.invalidate();
    scheduler.frame();
    scheduler.frame();
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(scheduler.pending).toBe(0);
  });

  it("demand: an invalidation during a frame renders exactly one more", () => {
    const engine = create();
    let once = true;
    engine.add(
      layer("update", () => {
        if (once) engine.invalidate();
        once = false;
      }),
    );
    engine.setLoop("demand");
    for (let i = 0; i < 4; i++) scheduler.frame();
    expect(renderer.render).toHaveBeenCalledTimes(2);
  });

  it("never: no frames, and invalidations are ignored", () => {
    const engine = create();
    engine.add(layer());
    engine.setLoop("always");
    scheduler.frame();
    engine.setLoop("never");
    expect(scheduler.pending).toBe(0);
    engine.invalidate();
    scheduler.frame();
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it("switching modes keeps a single pending frame", () => {
    const engine = create();
    engine.setLoop("always");
    engine.setLoop("demand");
    engine.setLoop("always");
    engine.invalidate();
    expect(scheduler.pending).toBe(1);
  });

  it("skips drawing while the container has no size", () => {
    const engine = create();
    resize(0, 0);
    engine.setLoop("always");
    scheduler.frame();
    expect(renderer.render).not.toHaveBeenCalled();
    resize(800, 600);
    scheduler.frame();
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });
});

describe("Engine fatal-error policy (fault injection)", () => {
  function failing(where: "simulate" | "update" | "render") {
    const onFatal = vi.fn();
    const engine = create({ onFatal });
    const error = new Error(`${where} failure`);
    const flow = layer(
      "simulate",
      where === "simulate"
        ? () => {
            throw error;
          }
        : undefined,
    );
    const agent = layer(
      "update",
      where === "update"
        ? () => {
            throw error;
          }
        : undefined,
    );
    if (where === "render") {
      renderer.render.mockImplementation(() => {
        throw error;
      });
    }
    engine.add(flow);
    engine.add(agent);
    engine.setLoop("always");
    return { engine, onFatal, error, flow, agent };
  }

  for (const where of ["simulate", "update", "render"] as const) {
    it(`a throwing ${where} step stops the loop at once and is reported exactly once`, () => {
      const { engine, onFatal, error, flow, agent } = failing(where);
      expect(() => scheduler.frame()).not.toThrow();
      expect(onFatal).toHaveBeenCalledTimes(1);
      expect(onFatal).toHaveBeenCalledWith(error);
      expect(scheduler.pending).toBe(0);
      expect(engine.isActive).toBe(false);
      const updates = flow.update.mock.calls.length + agent.update.mock.calls.length;
      const renders = renderer.render.mock.calls.length;

      // Nothing can restart it: no frames, no further reports, no further work.
      engine.invalidate();
      engine.setLoop("demand");
      engine.setLoop("always");
      engine.setDpr([1, 1.5]);
      resize(640, 480);
      for (let i = 0; i < 5; i++) scheduler.frame();
      expect(scheduler.pending).toBe(0);
      expect(onFatal).toHaveBeenCalledTimes(1);
      expect(flow.update.mock.calls.length + agent.update.mock.calls.length).toBe(updates);
      expect(renderer.render.mock.calls.length).toBe(renders);
    });
  }

  it("layers after the failing one do not run in that frame", () => {
    const { agent } = failing("simulate");
    scheduler.frame();
    expect(agent.update).not.toHaveBeenCalled();
  });

  it("a throwing first-frame callback is fatal too (never an unhandled loop error)", () => {
    const onFatal = vi.fn();
    const engine = create({
      onFatal,
      onFirstFrame: () => {
        throw new Error("first frame");
      },
    });
    engine.setLoop("always");
    expect(() => scheduler.frame()).not.toThrow();
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(0);
  });

  it("disposal after a failure releases everything, once (idempotent cleanup)", () => {
    const { engine, flow, agent } = failing("render");
    scheduler.frame();
    engine.dispose();
    engine.dispose();
    expect(flow.dispose).toHaveBeenCalledTimes(1);
    expect(agent.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("the owner may dispose the engine from inside the fatal report", () => {
    const onFatal = vi.fn(() => engine.dispose());
    const engine = create({ onFatal });
    renderer.render.mockImplementation(() => {
      throw new Error("render");
    });
    engine.setLoop("always");
    expect(() => scheduler.frame()).not.toThrow();
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(0);
  });
});

describe("Engine transactional construction (fault injection)", () => {
  function expectNothingLeft(net: Map<string, number>) {
    expect(container.querySelector("canvas")).toBeNull();
    for (const [type, count] of net) expect(count, `window ${type} listeners`).toBe(0);
  }

  it("no WebGL2 context: the canvas is removed, nothing else was acquired", () => {
    const net = trackWindowListeners();
    const factory = vi.fn();
    expect(() => create({ createContext: () => null, createRenderer: factory })).toThrow(
      /WebGL2 context unavailable/,
    );
    expect(factory).not.toHaveBeenCalled();
    expectNothingLeft(net);
  });

  it("the renderer constructor throws after the context exists: that context is lost, once", () => {
    // Codex M2.4a final review: Three.js may create (here: be given) a context and then throw.
    const net = trackWindowListeners();
    const error = new Error(
      "THREE.WebGLRenderer: Cannot read properties of null (reading 'precision')",
    );
    expect(() =>
      create({
        createRenderer: () => {
          throw error;
        },
      }),
    ).toThrow(error); // the original error, unchanged
    expect(context.lose.loseContext).toHaveBeenCalledTimes(1);
    expect(context.isContextLost()).toBe(true);
    expectNothingLeft(net);
  });

  it("a failing context release does not hide the constructor error", () => {
    context.lose.loseContext.mockImplementation(() => {
      throw new Error("lose");
    });
    expect(() =>
      create({
        createRenderer: () => {
          throw new Error("constructor");
        },
      }),
    ).toThrow("constructor");
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("renderer configuration fails: the renderer and its context are released", () => {
    const net = trackWindowListeners();
    renderer.setClearColor.mockImplementation(() => {
      throw new Error("configure");
    });
    expect(() => create()).toThrow("configure");
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    // Released by the renderer; the engine's own context step then finds it lost (no double).
    expect(context.lose.loseContext).toHaveBeenCalledTimes(1);
    expectNothingLeft(net);
  });

  it("observer setup fails: listeners, renderer and canvas are released", () => {
    const net = trackWindowListeners();
    const canvasListeners = vi.spyOn(HTMLCanvasElement.prototype, "removeEventListener");
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor() {
          throw new Error("observer");
        }
      },
    );
    try {
      expect(() => create()).toThrow("observer");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(net.get("resize")).toBe(0);
    expect(canvasListeners.mock.calls.map((call) => call[0]).sort()).toEqual([
      "webglcontextlost",
      "webglcontextrestored",
    ]);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expectNothingLeft(net);
  });

  it("the first measurement fails: everything acquired before it is released", () => {
    const net = trackWindowListeners();
    container.getBoundingClientRect = () => {
      throw new Error("measure");
    };
    expect(() => create()).toThrow("measure");
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expectNothingLeft(net);
  });

  it("a release step that throws does not hide the construction error", () => {
    renderer.dispose.mockImplementation(() => {
      throw new Error("dispose");
    });
    renderer.setClearColor.mockImplementation(() => {
      throw new Error("configure");
    });
    expect(() => create()).toThrow("configure");
    expect(container.querySelector("canvas")).toBeNull();
  });
});

describe("Engine size and pixel ratio", () => {
  it("follows container resizes: camera aspect, renderer size and a new frame", () => {
    const engine = create();
    engine.setLoop("demand");
    scheduler.frame();
    resize(1000, 500);
    expect(engine.camera.aspect).toBe(2);
    expect(renderer.setSize).toHaveBeenLastCalledWith(1000, 500, true);
    scheduler.frame();
    expect(renderer.render).toHaveBeenCalledTimes(2);
  });

  it("clamps the device ratio to the range, applying it only when it changes", () => {
    expect(resolveDpr([1, 2], 3)).toBe(2);
    expect(resolveDpr([1, 2], 0.75)).toBe(1);
    expect(resolveDpr([0.5, 0.5], 2)).toBe(0.5);

    const engine = create();
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    engine.setDpr([1, 1.5]);
    expect(engine.dpr).toBe(1.5);
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    const calls = renderer.setPixelRatio.mock.calls.length;
    engine.setDpr([1, 1.5]);
    engine.setDpr([1, 2]);
    engine.setDpr([1, 2]);
    expect(renderer.setPixelRatio.mock.calls.length).toBe(calls + 1);
    expect(engine.dpr).toBe(2);
  });
});

describe("watchDpr (display and zoom changes)", () => {
  /** A matchMedia stub: one query object per call, each with its own listeners. */
  function media() {
    const queries: { media: string; listeners: Set<() => void> }[] = [];
    const win = {
      devicePixelRatio: 2,
      matchMedia: (query: string) => {
        const entry = { media: query, listeners: new Set<() => void>() };
        queries.push(entry);
        return {
          media: query,
          addEventListener: (_: string, fn: () => void) => entry.listeners.add(fn),
          removeEventListener: (_: string, fn: () => void) => entry.listeners.delete(fn),
        } as unknown as MediaQueryList;
      },
    };
    return { win: win as unknown as Window & { devicePixelRatio: number }, queries };
  }

  it("replaces the resolution query after each change and releases the old one", () => {
    const { win, queries } = media();
    const onChange = vi.fn();
    const stop = watchDpr(win, onChange);
    expect(queries.map((q) => q.media)).toEqual(["(resolution: 2dppx)"]);

    win.devicePixelRatio = 1.25; // zoom out
    for (const fn of [...queries[0]!.listeners]) fn();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(queries[0]!.listeners.size).toBe(0);
    expect(queries.map((q) => q.media)).toEqual(["(resolution: 2dppx)", "(resolution: 1.25dppx)"]);
    expect(queries[1]!.listeners.size).toBe(1);

    stop();
    expect(queries.every((q) => q.listeners.size === 0)).toBe(true);
  });

  it("is inert without matchMedia, and after stopping", () => {
    expect(() => watchDpr({} as Window, () => {})()).not.toThrow();
    const { win, queries } = media();
    const onChange = vi.fn();
    const stop = watchDpr(win, onChange);
    const listener = [...queries[0]!.listeners][0]!;
    stop();
    listener(); // a late event after stopping
    expect(onChange).not.toHaveBeenCalled();
  });

  it("the engine re-resolves its ratio on a display change and stops watching on dispose", () => {
    const { win, queries } = media();
    vi.stubGlobal("matchMedia", win.matchMedia); // jsdom has no matchMedia
    try {
      const ratio = vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
      const engine = create();
      engine.setDpr([1, 2]);
      expect(engine.dpr).toBe(2);
      ratio.mockReturnValue(1);
      for (const fn of [...queries.at(-1)!.listeners]) fn();
      expect(engine.dpr).toBe(1);
      expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1);
      engine.dispose();
      expect(queries.every((q) => q.listeners.size === 0)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Engine context ownership after construction", () => {
  it("normal disposal releases the context through the renderer, exactly once", () => {
    const engine = create();
    expect(context.lose.loseContext).not.toHaveBeenCalled();
    engine.dispose();
    engine.dispose();
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(context.lose.loseContext).toHaveBeenCalledTimes(1);
  });

  it("a context the browser already lost is not released again on disposal", () => {
    const engine = create();
    context.lose.loseContext(); // browser-initiated loss
    context.lose.loseContext.mockClear();
    engine.dispose();
    expect(renderer.forceContextLoss).not.toHaveBeenCalled();
    expect(context.lose.loseContext).not.toHaveBeenCalled();
  });

  it("after a fatal frame the context is released once, on disposal", () => {
    const engine = create({ onFatal: () => engine.dispose() });
    renderer.render.mockImplementation(() => {
      throw new Error("render");
    });
    engine.setLoop("always");
    scheduler.frame();
    expect(context.lose.loseContext).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("releaseContext is idempotent and never throws", () => {
    const ctx = fakeContext();
    releaseContext(ctx as unknown as WebGL2RenderingContext);
    releaseContext(ctx as unknown as WebGL2RenderingContext);
    expect(ctx.lose.loseContext).toHaveBeenCalledTimes(1);
    const broken = {
      isContextLost: () => {
        throw new Error("gone");
      },
    };
    expect(() => releaseContext(broken as unknown as WebGL2RenderingContext)).not.toThrow();
  });
});

describe("Engine disposal", () => {
  it("cancels frames, disposes layers once, releases the renderer, context and canvas", () => {
    const net = trackWindowListeners();
    const engine = create();
    const l = layer();
    engine.add(l);
    engine.setLoop("always");
    engine.dispose();
    engine.dispose();
    expect(scheduler.pending).toBe(0);
    expect(l.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeNull();
    for (const [type, count] of net) expect(count, type).toBe(0);
    engine.invalidate();
    engine.setLoop("demand");
    scheduler.frame();
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("a layer added after disposal or failure is released at once (no orphans)", () => {
    const engine = create();
    engine.dispose();
    const late = layer();
    engine.add(late);
    expect(late.dispose).toHaveBeenCalledTimes(1);

    const failing = create({ onFatal: () => {} });
    renderer.render.mockImplementation(() => {
      throw new Error("render");
    });
    failing.setLoop("always");
    scheduler.frame();
    const afterFailure = layer();
    failing.add(afterFailure);
    expect(afterFailure.dispose).toHaveBeenCalledTimes(1);
  });

  it("stops listening to its canvas before releasing the context (no late loss report)", () => {
    const onContextLost = vi.fn();
    const engine = create({ onContextLost });
    renderer.forceContextLoss.mockImplementation(() =>
      engine.canvas.dispatchEvent(new Event("webglcontextlost")),
    );
    engine.dispose();
    expect(onContextLost).not.toHaveBeenCalled();
  });

  it("repeated create/dispose cycles leave nothing behind", () => {
    const net = trackWindowListeners();
    for (let i = 0; i < 5; i++) {
      const engine = create();
      engine.add(layer());
      engine.setLoop("always");
      scheduler.frame();
      engine.dispose();
    }
    expect(container.children).toHaveLength(0);
    expect(scheduler.pending).toBe(0);
    for (const [type, count] of net) expect(count, type).toBe(0);
  });
});
