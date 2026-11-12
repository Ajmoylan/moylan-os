import type { Points } from "three";
import {
  BufferGeometry,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  type Group,
  type Object3D,
} from "three";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentId } from "~/agents/registry";
import type * as Morph from "../morphSlot";
import { encodedPresence, lightProgress } from "./light";
import { registerDiagnosticDefinition } from "../../agents/definitions";
import { nexDefinition } from "../../agents/nex";
import { testDefinition } from "../../agents/test";
import { TestView } from "../../agents/test/TestView";
import type { AgentViewProps } from "../../agents/types";
import type { Engine } from "../../engine/Engine";
import { createInteraction } from "../../flow/interaction";
import { NexAvatar } from "../../nex/NexAvatar";
import { NEX_PARAMS } from "../../nex/params";
import { CAMERA_DISTANCE } from "../../nex/placement";
import { easeInOutCubic } from "../../transition/machine";
import { createMorphReport, createTransition } from "../../transition/StageTransition";
import { TransitionClock } from "../../transition/TransitionClock";
import { AgentCore } from "../AgentCore";
import { ShapeCache } from "../shapeCache";
import type { MorphCompiler, StageEpochs } from "./programs";

/**
 * The first real morph (Milestone 2.4b.2 stage D), end to end through the real clock, AgentCore,
 * NEX's renderer and the TEST view, with a controllable compiler in place of the GPU: preparation
 * (destination view hidden, the pair program compiled once, the morph geometry borrowing both
 * views' attributes), morphing (the views' roles and `uMorph`), the handoff (destination promoted,
 * morph released before the source view), reversal, retarget, failure and abort paths, epochs, and
 * exactly-once release over many transitions.
 */

const device = vi.hoisted(() => ({ floatTextures: true }));

vi.mock("../orbits/probe", () => ({ orbitTexturesSupported: () => device.floatTextures }));

vi.mock("../../nex/anchor", () => ({
  AnchorTracker: class {
    version = 1;
    attach() {}
    detach() {}
    setElement() {}
    read() {
      return { present: true, left: 300, top: 200, width: 400, height: 400 };
    }
  },
}));

/** Release order, as it happens: morph geometries released and views disposed. */
const events = vi.hoisted(() => [] as string[]);

vi.mock("../morphSlot", async (original) => {
  const actual = await original<typeof Morph>();
  return {
    ...actual,
    releaseMorphGeometry: (geometry: BufferGeometry) => {
      events.push("morph");
      actual.releaseMorphGeometry(geometry);
    },
  };
});

beforeAll(() => registerDiagnosticDefinition(testDefinition));

let stage: HTMLDivElement;
beforeEach(() => {
  stage = document.createElement("div");
  events.length = 0;
  vi.spyOn(NexAvatar.prototype, "dispose").mockImplementation(function (this: NexAvatar) {
    events.push("nex");
    return original.nex.call(this);
  });
  vi.spyOn(TestView.prototype, "dispose").mockImplementation(function (this: TestView) {
    events.push("test");
    return original.test.call(this);
  });
});
afterEach(() => vi.restoreAllMocks());

const original = {
  nex: NexAvatar.prototype.dispose,
  test: TestView.prototype.dispose,
};

/** A compiler the test resolves by hand (in place of `compileAsync` and the link status). */
function controlledCompiler(holdWarm = false) {
  const calls: { material: ShaderMaterial; resolve(ok: boolean): void }[] = [];
  const warmed: Object3D[] = [];
  const warming: ((linked?: boolean) => void)[] = [];
  /** Fault injection: which views' idle programs fail to link (asynchronously / synchronously). */
  const faults: { warm(object: Object3D): boolean; verify(object: Object3D): boolean } = {
    warm: () => false,
    verify: () => false,
  };
  const verified: Object3D[] = [];
  const compiler: MorphCompiler = {
    compile: (material) => new Promise<boolean>((resolve) => calls.push({ material, resolve })),
    warm: (object) => {
      warmed.push(object);
      const linked = !faults.warm(object);
      return holdWarm
        ? new Promise<boolean>((resolve) => warming.push((ok = linked) => resolve(ok)))
        : Promise.resolve(linked);
    },
    verify: (object) => {
      verified.push(object);
      return !faults.verify(object);
    },
  };
  return { calls, warmed, warming, faults, verified, compiler };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeEngine(maxVertexUniforms = 256): Engine {
  const camera = new PerspectiveCamera(NEX_PARAMS.fov, 1.5, 0.1, 40);
  camera.position.set(0, 0, CAMERA_DISTANCE);
  return {
    scene: new Scene(),
    camera,
    width: 1200,
    height: 800,
    dpr: 2,
    renderer: { capabilities: { maxVertexUniforms } },
    invalidate: vi.fn(),
  } as unknown as Engine;
}

const props = (overrides: Partial<AgentViewProps> = {}): AgentViewProps => ({
  particles: 2_400,
  particleShare: 1,
  glowLayer: true,
  motion: "full",
  path: "/",
  ...overrides,
});

function rig(
  options: { maxVertexUniforms?: number; epochs?: StageEpochs; holdWarm?: boolean } = {},
) {
  const engine = fakeEngine(options.maxVertexUniforms);
  const transition = createTransition("nex");
  const report = createMorphReport();
  const epochs = options.epochs ?? { owner: 0, context: 0 };
  const { calls, warmed, warming, faults, verified, compiler } = controlledCompiler(
    options.holdWarm,
  );
  const shapes = new ShapeCache();
  const clock = new TransitionClock(engine, { transition, report });
  const core = new AgentCore(engine, {
    stage,
    interaction: createInteraction(0.1),
    transition,
    report,
    shapes,
    orbitPreference: "uniforms",
    epochs,
    compiler,
  });
  let current = props();
  let agent: AgentId = "nex";
  const apply = (overrides: Partial<AgentViewProps> = {}, to: AgentId = agent) => {
    agent = to;
    current = { ...current, ...overrides };
    clock.setProps({ agent, path: current.path, motion: current.motion, hidden: false });
    core.setProps(current);
  };
  const step = (delta = 0.016) => {
    clock.update(engine, delta);
    core.update(engine, delta);
  };
  /**
   * One frame as a browser runs it: the frame, then a macrotask turn, so promise callbacks (compile
   * and warm-up results) settle between frames exactly as they do between rAF callbacks.
   */
  const frame = async (delta = 0.016) => {
    step(delta);
    await flush();
  };
  const go = (to: "home" | "engineering") =>
    apply({ path: to === "home" ? "/" : "/engineering" }, to === "home" ? "nex" : "forge");
  const roots = () => engine.scene.children as Group[];
  const dispose = () => {
    core.dispose();
    clock.dispose();
  };
  apply();
  for (let i = 0; i < 200; i++) step(); // NEX has arrived and formed
  return {
    engine,
    transition,
    report,
    epochs,
    calls,
    warmed,
    warming,
    faults,
    verified,
    clock,
    core,
    apply,
    step,
    frame,
    go,
    roots,
    dispose,
  };
}

/** NEX's own point layers (scene graph order: atmosphere, lines, points, glow points, ...). */
const nexLayers = (root: Object3D) => ({
  points: root.children[2] as Points,
  glow: root.children[3] as Points,
});

describe("the first morph: NEX → TEST → NEX (2.4b.2 stage D)", () => {
  it("prepares, morphs, hands off and settles; the morph borrows both views' attributes", async () => {
    const r = rig();
    const nexRoot = r.roots()[0]!;
    const nexAttributes = (nexLayers(nexRoot).points.geometry as BufferGeometry).attributes;

    r.go("engineering");
    r.step();
    expect(r.transition.state).toBe("preparing");
    expect(r.core.diagnostics.destination).toBe("test");
    expect(r.roots()).toHaveLength(2);
    expect(r.roots()[1]!.visible).toBe(false); // the destination is built hidden
    expect(r.calls).toHaveLength(1); // one compile, asynchronous
    expect(r.warmed).toEqual([r.roots()[1]]); // and the destination's own programs
    expect(r.report.status).toBe("none");
    expect(stage.dataset.morphProgram).toBe("compiling");

    r.calls[0]!.resolve(true);
    await flush();
    r.step(); // AgentCore builds the morph and answers "ready" once
    expect(r.report).toEqual({ request: r.transition.request, status: "ready" });
    const morph = r.core.diagnostics.morph!;
    expect(morph.points.parent).toBe(nexRoot); // NEX hosts slot A
    const g = morph.geometry;
    expect(g.getAttribute("position")).toBe(nexAttributes.position);
    expect(g.getAttribute("aOrbit")).toBe(nexAttributes.aOrbit);
    expect(g.getAttribute("aSeed")).toBe(nexAttributes.aSeed);
    const testPoints = r.roots()[1]!.children[0] as Points;
    expect(g.getAttribute("positionB")).toBe(testPoints.geometry.getAttribute("position"));
    expect(g.getAttribute("aOrbitB")).toBe(testPoints.geometry.getAttribute("aOrbit"));
    expect(g.getAttribute("aSeedB")).toBe(testPoints.geometry.getAttribute("aSeed"));

    // Morphing: the morph program draws the particles; uMorph follows the eased phase.
    for (let i = 0; i < 20; i++) {
      r.step();
      if (r.transition.state !== "morphing") continue;
      expect(morph.points.visible).toBe(true);
      expect(morph.material.uniforms.uMorph!.value).toBe(r.transition.eased);
      // Light follows the linear phase (stage-D luminance decision), movement the eased one.
      expect(morph.material.uniforms.uLight!.value).toBe(lightProgress(r.transition.phase));
      // NEX's own light (halo, shell, billboards, lines, glow layer): one factor, applied once.
      const nexUniforms = (nexLayers(nexRoot).glow.material as ShaderMaterial).uniforms;
      const presence = 1 - lightProgress(r.transition.phase);
      expect(nexUniforms.uFade!.value).toBeCloseTo(
        r.transition.visibility.fade * encodedPresence(presence),
        12,
      );
      expect(nexUniforms.uGlowFade!.value).toBe(r.transition.visibility.formed);
      // NEX's own point layer: still in the scene (its geometry registered), its material hidden.
      expect(nexLayers(nexRoot).points.visible).toBe(true);
      expect((nexLayers(nexRoot).points.material as ShaderMaterial).visible).toBe(false);
      expect(nexLayers(nexRoot).glow.visible).toBe(true); // tier 3 glow fades with presence
      expect((testPoints.material as ShaderMaterial).visible).toBe(false);
      expect(stage.dataset.stageTransition).toBe("morphing");
    }
    const testView = r.roots()[1]!;
    events.length = 0;
    while (r.transition.state === "morphing") r.step();
    // Handoff: morph released first, then NEX's view; the TEST view is promoted, not rebuilt.
    expect(r.transition.state).toBe("settling");
    expect(events).toEqual(["morph", "nex"]);
    expect(r.core.definition?.id).toBe("test");
    expect(r.roots()).toEqual([testView]);
    expect((testPoints.material as ShaderMaterial).visible).toBe(true);
    expect(g.attributes).toEqual({}); // detached before disposal
    expect(r.transition.visibility.arrival).toBe(testDefinition.timing.arrival); // formed
    for (let i = 0; i < 40; i++) r.step();
    expect(r.transition.state).toBe("idle");
    expect(r.report.status).toBe("ready");
    r.dispose();
  });

  it("a preparation needs its warm-up to settle: frames stepped with no event-loop turn stay preparing", async () => {
    const r = rig();
    r.go("engineering");
    r.step();
    r.calls[0]!.resolve(true);
    await flush();
    while (r.transition.state !== "idle") await r.frame();
    r.go("home");
    for (let i = 0; i < 10; i++) r.step(); // no turn of the event loop: the warm-up can't settle
    expect(r.transition.state).toBe("preparing");
    expect(r.core.diagnostics.morph).toBeNull();
    await r.frame(); // a turn of the event loop: the warm-up settles after this frame ...
    expect(r.core.diagnostics.morph).toBeNull();
    r.step(); // ... and the next frame builds the morph and answers once
    expect(r.core.diagnostics.morph).not.toBeNull();
    expect(r.report).toEqual({ request: r.transition.request, status: "ready" });
    r.dispose();
  });

  it("the way back reuses the cached pair program (slot B now the source: uMorph = 1 − eased)", async () => {
    const r = rig();
    r.go("engineering");
    r.step();
    r.calls[0]!.resolve(true);
    await flush();
    while (r.transition.state !== "idle") await r.frame();
    r.go("home");
    await r.frame(); // preparing: the cached program; the new NEX view's programs warm up
    expect(r.transition.state).toBe("preparing");
    await r.frame();
    expect(r.calls).toHaveLength(1); // no second compile
    const morph = r.core.diagnostics.morph!;
    expect(morph.towardsB).toBe(false);
    r.step();
    expect(r.transition.state).toBe("morphing");
    expect(morph.material.uniforms.uMorph!.value).toBe(1 - r.transition.eased);
    expect(morph.material.uniforms.uLight!.value).toBe(1 - lightProgress(r.transition.phase));
    events.length = 0;
    while ((r.transition.state as string) === "morphing") r.step();
    expect(events).toEqual(["morph", "test"]);
    expect(r.core.definition?.id).toBe("nex");
    r.dispose();
  });

  it("a reversal mid-morph goes back to NEX: morph released, then the TEST view; NEX's view kept", async () => {
    const r = rig();
    const nexRoot = r.roots()[0];
    r.go("engineering");
    r.step();
    r.calls[0]!.resolve(true);
    await flush();
    for (let i = 0; i < 30; i++) r.step();
    expect(r.transition.state).toBe("morphing");
    const peak = r.transition.phase;
    r.go("home");
    r.step();
    expect(r.transition.direction).toBe(-1);
    expect(r.transition.phase).toBeLessThan(peak);
    expect(r.core.diagnostics.morph!.material.uniforms.uMorph!.value).toBe(r.transition.eased);
    events.length = 0;
    while (r.transition.state === "morphing") r.step();
    expect(r.transition.state).toBe("idle");
    expect(events).toEqual(["morph", "test"]);
    expect(r.roots()).toEqual([nexRoot]);
    expect((nexLayers(nexRoot!).points.material as ShaderMaterial).visible).toBe(true);
    r.dispose();
  });

  it("rapid navigation: only the latest destination is prepared; a retarget releases the old morph", async () => {
    const r = rig();
    r.go("engineering");
    r.step();
    r.go("home"); // back while preparing: no morph, NEX stays
    r.step();
    expect(r.transition.state).toBe("idle");
    expect(r.core.diagnostics.destination).toBeNull();
    expect(r.roots()).toHaveLength(1);
    r.go("engineering");
    r.step();
    expect(r.transition.state).toBe("preparing");
    expect(r.calls).toHaveLength(1); // the same pair is still compiling: not started twice
    r.calls[0]!.resolve(true);
    await flush();
    r.step();
    expect(r.report.status).toBe("ready");
    expect(r.report.request).toBe(r.transition.request);
    expect(r.transition.issued).toBe(2); // every selection got a fresh request number
    r.dispose();
  });

  it("a failed compile is answered 'failed' once and the change becomes a swap (TEST arrives)", async () => {
    const r = rig();
    r.go("engineering");
    r.step();
    r.calls[0]!.resolve(false);
    await flush();
    r.step();
    expect(r.report.status).toBe("failed");
    r.step();
    expect(r.transition.source).toBe("test");
    expect(r.transition.state).toBe("arriving");
    expect(r.core.diagnostics.morph).toBeNull();
    // The failed pair is remembered for this context: the way back fails at once, no compile.
    while (r.transition.state !== "idle") r.step();
    r.go("home");
    r.step();
    expect(r.report.status).toBe("failed");
    expect(r.calls).toHaveLength(1);
    r.dispose();
  });

  it("a compile that never finishes: the 1.5 s cap swaps; its late result is dropped", async () => {
    const r = rig();
    r.go("engineering");
    for (let i = 0; i < 100; i++) r.step(0.02);
    expect(r.transition.source).toBe("test");
    expect(r.core.diagnostics.morph).toBeNull();
    r.calls[0]!.resolve(true); // completes after the swap: cached, but nothing is built from it
    await flush();
    r.step();
    expect(r.core.diagnostics.morph).toBeNull();
    expect(r.core.diagnostics.programs.size).toBe(1);
    r.dispose();
  });

  it("too few vertex uniforms for the uniform pair: the texture transport is used for the morph", async () => {
    const r = rig({ maxVertexUniforms: 128 }); // 128 − 32 = 96 < 112 + 22 + 1; 49 + 22 + 1 fits
    r.go("engineering");
    r.step();
    expect(r.calls).toHaveLength(1);
    const uniforms = r.calls[0]!.material.uniforms;
    expect(uniforms.uOrbitTable).toBeDefined();
    expect(uniforms.uFrames).toBeUndefined();
    expect(stage.dataset.stageOrbits).toBe("uniforms"); // NEX's idle transport is unchanged
    r.calls[0]!.resolve(true);
    await flush();
    r.step();
    expect(r.report.status).toBe("ready");
    r.dispose();
  });

  it("no pair fits the device's vertex uniforms: 'failed' at once, no compile (a swap)", () => {
    // 150 − 32 = 118: both agents idle (NEX 112, TEST 22), but the uniform pair (135) doesn't fit
    // and, without float-texture sampling, the texture pair isn't available.
    device.floatTextures = false;
    const r = rig({ maxVertexUniforms: 150 });
    r.go("engineering");
    r.step();
    expect(r.report.status).toBe("failed");
    expect(r.calls).toHaveLength(0);
    r.step();
    expect(r.transition.source).toBe("test");
    r.dispose();
    device.floatTextures = true;
  });

  it("a tier change mid-morph releases the morph before the views change, then swaps", async () => {
    const r = rig();
    r.go("engineering");
    r.step();
    r.calls[0]!.resolve(true);
    await flush();
    for (let i = 0; i < 20; i++) r.step();
    expect(r.transition.state).toBe("morphing");
    const morph = r.core.diagnostics.morph!;
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    events.length = 0;
    r.apply({ particles: 1_200 });
    // The morph geometry went first (detached), before any view replaced its particle geometry.
    expect(events[0]).toBe("morph");
    expect(dispose.mock.contexts[0]).toBe(morph.geometry);
    expect(morph.geometry.attributes).toEqual({});
    r.step(); // AgentCore reports the abort
    expect(r.report.status).toBe("failed");
    r.step();
    expect(r.transition.state).not.toBe("morphing");
    expect(r.transition.source).toBe("test"); // the latest destination
    r.dispose();
  });

  it("the destination's own programs must be compiled too; a late warm-up for a released view is ignored", async () => {
    const r = rig({ holdWarm: true });
    r.go("engineering");
    r.step();
    r.calls[0]!.resolve(true);
    await flush();
    r.step();
    expect(r.report.status).toBe("none"); // the pair program is ready, the destination isn't
    r.go("home"); // the destination is released while its programs compile
    r.step();
    expect(r.core.diagnostics.destination).toBeNull();
    r.warming[0]!();
    await flush();
    r.go("engineering"); // a new destination view: warmed afresh, not by the stale result
    r.step();
    expect(r.warmed).toHaveLength(2);
    expect(r.report.status).toBe("none");
    r.warming[1]!();
    await flush();
    r.step();
    expect(r.report).toEqual({ request: r.transition.request, status: "ready" });
    r.dispose();
  });

  it("a compile finishing after context loss (or after its AgentCore was replaced) is stale", async () => {
    const epochs = { owner: 0, context: 0 };
    const r = rig({ epochs });
    r.go("engineering");
    r.step();
    const material = r.calls[0]!.material;
    const disposed = vi.spyOn(material, "dispose");
    epochs.context++; // the context is lost: the Stage releases the layers
    r.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
    r.calls[0]!.resolve(true);
    await flush();
    expect(r.core.diagnostics.programs.stats.stale).toBe(1);
    expect(r.core.diagnostics.programs.size).toBe(0);
    expect(disposed).toHaveBeenCalledTimes(1); // never resurrected, never released twice
  });

  it("twenty-four transitions: every morph geometry released exactly once; nothing left over", async () => {
    const r = rig();
    const created: BufferGeometry[] = [];
    const releases = new Map<BufferGeometry, number>();
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    let first = true;
    for (let n = 0; n < 24; n++) {
      r.go(n % 2 === 0 ? "engineering" : "home");
      r.step();
      if (first) {
        r.calls[0]!.resolve(true);
        await flush();
        first = false;
      }
      // Some transitions are interrupted: reversed mid-way, or re-selected while preparing.
      for (let i = 0; i < 200 && r.transition.state !== "idle"; i++) {
        await r.frame();
        const morph = r.core.diagnostics.morph;
        if (morph && !created.includes(morph.geometry)) created.push(morph.geometry);
        if (n % 5 === 3 && i === 25 && r.transition.state === "morphing") {
          r.go(n % 2 === 0 ? "home" : "engineering");
          r.go(n % 2 === 0 ? "engineering" : "home");
        }
      }
    }
    for (const context of dispose.mock.contexts) {
      const g = context as BufferGeometry;
      if (created.includes(g)) releases.set(g, (releases.get(g) ?? 0) + 1);
    }
    expect(created.length).toBeGreaterThanOrEqual(20);
    expect(
      created.every((g) => releases.get(g) === 1 && Object.keys(g.attributes).length === 0),
    ).toBe(true);
    expect(r.calls).toHaveLength(1); // one compile for the pair, both directions
    expect(r.roots()).toHaveLength(1);
    expect(r.core.diagnostics.destination).toBeNull();
    const materials = vi.spyOn(ShaderMaterial.prototype, "dispose");
    r.dispose();
    expect(r.roots()).toHaveLength(0);
    // NEX's six materials (or TEST's one) and the cached pair program.
    expect(materials.mock.calls.length).toBe(r.transition.source === "nex" ? 7 : 2);
  });

  it("the destination is drawn formed and its time continues: no jump at the handoff", async () => {
    const r = rig();
    r.go("engineering");
    r.step();
    r.calls[0]!.resolve(true);
    await flush();
    let time = r.transition.visibility.time;
    while (r.transition.state !== "settling") {
      r.step();
      const next = r.transition.visibility.time;
      // One frame at the drawn agent's pace: NEX's, then TEST's from the handoff frame on.
      const pace = r.transition.source === "nex" ? nexDefinition.timing.pace : 1;
      expect(next - time).toBeCloseTo(0.016 * pace, 9);
      time = next;
    }
    expect(r.transition.visibility.fade).toBe(1);
    expect(r.transition.visibility.arrival).toBe(testDefinition.timing.arrival);
    r.dispose();
  });

  it("placement: a segment from NEX's transform lands exactly on TEST's fixed place at the end", async () => {
    const r = rig();
    const p = r.transition.placement;
    const start = { ...p.displayed };
    r.go("engineering");
    r.step();
    r.calls[0]!.resolve(true);
    await flush();
    r.step();
    r.step();
    expect(r.transition.state).toBe("morphing");
    expect(p.from).toEqual(start); // from what was drawn
    const target = testDefinition.placement;
    const expected = { x: 0, y: 0, scale: 0, onScreen: false };
    if (target.kind === "fixed") target.place(r.engine, r.engine.camera.fov, expected);
    expect(p.to).toEqual(expected);
    let previous = p.progress;
    while (r.transition.state === "morphing") {
      r.step();
      expect(p.progress).toBeGreaterThanOrEqual(previous);
      previous = p.progress;
      if (r.transition.state === "morphing") {
        expect(p.progress).toBeCloseTo(
          (r.transition.phase - 0) / 1,
          1, // advanced with the phase (within the first frame's offset)
        );
      }
    }
    expect(p.displayed).toEqual(expected);
    expect(easeInOutCubic(1)).toBe(1);
    r.dispose();
  });
});
