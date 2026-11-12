import { createHash } from "node:crypto";
import { type BufferGeometry, PerspectiveCamera, Scene, type Group, type Mesh } from "three";
import { describe, expect, it, vi } from "vitest";
import type { AgentId } from "~/agents/registry";
import type * as Definitions from "../agents/definitions";
import type { AgentRenderDefinition, AgentShape, AgentViewProps } from "../agents/types";
import type { Engine } from "../engine/Engine";
import { createInteraction } from "../flow/interaction";
import { NEX_PARAMS } from "../nex/params";
import { CAMERA_DISTANCE } from "../nex/placement";
import { createMorphReport, createTransition } from "../transition/StageTransition";
import { TransitionClock } from "../transition/TransitionClock";
import { AgentCore } from "./AgentCore";
import { createMorphGeometry, releaseMorphGeometry, type ParticleAttributes } from "./morphSlot";
import type { MorphCompiler } from "./morph/programs";
import { ShapeCache } from "./shapeCache";
import { createShapeSlot } from "./slots";

/**
 * Codex gate 1 (before 2.4b.2) and the 11 November decision: cached shapes are immutable. Their
 * arrays are shared, read-only, by the agents' idle renderers and the morph geometry. Nothing may
 * write through them: not frames, not quality or tier changes, not view swaps or reversals, not
 * context restores, not morph geometry creation or disposal.
 *
 * Every shape is fingerprinted when it is generated and checked again at the end (evicted ones
 * too). The arrays the views draw are checked to *be* the cache's arrays (shared, never copied),
 * and a shape regenerated after its eviction (tier change) is checked to be byte-identical.
 */

vi.mock("../nex/anchor", () => ({
  AnchorTracker: class {
    version = 1;
    attach() {}
    detach() {}
    setElement() {}
    read() {
      return { present: true, left: 600, top: 200, width: 400, height: 400 };
    }
  },
}));

const fingerprint = (shape: AgentShape) =>
  [shape.positions, shape.orbits, shape.seeds].map((array) =>
    createHash("sha256").update(new Uint8Array(array.buffer)).digest("hex"),
  );

/** Every shape generated, with its fingerprint at generation time. */
const generated = vi.hoisted(
  () => [] as { id: string; count: number; shape: AgentShape; print: string[] }[],
);

/** NEX's real definition, and a second agent ("forge") using NEX's renderer with another seed. */
vi.mock("../agents/definitions", async (original) => {
  const actual = await original<typeof Definitions>();
  const record = (definition: AgentRenderDefinition): AgentRenderDefinition => ({
    ...definition,
    generate: (count, seed) => {
      const shape = definition.generate(count, seed);
      generated.push({ id: definition.id, count, shape, print: fingerprint(shape) });
      return shape;
    },
  });
  const nex = record(actual.definitionFor("nex")!);
  const forge = record({
    ...actual.definitionFor("nex")!,
    id: "forge",
    seed: 0xf0e,
    hotOverride: "#ffffff",
  } as AgentRenderDefinition);
  return {
    stageAgentFor: (agent: AgentId) => agent,
    definitionFor: (id: AgentId) => (id === "nex" ? nex : id === "forge" ? forge : undefined),
  };
});

/** A compiler whose every program links (these tests don't exercise compilation). */
const trustingCompiler: MorphCompiler = {
  compile: () => Promise.resolve(true),
  warm: () => Promise.resolve(true),
  verify: () => true,
};

/** A renderer's own attribute set over a cached shape (as a view's slot geometry builds it). */
function attributesOf(shape: AgentShape): ParticleAttributes {
  const g = createShapeSlot(shape);
  return {
    position: g.getAttribute("position") as ParticleAttributes["position"],
    orbit: g.getAttribute("aOrbit") as ParticleAttributes["orbit"],
    seed: g.getAttribute("aSeed") as ParticleAttributes["seed"],
  };
}

function engine(): Engine {
  const camera = new PerspectiveCamera(NEX_PARAMS.fov, 1.5, 0.1, 40);
  camera.position.set(0, 0, CAMERA_DISTANCE);
  return {
    scene: new Scene(),
    camera,
    width: 1200,
    height: 800,
    dpr: 2,
    renderer: {},
    invalidate: vi.fn(),
  } as unknown as Engine;
}

/** The particle arrays the active view draws (its points geometry's attributes). */
function drawn(e: Engine) {
  const points = (e.scene.children[0] as Group).children[2] as Mesh<BufferGeometry>;
  return ["position", "aOrbit", "aSeed"].map((name) => points.geometry.getAttribute(name).array);
}

describe("immutable cached shapes", () => {
  it("the morph geometry borrows both renderers' attribute objects over the cached arrays", async () => {
    const { definitionFor } = await import("../agents/definitions");
    const shapes = new ShapeCache(4);
    const nex = shapes.get(definitionFor("nex")!, 1_200);
    const forge = shapes.get(definitionFor("forge")!, 1_200);
    const views = { nex: attributesOf(nex), forge: attributesOf(forge) };
    const before = [fingerprint(nex), fingerprint(forge)];
    for (let i = 0; i < 25; i++) {
      const [a, b] = i % 2 ? [views.forge, views.nex] : [views.nex, views.forge];
      const [sa, sb] = i % 2 ? [forge, nex] : [nex, forge];
      const geometry = createMorphGeometry(a, b);
      // The very attribute objects the renderers own (so the very same GPU buffers) ...
      expect(geometry.getAttribute("position")).toBe(a.position);
      expect(geometry.getAttribute("aOrbit")).toBe(a.orbit);
      expect(geometry.getAttribute("aSeed")).toBe(a.seed);
      expect(geometry.getAttribute("positionB")).toBe(b.position);
      expect(geometry.getAttribute("aOrbitB")).toBe(b.orbit);
      expect(geometry.getAttribute("aSeedB")).toBe(b.seed);
      // ... over the cache's own arrays (no copy).
      expect(a.position.array).toBe(sa.positions);
      expect(b.seed.array).toBe(sb.seeds);
      releaseMorphGeometry(geometry);
    }
    expect([fingerprint(nex), fingerprint(forge)]).toEqual(before);
    expect(shapes.get(definitionFor("nex")!, 1_200)).toBe(nex);
  });

  it("releasing a morph geometry detaches the borrowed attributes first (Three.js disposal semantics)", async () => {
    const { definitionFor } = await import("../agents/definitions");
    const shapes = new ShapeCache(4);
    const a = attributesOf(shapes.get(definitionFor("nex")!, 1_200));
    const b = attributesOf(shapes.get(definitionFor("forge")!, 1_200));
    const geometry = createMorphGeometry(a, b);
    // Three's WebGLGeometries deletes the GPU buffer of every attribute still registered when a
    // geometry's "dispose" event fires; nothing may be registered by then.
    const registeredAtDispose: string[][] = [];
    geometry.addEventListener("dispose", () =>
      registeredAtDispose.push(Object.keys(geometry.attributes)),
    );
    releaseMorphGeometry(geometry);
    expect(registeredAtDispose).toEqual([[]]);
    // The renderers' attributes are untouched (same arrays, same versions: no re-upload).
    expect(a.position.version).toBe(0);
    expect(b.position.version).toBe(0);
  });

  it("refuses shapes of different sizes (equal-count slots)", async () => {
    const { definitionFor } = await import("../agents/definitions");
    const shapes = new ShapeCache();
    const a = attributesOf(shapes.get(definitionFor("nex")!, 1_200));
    const b = attributesOf(shapes.get(definitionFor("forge")!, 2_400));
    expect(() => createMorphGeometry(a, b)).toThrow(/particles, expected/);
  });

  it("frames, tier and quality changes, swaps, reversals and context restores never mutate a cached shape", async () => {
    const { definitionFor } = await import("../agents/definitions");
    generated.length = 0;
    const shapes = new ShapeCache();
    const transition = createTransition("nex");
    const report = createMorphReport();
    const ctx = {
      stage: document.createElement("div"),
      interaction: createInteraction(0.1),
      transition,
      report,
      shapes,
      orbitPreference: "uniforms" as const,
      epochs: { owner: 0, context: 0 },
      compiler: trustingCompiler,
    };
    let e = engine();
    let clock = new TransitionClock(e, { transition, report });
    let core = new AgentCore(e, ctx);
    let props: AgentViewProps = {
      particles: 2_400,
      particleShare: 1,
      glowLayer: true,
      motion: "full",
      path: "/",
    };
    let agent: AgentId = "nex";
    const apply = (next: Partial<AgentViewProps>, to: AgentId = agent) => {
      props = { ...props, ...next };
      agent = to;
      clock.setProps({ agent, path: props.path, motion: props.motion, hidden: false });
      core.setProps(props);
    };
    const run = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        clock.update(e, 0.016);
        core.update(e, 0.016);
      }
    };
    /** The drawn arrays are the cache's own arrays for the drawn agent and tier (no copy). */
    const expectShared = () => {
      const shape = shapes.get(definitionFor(transition.source)!, props.particles);
      expect(drawn(e)).toEqual([shape.positions, shape.orbits, shape.seeds]);
      drawn(e).forEach((array, i) =>
        expect(array).toBe([shape.positions, shape.orbits, shape.seeds][i]),
      );
    };

    apply({});
    run(30);
    expectShared();
    let restores = 0;
    for (let round = 0; round < 6; round++) {
      apply({ path: "/engineering" }, "forge"); // NEX → FORGE (a swap until stage D's morphs)
      run(5);
      expectShared();
      apply({ path: "/" }, "nex"); // and back (the reverse selection)
      run(5);
      expectShared();
      apply({ particles: round % 2 ? 2_400 : 1_200 }); // a tier change
      run(5);
      expectShared();
      apply({ particleShare: 0.5 + 0.1 * round, glowLayer: round % 2 === 0 }); // quality changes
      run(5);
      // A morph geometry built and released over the two current shapes.
      releaseMorphGeometry(
        createMorphGeometry(
          attributesOf(shapes.get(definitionFor("nex")!, props.particles)),
          attributesOf(shapes.get(definitionFor("forge")!, props.particles)),
        ),
      );
      if (round % 2 === 0) {
        // Context loss and restore: the layers are rebuilt from the Stage-lifetime cache, and the
        // rebuilt view draws the very same arrays.
        const arrays = drawn(e);
        core.dispose();
        clock.dispose();
        e = engine();
        clock = new TransitionClock(e, { transition, report });
        core = new AgentCore(e, ctx);
        clock.setProps({ agent, path: props.path, motion: props.motion, hidden: false });
        core.setProps(props);
        run(5);
        drawn(e).forEach((array, i) => expect(array).toBe(arrays[i]));
        restores++;
      }
    }
    apply({ motion: "reduced" });
    run(3);

    expect(restores).toBe(3);
    expect(generated.length).toBeGreaterThan(4); // tier changes evicted and regenerated shapes
    // No shape was ever written to, before or after its eviction.
    for (const { shape, print } of generated) expect(fingerprint(shape)).toEqual(print);
    // A shape regenerated after its eviction is byte-identical (deterministic generation).
    for (const entry of generated) {
      const first = generated.find((g) => g.id === entry.id && g.count === entry.count)!;
      expect(entry.print).toEqual(first.print);
    }
    core.dispose();
    clock.dispose();
  });
});
