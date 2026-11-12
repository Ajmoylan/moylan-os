import {
  PerspectiveCamera,
  Scene,
  type BufferGeometry,
  type Group,
  type Material,
  type Mesh,
  type ShaderMaterial,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { rgb } from "../ambient/config";
import type { AgentViewProps } from "../agents/types";
import { AgentCore } from "../core/AgentCore";
import type { MorphCompiler } from "../core/morph/programs";
import { ShapeCache } from "../core/shapeCache";
import type { Engine } from "../engine/Engine";
import { createInteraction } from "../flow/interaction";
import { createMorphReport, createTransition } from "../transition/StageTransition";
import { TransitionClock, type TransitionClockProps } from "../transition/TransitionClock";
import { LegacyNexAvatar } from "./__fixtures__/NexAvatar.2ceeff8";
import { NEX_PARAMS } from "./params";
import { CAMERA_DISTANCE } from "./placement";
import { generateNexShape } from "./shape";

/**
 * Milestone 2.4b.2 stage C: NEX's fade, arrival, post-arrival fade, idle time and placement moved
 * from its renderer into TransitionClock. This drives the new pipeline (TransitionClock → AgentCore →
 * NexAvatar) and the renderer exactly as merged at 2ceeff8 (a frozen copy) through the same scripted
 * anchor, viewport, motion and props, and requires every frame to match: every uniform of every
 * material, shaders and render states, draw ranges, the group transform and visibility, and the
 * published stage attributes.
 */

/** One scripted anchor shared by both pipelines' trackers. */
const script = vi.hoisted(() => ({
  box: { present: true, left: 600, top: 200, width: 400, height: 400 },
  version: 1,
  elements: [] as unknown[],
}));

vi.mock("./anchor", () => ({
  AnchorTracker: class {
    get version() {
      return script.version;
    }
    attach() {}
    detach() {}
    setElement(element: unknown) {
      script.elements.push(element);
    }
    read() {
      return script.box;
    }
  },
}));

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

/** Plain, exactly comparable values of everything a frame uploads or draws. */
function frame(root: Group, stage: HTMLElement) {
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
  root.updateMatrix();
  return {
    visible: root.visible,
    matrix: Array.from(root.matrix.elements),
    children: root.children.map((child) => {
      const object = child as Mesh<BufferGeometry, Material>;
      const m = object.material as ShaderMaterial;
      return {
        visible: object.visible,
        drawRange: { ...object.geometry.drawRange },
        shaders: [m.vertexShader, m.fragmentShader],
        state: [m.blending, m.transparent, m.depthTest, m.depthWrite],
        uniforms: Object.fromEntries(
          Object.entries(m.uniforms).map(([name, u]) => [name, plain(u.value)]),
        ),
      };
    }),
    published: {
      nexState: stage.dataset.nexState,
      nexFormed: stage.dataset.nexFormed,
      nexFlow: stage.dataset.nexFlow,
      nexParticles: stage.dataset.nexParticles,
    },
  };
}

/** A compiler whose every program links (these tests don't exercise compilation). */
const trustingCompiler: MorphCompiler = {
  compile: () => Promise.resolve(true),
  warm: () => Promise.resolve(true),
  verify: () => true,
};

describe("NEX appearance after the move into TransitionClock (2.4b.2 stage C)", () => {
  it("renders every frame exactly as the 2ceeff8 renderer did", () => {
    const legacyEngine = engine();
    const legacyStage = document.createElement("div");
    const transition = createTransition("nex");
    const legacy = new LegacyNexAvatar(legacyEngine, {
      stage: legacyStage,
      interaction: createInteraction(0.1),
      colours: { deep: rgb("#14a89c"), accent: rgb("#3fe0d0"), hot: rgb("#c9fbf5") },
      shape: (count) => generateNexShape(count),
      orbitTransport: "uniforms",
      visibility: transition.visibility, // unused by the legacy renderer
      placement: transition.placement,
    });

    const newEngine = engine();
    const stage = document.createElement("div");
    const report = createMorphReport();
    const clock = new TransitionClock(newEngine, { transition, report });
    const core = new AgentCore(newEngine, {
      stage,
      interaction: createInteraction(0.1),
      transition,
      report,
      shapes: new ShapeCache(),
      orbitPreference: "uniforms",
      epochs: { owner: 0, context: 0 },
      compiler: trustingCompiler,
    });

    let props: AgentViewProps = {
      particles: 2_400,
      particleShare: 1,
      glowLayer: true,
      motion: "full",
      path: "/",
    };
    const apply = (next: Partial<AgentViewProps>) => {
      props = { ...props, ...next };
      const clockProps: TransitionClockProps = {
        agent: "nex",
        path: props.path,
        motion: props.motion,
        hidden: false,
      };
      const changed = clock.setProps(clockProps);
      // The Stage invalidates once if any layer reports a change; NEX alone reported it before.
      expect(core.setProps(props) || changed).toBe(legacy.setProps(props));
    };
    const legacyRoot = legacyEngine.scene.children[0] as Group;
    const newRoot = () => newEngine.scene.children[0] as Group;
    let frames = 0;
    const run = (deltas: number[]) => {
      for (const delta of deltas) {
        legacy.update(legacyEngine, delta);
        clock.update(newEngine, delta);
        core.update(newEngine, delta);
        expect(frame(newRoot(), stage)).toEqual(frame(legacyRoot, legacyStage));
        frames++;
      }
    };
    const repeat = (n: number, delta = 0.016) => Array.from({ length: n }, () => delta);
    const both = (fn: (e: Engine) => void) => {
      fn(legacyEngine);
      fn(newEngine);
    };

    apply({});
    run([0, 0.016, 0.016, 0.25, 0.016]); // first frames, a long frame (clamped step)
    run(repeat(170)); // the arrival completes (2.4 s), the glow layer fades in
    script.box = { ...script.box, top: 150 };
    script.version++;
    run(repeat(5)); // the anchor moved
    both((e) => Object.assign(e, { width: 900, height: 700 }));
    run(repeat(3)); // viewport resized
    both((e) => {
      (e.camera as PerspectiveCamera).fov = 24;
    });
    run(repeat(3)); // field of view changed
    script.box = { ...script.box, present: false };
    run(repeat(50)); // the anchor left: NEX fades out and hides
    script.box = { ...script.box, present: true, top: 260 };
    script.version++;
    run(repeat(40)); // back: the arrival replays
    script.box = { ...script.box, top: -5000 };
    script.version++;
    run(repeat(4)); // scrolled far off screen
    script.box = { ...script.box, top: 220 };
    script.version++;
    apply({ motion: "reduced" });
    run([0, 0.016, 0.016]); // reduced motion during an arrival: formed at once, still
    apply({ motion: "full" });
    run(repeat(20));
    apply({ particles: 1_200, particleShare: 0.5, glowLayer: false });
    run(repeat(10)); // tier change, adapted share, no glow layer
    apply({ path: "/ai" });
    run([0.016, 0, 0.033, 0.016]); // navigation; zero-length frames
    expect(frames).toBeGreaterThan(300);
    // Both looked the anchor up after the same navigations (initial props and "/ai").
    expect(script.elements.length % 2).toBe(0);

    legacy.dispose();
    core.dispose();
    clock.dispose();
  });
});
