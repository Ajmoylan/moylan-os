import {
  BufferGeometry,
  DataTexture,
  type Matrix3,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  type Group,
  type Material,
  type Mesh,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rgb } from "../ambient/config";
import type { Engine } from "../engine/Engine";
import { createInteraction } from "../flow/interaction";
import { NexAvatar, type NexAvatarProps } from "../nex/NexAvatar";
import { nexLineVertexTexture, nexPointVertex, nexPointVertexTexture } from "../nex/shaders";
import { generateNexShape } from "../nex/shape";
import { createTransition } from "../transition/StageTransition";
import { AgentCore, type AgentCoreContext } from "./AgentCore";
import { ShapeCache } from "./shapeCache";

/**
 * Shared AgentCore, Milestone 2.4b.1a: NEX hosted through its definition must be exactly the NEX
 * of 8920b54 (same scene graph, shaders, uniform values every frame, geometry and draw ranges),
 * with transactional construction, complete disposal and the Stage-lifetime shape cache.
 */

const faults = vi.hoisted(() => ({ anchorAttach: false }));
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
      if (faults.anchorAttach) throw new Error("anchor");
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

/** NEX's colours as the 8920b54 renderer built them (literal hex values, before the registry). */
const LEGACY_COLOURS = () => ({
  deep: rgb("#14a89c"),
  accent: rgb("#3fe0d0"),
  hot: rgb("#c9fbf5"),
});

const props = (overrides: Partial<NexAvatarProps> = {}): NexAvatarProps => ({
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
    camera: Object.assign(new PerspectiveCamera(20, 1.5, 0.1, 40), {}),
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
    shapes: new ShapeCache(),
    orbitPreference: "uniforms",
    ...overrides,
  };
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
      frustumCulled: object.frustumCulled,
      vertexShader: material.vertexShader,
      fragmentShader: material.fragmentShader,
      blending: [material.blending, material.blendSrc, material.blendDst, material.blendEquation],
      depth: [material.transparent, material.depthTest, material.depthWrite],
      drawRange: { ...object.geometry.drawRange },
      attributes: Object.keys(object.geometry.attributes),
      uniforms: Object.fromEntries(
        Object.entries(material.uniforms).map(([name, uniform]) => [name, plain(uniform.value)]),
      ),
    };
  });
}

let stage: HTMLElement;

beforeEach(() => {
  faults.anchorAttach = false;
  probe.supported = true;
  probe.calls = 0;
  probe.unsafe = false;
  anchors.attached = anchors.detached = 0;
  stage = document.createElement("div");
});

afterEach(() => vi.restoreAllMocks());

describe("AgentCore (2.4b.1a)", () => {
  it("is the stage's update-phase agent layer, hosting NEX's unchanged scene graph", () => {
    const engine = fakeEngine();
    const core = new AgentCore(engine, context(stage));
    expect(core.phase).toBe("update");
    expect(core.definition.id).toBe("nex");
    expect(engine.scene.children).toHaveLength(1);
    expect(engine.scene.children[0]!.children).toHaveLength(6);
    expect(anchors.attached).toBe(1);
    core.dispose();
  });

  it("renders exactly the 8920b54 NEX: every uniform, shader, state and range, frame by frame", () => {
    const legacyEngine = fakeEngine();
    const legacy = new NexAvatar(legacyEngine, {
      stage: document.createElement("div"),
      interaction: createInteraction(0.1),
      colours: LEGACY_COLOURS(),
      shape: (count) => generateNexShape(count),
      orbitTransport: "uniforms",
    });
    const coreEngine = fakeEngine();
    const core = new AgentCore(coreEngine, context(stage));

    const sequence: [Partial<NexAvatarProps>, number[]][] = [
      [{}, [0.016, 0.016, 0.25, 0.016]], // first frames, a long frame (clamped step)
      [{ particleShare: 0.5, glowLayer: false }, [0.016, 0.033]],
      [{ particles: 1_200, motion: "reduced" }, [0, 0.016]],
      [{ particles: 1_200, motion: "full", path: "/ai" }, [0.016, 2.5, 0.016]],
    ];
    for (const [overrides, deltas] of sequence) {
      expect(core.setProps(props(overrides))).toBe(legacy.setProps(props(overrides)));
      for (const delta of deltas) {
        legacy.update(legacyEngine, delta);
        core.update(coreEngine, delta);
        const a = legacyEngine.scene.children[0] as Group;
        const b = coreEngine.scene.children[0] as Group;
        expect(snapshot(b)).toEqual(snapshot(a));
        expect(b.visible).toBe(a.visible);
        expect(b.matrix.elements).toEqual(a.matrix.elements);
        expect(b.position.toArray()).toEqual(a.position.toArray());
        expect(b.quaternion.toArray()).toEqual(a.quaternion.toArray());
        expect(b.scale.toArray()).toEqual(a.scale.toArray());
      }
    }
    // The same particle data, generated once (cached) and uploaded from identical arrays.
    const pointsOf = (engine: Engine) =>
      (engine.scene.children[0]!.children[2] as Mesh<BufferGeometry>).geometry;
    for (const name of ["position", "aOrbit", "aSeed"]) {
      expect(pointsOf(coreEngine).getAttribute(name).array).toEqual(
        pointsOf(legacyEngine).getAttribute(name).array,
      );
    }
    legacy.dispose();
    core.dispose();
  });

  it("uses the registry palette, byte-identical to NEX's approved colour values", () => {
    const transition = createTransition("nex");
    const legacy = LEGACY_COLOURS();
    for (const key of ["deep", "accent", "hot"] as const) {
      expect(transition.palette[key].toArray()).toEqual(legacy[key].toArray());
    }
  });

  it("publishes data-agent-state alongside data-nex-state, and removes both on dispose", () => {
    const engine = fakeEngine();
    const core = new AgentCore(engine, context(stage));
    core.setProps(props());
    expect(stage.dataset.agentState).toBeUndefined();
    core.update(engine, 0.016);
    expect(stage.dataset.agentState).toBe("visible");
    expect(stage.dataset.agentState).toBe(stage.dataset.nexState);
    core.dispose();
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
    faults.anchorAttach = true;
    const materials = vi.spyOn(ShaderMaterial.prototype, "dispose");
    expect(() => new AgentCore(engine, context(stage))).toThrow("anchor");
    expect(materials).toHaveBeenCalledTimes(6);
    expect(engine.scene.children).toHaveLength(0);
    expect(anchors.detached).toBe(1);
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
    expect(anchors.detached).toBe(1);
    expect(core.setProps(props({ particles: 1_200 }))).toBe(false);
    core.update(engine, 0.016);
    expect(Object.keys(stage.dataset)).toEqual([]);
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
      Material
    >;
    const material = points.material as ShaderMaterial;
    expect(material.vertexShader).toBe(nexPointVertex);
    expect(Object.keys(material.uniforms)).toEqual(
      expect.arrayContaining(["uFrames", "uOrbitFlow"]),
    );
    expect(material.uniforms.uOrbitTable).toBeUndefined();
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
    // One table, shared by the three programs that read orbit frames; no uniform arrays.
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
    const uniformEngine = fakeEngine();
    const uniformCore = new AgentCore(uniformEngine, context(stage));
    const textureEngine = fakeEngine();
    const textureCore = new AgentCore(
      textureEngine,
      context(document.createElement("div"), { orbitPreference: "texture" }),
    );
    const sequence: [Partial<NexAvatarProps>, number[]][] = [
      [{}, [0.016, 0.016, 0.25, 0.016]],
      [{ particleShare: 0.5, glowLayer: false }, [0.016, 0.033]],
      [{ particles: 1_200, motion: "reduced" }, [0, 0.016]],
      [{ particles: 1_200, motion: "full", path: "/ai" }, [0.016, 2.5, 0.016]],
    ];
    for (const [overrides, deltas] of sequence) {
      expect(textureCore.setProps(props(overrides))).toBe(uniformCore.setProps(props(overrides)));
      for (const delta of deltas) {
        uniformCore.update(uniformEngine, delta);
        textureCore.update(textureEngine, delta);
        const u = uniformEngine.scene.children[0] as Group;
        const t = textureEngine.scene.children[0] as Group;
        expect(withoutTransport(t)).toEqual(withoutTransport(u));
        expect(t.matrix.elements).toEqual(u.matrix.elements);
        // The table holds exactly the float32 values of the uniform matrices; the flow speeds are
        // the same uniform array in both transports.
        const material = (u.children[2] as Mesh<BufferGeometry, ShaderMaterial>).material;
        const textured = (t.children[2] as Mesh<BufferGeometry, ShaderMaterial>).material;
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
    uniformCore.dispose();
    textureCore.dispose();
  });

  it("an unsafe probe cleanup failure is not a fallback: construction fails, leaving nothing", () => {
    probe.unsafe = true;
    const engine = fakeEngine();
    const materials = vi.spyOn(ShaderMaterial.prototype, "dispose");
    expect(() => new AgentCore(engine, context(stage, { orbitPreference: "texture" }))).toThrow(
      "probe could not restore the renderer",
    );
    // The view was never built; the Stage's fail() path takes over (static fallback).
    expect(materials).not.toHaveBeenCalled();
    expect(engine.scene.children).toHaveLength(0);
    expect(Object.keys(stage.dataset)).toEqual([]);
    expect(anchors.attached).toBe(0);
  });

  it("owns the table: released with the layer, and on a failed construction", () => {
    const textures = vi.spyOn(DataTexture.prototype, "dispose");
    const core = new AgentCore(fakeEngine(), context(stage, { orbitPreference: "texture" }));
    core.dispose();
    core.dispose();
    expect(textures).toHaveBeenCalledTimes(1);
    faults.anchorAttach = true;
    expect(
      () => new AgentCore(fakeEngine(), context(stage, { orbitPreference: "texture" })),
    ).toThrow("anchor");
    expect(textures).toHaveBeenCalledTimes(2);
    expect(Object.keys(stage.dataset)).toEqual([]);
  });

  it("asks for the capability once per construction, only when the texture is wanted", () => {
    new AgentCore(fakeEngine(), context(stage, { orbitPreference: "texture" })).dispose();
    new AgentCore(fakeEngine(), context(stage, { orbitPreference: "texture" })).dispose();
    new AgentCore(fakeEngine(), context(stage)).dispose(); // uniforms wanted: never asked
    // The per-renderer cache (one probe per context) is tested in orbits/probe.test.ts.
    expect(probe.calls).toBe(2);
  });
});
