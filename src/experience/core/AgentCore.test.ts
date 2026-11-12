import {
  BufferGeometry,
  DataTexture,
  type Matrix3,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Group,
  type Material,
  type Mesh,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentId } from "~/agents/registry";
import { rgb } from "../ambient/config";
import type * as Definitions from "../agents/definitions";
import type { AgentRenderDefinition, AgentView, AgentViewProps } from "../agents/types";
import type { Engine } from "../engine/Engine";
import { createInteraction } from "../flow/interaction";
import { nexLineVertexTexture, nexPointVertex, nexPointVertexTexture } from "../nex/shaders";
import {
  createMorphReport,
  createTransition,
  type StageTransition,
} from "../transition/StageTransition";
import { TransitionClock } from "../transition/TransitionClock";
import { AgentCore, type AgentCoreContext } from "./AgentCore";
import type { MorphCompiler } from "./morph/programs";
import { ShapeCache } from "./shapeCache";

/**
 * Shared AgentCore (Milestones 2.4b.1a–2.4b.2): NEX hosted through its definition (transactional
 * construction, complete disposal, the Stage-lifetime shape cache), the orbit transports (1b), and
 * since 2.4b.2 the explicit ownership of agent views: replacement when the drawn agent changes
 * (new view first, then the old one released), the unsupported state, and morph-request answers.
 * NEX's frame-by-frame identity with the merged renderer is tested in nex/appearance.test.ts.
 */

const probe = vi.hoisted(() => ({ supported: true, calls: 0, unsafe: false }));

vi.mock("./orbits/probe", () => ({
  orbitTexturesSupported: () => {
    probe.calls++;
    if (probe.unsafe) throw new Error("probe could not restore the renderer");
    return probe.supported;
  },
}));

const anchors = vi.hoisted(() => ({ attached: 0, detached: 0 }));

vi.mock("../nex/anchor", () => ({
  AnchorTracker: class {
    version = 1;
    attach() {
      anchors.attached++;
    }
    detach() {
      anchors.detached++;
    }
    setElement() {}
    read() {
      return { present: true, left: 600, top: 200, width: 400, height: 400 };
    }
  },
}));

/** A second, fake agent definition ("forge") for view-ownership tests; off by default. */
const fake = vi.hoisted(() => ({
  forge: false,
  failCreate: false,
  views: [] as { setProps: unknown[]; updates: number; disposed: number }[],
}));

vi.mock("../agents/definitions", async (original) => {
  const actual = await original<typeof Definitions>();
  return {
    stageAgentFor: (agent: AgentId) => agent,
    definitionFor: (id: AgentId) => {
      if (id !== "forge" || !fake.forge) return actual.definitionFor(id);
      const nex = actual.definitionFor("nex")!;
      return {
        ...nex,
        id: "forge",
        hotOverride: "#ffffff",
        transports: { idle: ["uniforms"], uniformVectors: { uniforms: 10 } },
        // No morph module: a change to or from it can't morph (the answer is "failed": a swap).
        morph: undefined,
        createView: (): AgentView => {
          if (fake.failCreate) throw new Error("forge view");
          const record = { setProps: [] as unknown[], updates: 0, disposed: 0 };
          fake.views.push(record);
          return {
            phase: "update",
            state: "visible",
            setProps(props: AgentViewProps) {
              record.setProps.push(props);
              return true;
            },
            update() {
              record.updates++;
            },
            dispose() {
              record.disposed++;
            },
            particles: () => null,
            morphUniforms: () => ({}),
            morphHost: () => null,
            object: () => new Group(),
            setMorphRole() {},
          };
        },
      } as AgentRenderDefinition;
    },
  };
});

/** A compiler whose every program links (these tests don't exercise compilation). */
const trustingCompiler: MorphCompiler = {
  compile: () => Promise.resolve(true),
  warm: () => Promise.resolve(true),
  verify: () => true,
};

const props = (overrides: Partial<AgentViewProps> = {}): AgentViewProps => ({
  particles: 2_400,
  particleShare: 1,
  glowLayer: true,
  motion: "full",
  path: "/",
  ...overrides,
});

function fakeEngine(): Engine {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(20, 1.5, 0.1, 40),
    width: 1200,
    height: 800,
    dpr: 2,
    renderer: { isWebGLRenderer: true },
    invalidate: vi.fn(),
  } as unknown as Engine;
}

function context(stage: HTMLElement, overrides: Partial<AgentCoreContext> = {}): AgentCoreContext {
  return {
    stage,
    interaction: createInteraction(0.1),
    transition: createTransition("nex"),
    report: createMorphReport(),
    shapes: new ShapeCache(),
    orbitPreference: "uniforms",
    epochs: { owner: 0, context: 0 },
    compiler: trustingCompiler,
    ...overrides,
  };
}

/** AgentCore driven by a real TransitionClock (appearance and placement), as in the Stage. */
function rig(stage: HTMLElement, overrides: Partial<AgentCoreContext> = {}) {
  const engine = fakeEngine();
  const ctx = context(stage, overrides);
  const clock = new TransitionClock(engine, { transition: ctx.transition, report: ctx.report });
  const core = new AgentCore(engine, ctx);
  const apply = (p: AgentViewProps, agent: AgentId = "nex") => {
    clock.setProps({ agent, path: p.path, motion: p.motion, hidden: false });
    return core.setProps(p);
  };
  const step = (delta = 0.016) => {
    clock.update(engine, delta);
    core.update(engine, delta);
  };
  const dispose = () => {
    core.dispose();
    clock.dispose();
  };
  return { engine, ctx, clock, core, apply, step, dispose };
}

/** Every uniform value of every material, in scene order, as plain numbers (exact compare). */
function snapshot(root: Group) {
  const plain = (value: unknown): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(plain);
    const v = value as {
      isTexture?: boolean;
      elements?: ArrayLike<number>;
      toArray?: () => number[];
    };
    if (v.isTexture) return "texture";
    if (v.elements) return Array.from(v.elements);
    if (v.toArray) return v.toArray();
    return value;
  };
  return root.children.map((child) => {
    const object = child as Mesh<BufferGeometry, Material>;
    const material = object.material as ShaderMaterial;
    return {
      type: object.type,
      visible: object.visible,
      vertexShader: material.vertexShader,
      fragmentShader: material.fragmentShader,
      drawRange: { ...object.geometry.drawRange },
      uniforms: Object.fromEntries(
        Object.entries(material.uniforms).map(([name, uniform]) => [name, plain(uniform.value)]),
      ),
    };
  });
}

let stage: HTMLElement;

beforeEach(() => {
  probe.supported = true;
  probe.calls = 0;
  probe.unsafe = false;
  anchors.attached = anchors.detached = 0;
  fake.forge = false;
  fake.failCreate = false;
  fake.views.length = 0;
  stage = document.createElement("div");
});

afterEach(() => vi.restoreAllMocks());

describe("AgentCore hosting NEX", () => {
  it("is the stage's update-phase agent layer, hosting NEX's unchanged scene graph", () => {
    const engine = fakeEngine();
    const core = new AgentCore(engine, context(stage));
    expect(core.phase).toBe("update");
    expect(core.definition?.id).toBe("nex");
    expect(engine.scene.children).toHaveLength(1);
    expect(engine.scene.children[0]!.children).toHaveLength(6);
    // NEX's anchor is the transition clock's now, not the renderer's.
    expect(anchors.attached).toBe(0);
    core.dispose();
  });

  it("uses the registry palette, byte-identical to NEX's approved colour values", () => {
    const transition = createTransition("nex");
    const legacy = { deep: rgb("#14a89c"), accent: rgb("#3fe0d0"), hot: rgb("#c9fbf5") };
    for (const key of ["deep", "accent", "hot"] as const) {
      expect(transition.palette[key].toArray()).toEqual(legacy[key].toArray());
    }
  });

  it("publishes data-agent-state alongside data-nex-state, and removes both on dispose", () => {
    const r = rig(stage);
    r.apply(props());
    expect(stage.dataset.agentState).toBeUndefined();
    r.step();
    expect(stage.dataset.agentState).toBe("visible");
    expect(stage.dataset.agentState).toBe(stage.dataset.nexState);
    r.dispose();
    expect(stage.dataset.agentState).toBeUndefined();
    expect(stage.dataset.nexState).toBeUndefined();
  });

  it("takes shapes from the Stage-lifetime cache: a rebuild (context restore) regenerates nothing", () => {
    const shapes = new ShapeCache();
    const ctx = context(stage, { shapes });
    const first = new AgentCore(fakeEngine(), ctx);
    first.setProps(props());
    first.dispose();
    const second = new AgentCore(fakeEngine(), ctx);
    second.setProps(props());
    expect(shapes.generated).toBe(1);
    second.setProps(props({ particles: 1_200 })); // a tier change generates the new N once
    expect(shapes.generated).toBe(2);
    second.dispose();
  });

  it("construction failure releases everything (fault injection)", () => {
    const engine = fakeEngine();
    vi.spyOn(engine.scene, "add").mockImplementation(() => {
      throw new Error("scene");
    });
    const materials = vi.spyOn(ShaderMaterial.prototype, "dispose");
    expect(() => new AgentCore(engine, context(stage))).toThrow("scene");
    expect(materials).toHaveBeenCalledTimes(6);
    expect(engine.scene.children).toHaveLength(0);
    expect(Object.keys(stage.dataset)).toEqual([]);
  });

  it("refuses an agent without a WebGL definition, leaving nothing behind", () => {
    const engine = fakeEngine();
    const transition = createTransition("nex");
    transition.source = "forge";
    expect(() => new AgentCore(engine, context(stage, { transition }))).toThrow(/forge/);
    expect(engine.scene.children).toHaveLength(0);
    expect(Object.keys(stage.dataset)).toEqual([]);
  });

  it("dispose is complete and idempotent; a disposed core ignores props and frames", () => {
    const engine = fakeEngine();
    const geometries = vi.spyOn(BufferGeometry.prototype, "dispose");
    const core = new AgentCore(engine, context(stage));
    core.setProps(props());
    core.dispose();
    core.dispose();
    // 3 overlay geometries + the 2 placeholders replaced by the first shape + the 2 shape geometries.
    expect(geometries).toHaveBeenCalledTimes(7);
    expect(engine.scene.children).toHaveLength(0);
    expect(core.setProps(props({ particles: 1_200 }))).toBe(false);
    core.update(engine, 0.016);
    expect(Object.keys(stage.dataset)).toEqual([]);
  });
});

describe("AgentCore view ownership (2.4b.2)", () => {
  /** Puts the clock's frame in a state directly (AgentCore only reads it). */
  const frame = (t: StageTransition, patch: Partial<StageTransition>) => Object.assign(t, patch);

  it("replaces the active view when the drawn agent changes: new view first, with current props", () => {
    fake.forge = true;
    const engine = fakeEngine();
    const ctx = context(stage);
    const core = new AgentCore(engine, ctx);
    core.setProps(props());
    const materials = vi.spyOn(ShaderMaterial.prototype, "dispose");
    frame(ctx.transition, { source: "forge", target: "forge" });
    core.update(engine, 0.016);
    expect(core.definition?.id).toBe("forge");
    expect(fake.views).toHaveLength(1);
    expect(fake.views[0]!.setProps).toEqual([props()]); // got the current props before its frame
    expect(fake.views[0]!.updates).toBe(1);
    expect(materials).toHaveBeenCalledTimes(6); // NEX's view released after the new one existed
    expect(engine.scene.children).toHaveLength(0);
    // Back to NEX: a fresh NEX view, the fake released.
    frame(ctx.transition, { source: "nex", target: "nex" });
    core.update(engine, 0.016);
    expect(core.definition?.id).toBe("nex");
    expect(fake.views[0]!.disposed).toBe(1);
    expect(engine.scene.children).toHaveLength(1);
    core.dispose();
  });

  it("a failing replacement keeps the current view and propagates (the Stage's fail() path)", () => {
    fake.forge = true;
    fake.failCreate = true;
    const engine = fakeEngine();
    const ctx = context(stage);
    const core = new AgentCore(engine, ctx);
    core.setProps(props());
    const materials = vi.spyOn(ShaderMaterial.prototype, "dispose");
    frame(ctx.transition, { source: "forge", target: "forge" });
    expect(() => core.update(engine, 0.016)).toThrow("forge view");
    expect(core.definition?.id).toBe("nex");
    expect(materials).not.toHaveBeenCalled();
    core.dispose();
    expect(materials).toHaveBeenCalledTimes(6);
  });

  it("an unsupported drawn agent has no view; the stage reports it, and a supported agent returns", () => {
    const engine = fakeEngine();
    const ctx = context(stage);
    const core = new AgentCore(engine, ctx);
    core.setProps(props());
    frame(ctx.transition, { state: "unsupported" });
    core.update(engine, 0.016);
    expect(core.definition).toBeNull();
    expect(engine.scene.children).toHaveLength(0);
    expect(stage.dataset.agentSupport).toBe("unsupported");
    expect(stage.dataset.agentState).toBe("unsupported");
    frame(ctx.transition, { state: "idle" });
    core.update(engine, 0.016);
    expect(core.definition?.id).toBe("nex");
    expect(stage.dataset.agentSupport).toBeUndefined();
    core.dispose();
  });

  it("answers each morph request once; a pair that can't morph is answered 'failed'", () => {
    fake.forge = true;
    const engine = fakeEngine();
    const ctx = context(stage);
    const core = new AgentCore(engine, ctx);
    core.setProps(props());
    frame(ctx.transition, { state: "preparing", request: 7, target: "forge" });
    core.update(engine, 0.016);
    expect(ctx.report).toEqual({ request: 7, status: "failed" });
    ctx.report.status = "none"; // (the clock never clears it; this proves no second answer)
    core.update(engine, 0.016);
    expect(ctx.report).toEqual({ request: 7, status: "none" });
    core.dispose();
  });

  it("end to end with the clock: selecting another agent swaps views at the next frame", () => {
    fake.forge = true;
    const r = rig(stage);
    r.apply(props());
    r.step();
    r.apply(props({ path: "/engineering" }), "forge");
    r.step(); // preparing: AgentCore answers "failed" (the fake agent has no morph module)
    expect(r.ctx.transition.state).toBe("preparing");
    r.step(); // the clock reads the answer: swap
    expect(r.ctx.transition.source).toBe("forge");
    expect(r.core.definition?.id).toBe("forge");
    expect(r.ctx.transition.generation).toBe(1);
    r.dispose();
  });
});

describe("AgentCore orbit transport (2.4b.1b)", () => {
  const ORBIT_KEYS = ["uFrames", "uOrbitTable"];
  /** The snapshot without the orbit transport (uniform names and the two vertex shaders). */
  const withoutTransport = (root: Group) =>
    snapshot(root).map(({ uniforms, vertexShader, ...rest }) => ({
      ...rest,
      uniforms: Object.fromEntries(
        Object.entries(uniforms).filter(([name]) => !ORBIT_KEYS.includes(name)),
      ),
      vertexShader: vertexShader
        .replace(
          /uniform highp sampler2D uOrbitTable;\nuniform float uOrbitFlow\[FRAMES\];\nmat3 orbitFrame[\s\S]*?\n}/,
          "",
        )
        .replace(/uniform mat3 uFrames\[FRAMES\];\nuniform float uOrbitFlow\[FRAMES\];/, "")
        .replaceAll("orbitFrame(frame)", "uFrames[frame]"),
    }));

  it("uses the approved uniform transport by default, without probing", () => {
    const engine = fakeEngine();
    const core = new AgentCore(engine, context(stage));
    expect(core.orbitTransport).toBe("uniforms");
    expect(probe.calls).toBe(0);
    expect(stage.dataset.stageOrbits).toBe("uniforms");
    const points = (engine.scene.children[0] as Group).children[2] as Mesh<
      BufferGeometry,
      ShaderMaterial
    >;
    expect(points.material.vertexShader).toBe(nexPointVertex);
    expect(Object.keys(points.material.uniforms)).toEqual(
      expect.arrayContaining(["uFrames", "uOrbitFlow"]),
    );
    expect(points.material.uniforms.uOrbitTable).toBeUndefined();
    core.dispose();
    expect(stage.dataset.stageOrbits).toBeUndefined();
  });

  it("uses the texture transport when requested and the context passes the probe", () => {
    const engine = fakeEngine();
    const core = new AgentCore(engine, context(stage, { orbitPreference: "texture" }));
    expect(core.orbitTransport).toBe("texture");
    expect(probe.calls).toBe(1);
    expect(stage.dataset.stageOrbits).toBe("texture");
    const [, lines, points, glowPoints] = (engine.scene.children[0] as Group).children as Mesh<
      BufferGeometry,
      ShaderMaterial
    >[];
    expect(points!.material.vertexShader).toBe(nexPointVertexTexture);
    expect(glowPoints!.material.vertexShader).toBe(nexPointVertexTexture);
    expect(lines!.material.vertexShader).toBe(nexLineVertexTexture);
    const table = points!.material.uniforms.uOrbitTable!.value as DataTexture;
    expect(table).toBeInstanceOf(DataTexture);
    expect(glowPoints!.material.uniforms.uOrbitTable!.value).toBe(table);
    expect(lines!.material.uniforms.uOrbitTable!.value).toBe(table);
    expect(points!.material.uniforms.uFrames).toBeUndefined();
    core.dispose();
  });

  it("falls back to the uniform transport when the probe fails", () => {
    probe.supported = false;
    const engine = fakeEngine();
    const core = new AgentCore(engine, context(stage, { orbitPreference: "texture" }));
    expect(core.orbitTransport).toBe("uniforms");
    expect(stage.dataset.stageOrbits).toBe("uniforms");
    const points = (engine.scene.children[0] as Group).children[2] as Mesh<
      BufferGeometry,
      ShaderMaterial
    >;
    expect(points.material.vertexShader).toBe(nexPointVertex);
    core.dispose();
  });

  it("feeds the texture the same frames, and everything else matches the uniform path, frame by frame", () => {
    const u = rig(stage);
    const t = rig(document.createElement("div"), { orbitPreference: "texture" });
    const sequence: [Partial<AgentViewProps>, number[]][] = [
      [{}, [0.016, 0.016, 0.25, 0.016]],
      [{ particleShare: 0.5, glowLayer: false }, [0.016, 0.033]],
      [{ particles: 1_200, motion: "reduced" }, [0, 0.016]],
      [{ particles: 1_200, motion: "full", path: "/ai" }, [0.016, 2.5, 0.016]],
    ];
    let visibleFrames = 0;
    for (const [overrides, deltas] of sequence) {
      expect(t.apply(props(overrides))).toBe(u.apply(props(overrides)));
      for (const delta of deltas) {
        u.step(delta);
        t.step(delta);
        const ur = u.engine.scene.children[0] as Group;
        const tr = t.engine.scene.children[0] as Group;
        expect(withoutTransport(tr)).toEqual(withoutTransport(ur));
        expect(tr.matrix.elements).toEqual(ur.matrix.elements);
        if (ur.visible) visibleFrames++;
        const material = (ur.children[2] as Mesh<BufferGeometry, ShaderMaterial>).material;
        const textured = (tr.children[2] as Mesh<BufferGeometry, ShaderMaterial>).material;
        const frames = material.uniforms.uFrames!.value as Matrix3[];
        expect(textured.uniforms.uOrbitFlow!.value).toEqual(material.uniforms.uOrbitFlow!.value);
        const table = (textured.uniforms.uOrbitTable!.value as DataTexture).image
          .data as Float32Array;
        frames.forEach((frame, k) => {
          for (let c = 0; c < 3; c++) {
            for (let i = 0; i < 3; i++) {
              expect(
                Object.is(table[k * 12 + c * 4 + i], Math.fround(frame.elements[c * 3 + i]!)),
              ).toBe(true);
            }
          }
        });
      }
    }
    expect(visibleFrames).toBeGreaterThan(5); // the comparison ran on drawn frames
    u.dispose();
    t.dispose();
  });

  it("an unsafe probe cleanup failure is not a fallback: construction fails, leaving nothing", () => {
    probe.unsafe = true;
    const engine = fakeEngine();
    const materials = vi.spyOn(ShaderMaterial.prototype, "dispose");
    expect(() => new AgentCore(engine, context(stage, { orbitPreference: "texture" }))).toThrow(
      "probe could not restore the renderer",
    );
    expect(materials).not.toHaveBeenCalled();
    expect(engine.scene.children).toHaveLength(0);
    expect(Object.keys(stage.dataset)).toEqual([]);
  });

  it("owns the table: released with the layer, and on a failed construction", () => {
    const textures = vi.spyOn(DataTexture.prototype, "dispose");
    const core = new AgentCore(fakeEngine(), context(stage, { orbitPreference: "texture" }));
    core.dispose();
    core.dispose();
    expect(textures).toHaveBeenCalledTimes(1);
    const engine = fakeEngine();
    vi.spyOn(engine.scene, "add").mockImplementation(() => {
      throw new Error("scene");
    });
    expect(() => new AgentCore(engine, context(stage, { orbitPreference: "texture" }))).toThrow(
      "scene",
    );
    expect(textures).toHaveBeenCalledTimes(2);
    expect(Object.keys(stage.dataset)).toEqual([]);
  });

  it("asks for the capability once per view construction, only when the texture is wanted", () => {
    new AgentCore(fakeEngine(), context(stage, { orbitPreference: "texture" })).dispose();
    new AgentCore(fakeEngine(), context(stage, { orbitPreference: "texture" })).dispose();
    new AgentCore(fakeEngine(), context(stage)).dispose(); // uniforms wanted: never asked
    expect(probe.calls).toBe(2);
  });
});
