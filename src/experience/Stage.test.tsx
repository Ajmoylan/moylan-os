import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AmbientFieldContext, AmbientFieldProps } from "./ambient/AmbientField";
import type { StagePlan } from "./capabilities";
import type { EngineOptions, FrameLoop } from "./engine/Engine";
import type { FlowSimulationProps } from "./flow/FlowSimulation";
import type { StageInteraction } from "./flow/interaction";
import type { NexAvatarProps } from "./nex/NexAvatar";
import { MIN_PARTICLE_SHARE, type Quality } from "./performance/quality";
import Stage, { MAX_CONTEXT_LOSSES, RESTORE_TIMEOUT_MS } from "./Stage";

/**
 * Stage wrapper (Milestone 2.4a): what the engine and its layers receive across re-renders, tier
 * changes, visibility changes and context loss, and the failure policy, by fault injection at every
 * construction and update point. jsdom has no WebGL, so the engine and the layers are replaced by
 * recorders (the engine and layers have their own tests; the real renderer is covered by the
 * Playwright specs).
 */

type Kind = "flow" | "ambient" | "nex";
interface LayerRecord {
  kind: Kind;
  context: { interaction: StageInteraction } & Partial<AmbientFieldContext>;
  props: unknown[];
  disposed: number;
}
interface EngineRecord {
  options: EngineOptions;
  renderer: unknown;
  dpr: (readonly [number, number])[];
  loop: FrameLoop[];
  layers: { record: LayerRecord; dispose(): void }[];
  invalidations: number;
  disposed: number;
}

const seen = vi.hoisted(() => ({
  engines: [] as EngineRecord[],
  layers: [] as LayerRecord[],
  forget: vi.fn(),
  faults: {
    engine: false,
    construct: null as Kind | null,
    setProps: null as Kind | null,
  },
}));

vi.mock("./engine/Engine", () => ({
  Engine: class {
    record: EngineRecord;
    get renderer() {
      return this.record.renderer;
    }
    constructor(options: EngineOptions) {
      if (seen.faults.engine) throw new Error("Error creating WebGL context.");
      this.record = {
        options,
        renderer: { isRenderer: true },
        dpr: [],
        loop: [],
        layers: [],
        invalidations: 0,
        disposed: 0,
      };
      seen.engines.push(this.record);
    }
    setDpr(range: readonly [number, number]) {
      if (this.record.dpr.at(-1) !== range) this.record.dpr.push(range);
    }
    setLoop(mode: FrameLoop) {
      if (this.record.loop.at(-1) !== mode) this.record.loop.push(mode);
    }
    add(layer: EngineRecord["layers"][number]) {
      this.record.layers.push(layer);
    }
    remove(layer: unknown) {
      this.record.layers = this.record.layers.filter((l) => l !== layer);
    }
    invalidate() {
      this.record.invalidations++;
    }
    dispose() {
      this.record.disposed++;
      if (this.record.disposed > 1) return;
      for (const layer of this.record.layers.splice(0)) layer.dispose();
    }
  },
}));

function layerClass(kind: Kind) {
  return class {
    record: LayerRecord;
    constructor(_engine: unknown, context: LayerRecord["context"]) {
      if (seen.faults.construct === kind) throw new Error(`${kind} construction`);
      this.record = { kind, context, props: [], disposed: 0 };
      seen.layers.push(this.record);
    }
    setProps(props: unknown) {
      if (seen.faults.setProps === kind) throw new Error(`${kind} setProps`);
      const changed = JSON.stringify(this.record.props.at(-1)) !== JSON.stringify(props);
      this.record.props.push(props);
      return changed;
    }
    dispose() {
      this.record.disposed++;
    }
  };
}

vi.mock("./flow/FlowSimulation", () => ({ FlowSimulation: layerClass("flow") }));
vi.mock("./flow/FlowField", () => ({ forgetValidatedFormat: seen.forget }));
vi.mock("./ambient/AmbientField", () => ({ AmbientField: layerClass("ambient") }));
vi.mock("./nex/NexAvatar", () => ({ NexAvatar: layerClass("nex") }));

const full: StagePlan = { tier: 3, motion: "full", pointerEffects: true, reason: "capable" };
const reduced: StagePlan = { tier: 1, motion: "reduced", pointerEffects: false, reason: "capable" };

const engine = () => seen.engines.at(-1)!;
const lastDpr = () => engine().dpr.at(-1)!;
const lastLoop = () => engine().loop.at(-1)!;
const last = (kind: Kind) => seen.layers.filter((l) => l.kind === kind).at(-1)!;
const lastProps = <T,>(kind: Kind) => last(kind).props.at(-1) as T;
const lastField = () => ({
  ...last("ambient").context,
  ...lastProps<AmbientFieldProps>("ambient"),
});
const lastNex = () => ({ ...last("nex").context, ...lastProps<NexAvatarProps>("nex") });
const lastFlow = () => lastProps<FlowSimulationProps>("flow");
const step = (next: Quality) => act(() => last("ambient").context.onQualityStep!(next));
const stageEl = (container: HTMLElement) => container.querySelector<HTMLElement>(".os-stage")!;
const options = () => engine().options;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  act(() => window.dispatchEvent(new Event("resize")));
}

beforeEach(() => {
  seen.engines.length = 0;
  seen.layers.length = 0;
  seen.faults = { engine: false, construct: null, setProps: null };
  seen.forget.mockClear();
  setViewport(1280, 720);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Stage adaptive quality", () => {
  it("starts at the tier defaults", () => {
    render(<Stage agent="nex" plan={full} />);
    expect(lastDpr()).toEqual([1, 2]);
    expect(lastField().particleShare).toBe(1);
    expect(lastField().settings.particles).toBe(12_000);
  });

  it("passes the adapted DPR to the engine, so a re-render can't restore the original cap", () => {
    const { rerender } = render(<Stage agent="nex" plan={full} />);
    step({ dprCap: 1.5, particleShare: 1 });
    expect(lastDpr()).toEqual([1, 1.5]);

    rerender(<Stage agent="forge" plan={full} />); // route change: a new agent
    expect(lastDpr()).toEqual([1, 1.5]);
  });

  it("keeps the lowest quality across re-renders, tier changes and stale steps", () => {
    const { rerender } = render(<Stage agent="nex" plan={full} />);
    step({ dprCap: 1.5, particleShare: 1 });
    step({ dprCap: 1, particleShare: 1 });
    step({ dprCap: Infinity, particleShare: 0.5 });
    step({ dprCap: Infinity, particleShare: MIN_PARTICLE_SHARE });
    expect(lastDpr()).toEqual([1, 1]);
    expect(lastField().particleShare).toBe(MIN_PARTICLE_SHARE);

    rerender(<Stage agent="forge" plan={full} />);
    rerender(<Stage agent="forge" plan={reduced} />); // tier 3 → 1
    expect(lastField().settings.particles).toBe(2_000);
    expect(lastField().particleShare).toBe(MIN_PARTICLE_SHARE);
    expect(lastDpr()).toEqual([1, 1]);

    rerender(<Stage agent="forge" plan={full} />); // tier 1 → 3: new geometry, same share
    expect(lastField().settings.particles).toBe(12_000);
    expect(lastField().particleShare).toBe(MIN_PARTICLE_SHARE);
    expect(lastDpr()).toEqual([1, 1]);

    step({ dprCap: 2, particleShare: 1 }); // a stale step never raises quality
    expect(lastDpr()).toEqual([1, 1]);
    expect(lastField().particleShare).toBe(MIN_PARTICLE_SHARE);
  });

  it("keeps quality across visibility changes", () => {
    render(<Stage agent="nex" plan={full} />);
    step({ dprCap: 1.5, particleShare: 0.5 });
    for (const hidden of [true, false]) {
      vi.spyOn(document, "hidden", "get").mockReturnValue(hidden);
      act(() => document.dispatchEvent(new Event("visibilitychange")));
    }
    expect(lastDpr()).toEqual([1, 1.5]);
    expect(lastField().particleShare).toBe(0.5);
  });

  it("applies the backing-pixel limit on large viewports, together with the adaptation", () => {
    render(<Stage agent="nex" plan={full} />);
    setViewport(2560, 1440); // limit 1.5 for the tier-3 4K-equivalent budget
    expect(lastDpr()).toEqual([1, 1.5]);
    step({ dprCap: 1, particleShare: 1 });
    expect(lastDpr()).toEqual([1, 1]);
    setViewport(1280, 720); // a smaller window never undoes the adaptation
    expect(lastDpr()).toEqual([1, 1]);
  });
});

describe("Stage layers", () => {
  it("draws NEX in the same engine with the tier's particle count and glow layer", () => {
    const { rerender } = render(<Stage agent="nex" plan={full} path="/" />);
    expect(lastNex().particles).toBe(30_000);
    expect(lastNex().glowLayer).toBe(true);
    expect(lastNex().motion).toBe("full");
    expect(lastNex().path).toBe("/");

    rerender(<Stage agent="nex" plan={{ ...full, tier: 2 }} path="/" />);
    expect(lastNex().particles).toBe(30_000);
    expect(lastNex().glowLayer).toBe(false);

    rerender(<Stage agent="nex" plan={reduced} path="/" />);
    expect(lastNex().particles).toBe(12_000);
    expect(lastNex().glowLayer).toBe(false);
    expect(lastNex().motion).toBe("reduced");
  });

  it("one pointer substrate: the flow simulation writes it, the field and NEX read it", () => {
    render(<Stage agent="nex" plan={full} path="/" />);
    expect(last("nex").context.interaction).toBe(last("flow").context.interaction);
    expect(last("ambient").context.interaction).toBe(last("flow").context.interaction);
    step({ dprCap: 1.5, particleShare: 0.5 });
    expect(lastNex().particleShare).toBe(0.5);
    expect(lastField().particleShare).toBe(0.5);
  });

  it("forwards pointer effects and the tier's flow size to the flow simulation", () => {
    const { rerender } = render(<Stage agent="nex" plan={full} />);
    expect(lastFlow()).toEqual({ pointerEffects: true, flowSize: 256 });
    rerender(<Stage agent="nex" plan={reduced} />);
    expect(lastFlow()).toEqual({ pointerEffects: false, flowSize: 64 });
  });

  it("passes route changes on, so NEX can follow (or leave) its page anchor", () => {
    const { rerender } = render(<Stage agent="nex" plan={full} path="/" />);
    rerender(<Stage agent="forge" plan={full} path="/engineering" />);
    expect(lastNex().path).toBe("/engineering");
  });

  it("invalidates once per commit that changed something, never for unchanged props", () => {
    const { rerender } = render(<Stage agent="nex" plan={reduced} path="/" />);
    const before = engine().invalidations;
    rerender(<Stage agent="nex" plan={reduced} path="/" />);
    expect(engine().invalidations).toBe(before);
    rerender(<Stage agent="nex" plan={reduced} path="/ai" />);
    expect(engine().invalidations).toBe(before + 1);
  });
});

describe("Stage frame loop and lifecycle", () => {
  it("full motion runs continuously; reduced renders on demand; hidden renders nothing", () => {
    const { container, rerender } = render(<Stage agent="nex" plan={full} />);
    expect(lastLoop()).toBe("always");
    expect(stageEl(container).dataset.stageState).toBe("starting");
    act(() => options().onFirstFrame!());
    expect(stageEl(container).dataset.stageState).toBe("running");

    rerender(<Stage agent="nex" plan={reduced} />);
    expect(lastLoop()).toBe("demand");
    expect(stageEl(container).dataset.stageState).toBe("static");

    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(lastLoop()).toBe("never");
    expect(stageEl(container).dataset.stageState).toBe("paused");
  });

  it("keeps one engine and one set of layers across re-renders", () => {
    const { rerender } = render(<Stage agent="nex" plan={full} path="/" />);
    rerender(<Stage agent="forge" plan={reduced} path="/engineering" />);
    rerender(<Stage agent="nex" plan={full} path="/" />);
    expect(seen.engines).toHaveLength(1);
    expect(seen.layers).toHaveLength(3);
  });

  it("context loss stops frames; a restore rebuilds the layers under the same engine", () => {
    const { container } = render(<Stage agent="nex" plan={full} />);
    act(() => options().onFirstFrame!());
    const before = { flow: last("flow"), ambient: last("ambient"), nex: last("nex") };

    const lost = new Event("webglcontextlost", { cancelable: true });
    act(() => options().onContextLost!(lost));
    expect(lost.defaultPrevented).toBe(true);
    expect(stageEl(container).dataset.stageState).toBe("lost");
    expect(lastLoop()).toBe("never");
    // Released at the moment of loss, while GPU deletes are no-ops: never after the restore, when
    // they would target the new context (WebKit reports those as console errors).
    for (const old of Object.values(before)) expect(old.disposed).toBe(1);
    expect(engine().layers).toHaveLength(0);

    act(() => options().onContextRestored!());
    for (const old of Object.values(before)) expect(old.disposed).toBeGreaterThanOrEqual(1);
    expect(last("nex")).not.toBe(before.nex);
    expect(engine().layers).toHaveLength(3);
    expect(seen.engines).toHaveLength(1);
    expect(stageEl(container).dataset.stageState).toBe("starting");
    expect(lastLoop()).toBe("always");
    // New layers receive their props before their first frame.
    expect(lastField().settings.particles).toBe(12_000);
    expect(lastNex().particles).toBe(30_000);
    expect(lastFlow().pointerEffects).toBe(true);
  });

  it("while the context is lost there are no layers to update, and frames stay stopped", () => {
    const { rerender } = render(<Stage agent="nex" plan={full} path="/" />);
    const before = seen.layers.slice();
    act(() => options().onContextLost!(new Event("webglcontextlost")));
    const propsCalls = before.map((l) => l.props.length);
    rerender(<Stage agent="forge" plan={full} path="/engineering" />); // a route change while lost
    expect(before.map((l) => l.props.length)).toEqual(propsCalls);
    expect(seen.layers).toHaveLength(3);
    expect(lastLoop()).toBe("never");
    act(() => options().onContextRestored!());
    expect(seen.layers).toHaveLength(6);
    expect(lastNex().path).toBe("/engineering");
  });

  it("a restored context validates its flow-map format again (the cache is cleared)", () => {
    render(<Stage agent="nex" plan={full} />);
    act(() => options().onContextLost!(new Event("webglcontextlost")));
    expect(seen.forget).not.toHaveBeenCalled();
    act(() => options().onContextRestored!());
    expect(seen.forget).toHaveBeenCalledTimes(1);
    expect(seen.forget).toHaveBeenCalledWith(seen.engines[0]!.renderer);
  });

  it("releases each set of layers exactly once across loss, restore and unmount", () => {
    const { unmount } = render(<Stage agent="nex" plan={full} />);
    const first = seen.layers.slice();
    act(() => options().onContextLost!(new Event("webglcontextlost")));
    act(() => options().onContextRestored!()); // the restore rebuild runs the old cleanup again
    for (const layer of first) expect(layer.disposed).toBe(1);
    const second = seen.layers.slice(3);
    act(() => options().onContextLost!(new Event("webglcontextlost")));
    unmount();
    for (const layer of second) expect(layer.disposed).toBe(1);
  });

  it("gives up when a lost context is not restored in time", () => {
    vi.useFakeTimers();
    const onUnavailable = vi.fn();
    render(<Stage agent="nex" plan={full} onUnavailable={onUnavailable} />);
    act(() => options().onContextLost!(new Event("webglcontextlost")));
    act(() => vi.advanceTimersByTime(RESTORE_TIMEOUT_MS - 1));
    expect(onUnavailable).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("gives up after more than MAX_CONTEXT_LOSSES losses", () => {
    const onUnavailable = vi.fn();
    render(<Stage agent="nex" plan={full} onUnavailable={onUnavailable} />);
    for (let i = 0; i < MAX_CONTEXT_LOSSES; i++) {
      act(() => options().onContextLost!(new Event("webglcontextlost")));
      act(() => options().onContextRestored!());
    }
    expect(onUnavailable).not.toHaveBeenCalled();
    act(() => options().onContextLost!(new Event("webglcontextlost")));
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("disposes the engine (and with it the layers) on unmount; a pending timeout is cleared", () => {
    vi.useFakeTimers();
    const onUnavailable = vi.fn();
    const { unmount } = render(<Stage agent="nex" plan={full} onUnavailable={onUnavailable} />);
    act(() => options().onContextLost!(new Event("webglcontextlost")));
    const record = engine();
    const layers = seen.layers.slice();
    unmount();
    expect(record.disposed).toBeGreaterThanOrEqual(1);
    for (const layer of layers) expect(layer.disposed).toBeGreaterThanOrEqual(1);
    vi.advanceTimersByTime(RESTORE_TIMEOUT_MS);
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("survives StrictMode's effect replay: a fresh engine (and canvas) the second time", () => {
    render(
      <StrictMode>
        <Stage agent="nex" plan={full} path="/" />
      </StrictMode>,
    );
    expect(seen.engines).toHaveLength(2);
    expect(seen.engines[0]!.disposed).toBe(1);
    expect(seen.engines[1]!.disposed).toBe(0);
    const live = seen.layers.filter((l) => l.disposed === 0);
    expect(live.map((l) => l.kind).sort()).toEqual(["ambient", "flow", "nex"]);
    expect(engine().layers).toHaveLength(3);
    expect(lastField().settings.particles).toBe(12_000);
    expect(lastNex().path).toBe("/");
    expect(lastLoop()).toBe("always");
  });
});

describe("Stage failure policy (fault injection)", () => {
  function expectFallback(onUnavailable: ReturnType<typeof vi.fn>) {
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    for (const e of seen.engines) expect(e.disposed).toBeGreaterThanOrEqual(1);
    for (const layer of seen.layers) expect(layer.disposed).toBeGreaterThanOrEqual(1);
  }

  it("engine/renderer initialisation fails: reported once, no layers created", () => {
    seen.faults.engine = true;
    const onUnavailable = vi.fn();
    render(<Stage agent="nex" plan={full} onUnavailable={onUnavailable} />);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(seen.engines).toHaveLength(0);
    expect(seen.layers).toHaveLength(0);
  });

  for (const kind of ["flow", "ambient", "nex"] as const) {
    it(`${kind} construction fails: earlier layers and the engine are released, reported once`, () => {
      seen.faults.construct = kind;
      const onUnavailable = vi.fn();
      render(<Stage agent="nex" plan={full} onUnavailable={onUnavailable} />);
      expectFallback(onUnavailable);
      expect(seen.engines[0]!.layers).toHaveLength(0);
    });

    it(`${kind} initial setProps fails: every layer and the engine are released, reported once`, () => {
      seen.faults.setProps = kind;
      const onUnavailable = vi.fn();
      render(<Stage agent="nex" plan={full} onUnavailable={onUnavailable} />);
      expect(seen.layers).toHaveLength(3);
      expectFallback(onUnavailable);
    });
  }

  it("a later setProps failure (route change) takes the same path", () => {
    const onUnavailable = vi.fn();
    const { rerender } = render(<Stage agent="nex" plan={full} onUnavailable={onUnavailable} />);
    seen.faults.setProps = "nex";
    rerender(<Stage agent="forge" plan={full} path="/engineering" onUnavailable={onUnavailable} />);
    expectFallback(onUnavailable);
    rerender(<Stage agent="nex" plan={full} path="/" onUnavailable={onUnavailable} />);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("reconstruction after a context restore fails: old and partial layers released, once", () => {
    const onUnavailable = vi.fn();
    render(<Stage agent="nex" plan={full} onUnavailable={onUnavailable} />);
    act(() => options().onContextLost!(new Event("webglcontextlost")));
    seen.faults.construct = "nex";
    act(() => options().onContextRestored!());
    expectFallback(onUnavailable);
    expect(seen.layers.filter((l) => l.disposed === 0)).toHaveLength(0);
  });

  it("a fatal frame error releases everything and is reported once, even if repeated", () => {
    const onUnavailable = vi.fn();
    const { unmount } = render(<Stage agent="nex" plan={full} onUnavailable={onUnavailable} />);
    act(() => options().onFatal!(new Error("render")));
    act(() => options().onFatal!(new Error("render again")));
    expectFallback(onUnavailable);
    expect(seen.engines[0]!.disposed).toBe(1);
    unmount(); // cleanup after the fallback is idempotent: the engine is not released twice
    expect(seen.engines[0]!.disposed).toBe(1);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("works without an onUnavailable handler (the stage still releases everything)", () => {
    render(<Stage agent="nex" plan={full} />);
    expect(() => act(() => options().onFatal!(new Error("render")))).not.toThrow();
    expect(seen.engines[0]!.disposed).toBe(1);
  });
});
