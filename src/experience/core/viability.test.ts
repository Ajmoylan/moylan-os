import { PerspectiveCamera, Scene, type Object3D } from "three";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AgentId } from "~/agents/registry";
import type * as Definitions from "../agents/definitions";
import { registerDiagnosticDefinition } from "../agents/definitions";
import { testDefinition } from "../agents/test";
import type { AgentRenderDefinition, AgentViewProps } from "../agents/types";
import type { Engine } from "../engine/Engine";
import { createInteraction } from "../flow/interaction";
import { NEX_PARAMS } from "../nex/params";
import { CAMERA_DISTANCE } from "../nex/placement";
import { createMorphReport, createTransition } from "../transition/StageTransition";
import { TransitionClock } from "../transition/TransitionClock";
import { AgentCore } from "./AgentCore";
import { AgentCapabilities } from "./capabilities";
import type { MorphCompiler } from "./morph/programs";
import { ShapeCache } from "./shapeCache";

/**
 * Device viability and idle-program failures end to end through the real clock, AgentCore, NEX and
 * TEST (2.4b.2 remediation, Codex findings 1 and 2):
 * - one shared, per-context assessment: an unsupported agent goes straight to its accessible
 *   fallback from idle, preparing, morphing or settling, never preparing, never failing the Stage;
 * - a destination whose idle program fails to link is never handed off to: one fallback transport,
 *   then unsupported; a working view is kept; nothing is retried in the same context.
 * "syn" here is a test-only stand-in (TEST's renderer declaring an impossible uniform count), not a
 * production specialist.
 */

const device = vi.hoisted(() => ({ floatTextures: true }));
vi.mock("./orbits/probe", () => ({ orbitTexturesSupported: () => device.floatTextures }));

vi.mock("../nex/anchor", () => ({
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

vi.mock("../agents/definitions", async (original) => {
  const actual = await original<typeof Definitions>();
  return {
    ...actual,
    stageAgentFor: (agent: AgentId) => (agent === "forge" ? "test" : agent),
    definitionFor: (id: AgentId | "test") => {
      if (id !== "syn") return actual.definitionFor(id);
      const test = actual.definitionFor("test")!;
      return {
        ...test,
        id: "syn",
        palette: test.palette,
        transports: { idle: ["uniforms"], uniformVectors: { uniforms: 100_000 } },
      } as unknown as AgentRenderDefinition;
    },
  };
});

beforeAll(() => registerDiagnosticDefinition(testDefinition));
afterEach(() => {
  device.floatTextures = true;
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function rig(options: { max?: number } = {}) {
  const camera = new PerspectiveCamera(NEX_PARAMS.fov, 1.5, 0.1, 40);
  camera.position.set(0, 0, CAMERA_DISTANCE);
  const engine = {
    scene: new Scene(),
    camera,
    width: 1200,
    height: 800,
    dpr: 2,
    renderer: { capabilities: { maxVertexUniforms: options.max ?? 256 } },
    invalidate: vi.fn(),
  } as unknown as Engine;
  const transition = createTransition("nex");
  const report = createMorphReport();
  const epochs = { owner: 0, context: 0 };
  const stage = document.createElement("div");
  const capabilities = new AgentCapabilities(
    { maxVertexUniforms: () => options.max ?? 256, floatTextures: () => device.floatTextures },
    "uniforms",
    epochs.context,
  );
  /** Views whose idle programs fail to link, as `agent:transport`. */
  const failing = new Set<string>();
  const counts = { warm: new Map<string, number>(), verify: new Map<string, number>(), pair: 0 };
  /** `agent:transport` of a view's root (TEST has one child; NEX's texture view reads a table). */
  const label = (object: Object3D) => {
    if (object.children.length === 1) return "test:uniforms";
    const points = object.children[2] as unknown as {
      material: { uniforms: Record<string, unknown> };
    };
    return `nex:${"uOrbitTable" in points.material.uniforms ? "texture" : "uniforms"}`;
  };
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const compiler: MorphCompiler = {
    compile: () => {
      counts.pair++;
      return Promise.resolve(true);
    },
    warm: (object) => {
      bump(counts.warm, label(object));
      return failing.has(label(object)) ? Promise.reject(new Error("link")) : Promise.resolve(true);
    },
    verify: (object) => {
      bump(counts.verify, label(object));
      return !failing.has(label(object));
    },
  };
  const clock = new TransitionClock(engine, { transition, report, capabilities });
  const core = new AgentCore(engine, {
    stage,
    interaction: createInteraction(0.1),
    transition,
    report,
    shapes: new ShapeCache(),
    orbitPreference: "uniforms",
    epochs,
    compiler,
    capabilities,
  });
  let props: AgentViewProps = {
    particles: 2_400,
    particleShare: 1,
    glowLayer: true,
    motion: "full",
    path: "/",
  };
  let agent: AgentId = "nex";
  const apply = (to: AgentId = agent) => {
    agent = to;
    props = { ...props, path: `/${to}` };
    clock.setProps({ agent, path: props.path, motion: props.motion, hidden: false });
    core.setProps(props);
  };
  const frame = async () => {
    clock.update(engine, 0.016);
    core.update(engine, 0.016);
    await flush();
  };
  const setMotion = (motion: AgentViewProps["motion"]) => {
    props = { ...props, motion };
    apply();
  };
  const dispose = () => {
    core.dispose();
    clock.dispose();
  };
  return {
    engine,
    stage,
    transition,
    report,
    capabilities,
    failing,
    counts,
    core,
    apply,
    frame,
    setMotion,
    dispose,
  };
}

/** Runs frames (at least one) until the stage rests: idle or unsupported. */
async function settle(r: ReturnType<typeof rig>, n = 300) {
  await r.frame();
  for (
    let i = 0;
    i < n && r.transition.state !== "idle" && r.transition.state !== "unsupported";
    i++
  ) {
    await r.frame();
  }
}

describe("unsupported destinations (device viability) from every state", () => {
  const states = ["idle", "preparing", "morphing", "settling"] as const;
  for (const from of states) {
    it(`from ${from}: straight to the accessible fallback, nothing prepared, the Stage intact`, async () => {
      const r = rig();
      r.apply("nex");
      for (let i = 0; i < 5; i++) await r.frame();
      if (from !== "idle") {
        r.apply("forge"); // NEX → TEST
        for (let i = 0; i < 300 && r.transition.state !== from; i++) await r.frame();
        expect(r.transition.state).toBe(from);
      }
      const pairs = r.counts.pair;
      r.apply("syn");
      expect(r.capabilities.supported("syn")).toBe(false);
      await r.frame();
      expect(r.transition.state).toBe("unsupported");
      expect(r.transition.source).toBe("syn");
      expect(r.stage.dataset.agentSupport).toBe("unsupported");
      expect(r.stage.dataset.agentState).toBe("unsupported");
      expect(r.core.diagnostics.morph).toBeNull();
      expect(r.core.diagnostics.destination).toBeNull();
      expect(r.engine.scene.children).toHaveLength(0); // nothing drawn for it; nothing left over
      expect(r.counts.pair).toBe(pairs); // no pair program for it, ever
      // Back home: NEX again (swap from unsupported).
      r.apply("nex");
      await settle(r);
      expect(r.transition.source).toBe("nex"); // swapped back: it arrived and is idle
      expect(r.transition.state).toBe("idle");
      expect(r.stage.dataset.agentSupport).toBeUndefined();
      r.dispose();
    });
  }

  it("a device whose limit fits neither NEX transport: NEX itself is unsupported (poster), TEST still draws", async () => {
    device.floatTextures = false;
    const r = rig({ max: 100 }); // 68 < 112; texture needs the probe
    r.apply("nex");
    await r.frame();
    expect(r.transition.state).toBe("unsupported");
    expect(r.stage.dataset.agentSupport).toBe("unsupported");
    expect(r.engine.scene.children).toHaveLength(0);
    r.apply("forge");
    await r.frame();
    await r.frame();
    expect(r.transition.source).toBe("test"); // a swap: no morph from an unsupported agent
    expect(r.stage.dataset.agentSupport).toBeUndefined();
    expect(r.engine.scene.children).toHaveLength(1);
    r.dispose();
  });
});

describe("destination idle-program failures", () => {
  it("TEST's only transport fails to link while preparing: never handed off; unsupported; NEX kept until the swap; never retried", async () => {
    const r = rig();
    r.apply("nex");
    await r.frame();
    r.failing.add("test:uniforms");
    r.apply("forge");
    for (let i = 0; i < 10; i++) await r.frame();
    expect(r.transition.state).toBe("unsupported");
    expect(r.transition.source).toBe("test");
    expect(r.counts.warm.get("test:uniforms")).toBe(1);
    expect(r.core.diagnostics.morph).toBeNull();
    expect(r.engine.scene.children).toHaveLength(0);
    // Home and back: the verdict is cached for this context, nothing is compiled again.
    r.apply("nex");
    await settle(r);
    r.apply("forge");
    for (let i = 0; i < 5; i++) await r.frame();
    expect(r.transition.state).toBe("unsupported");
    expect(r.counts.warm.get("test:uniforms")).toBe(1);
    expect(r.counts.verify.get("test:uniforms") ?? 0).toBe(0);
    r.dispose();
  });

  it("NEX as the destination: uniforms fail to link, the texture transport is tried once and the morph runs", async () => {
    const r = rig();
    r.apply("forge"); // start on TEST
    await settle(r);
    r.failing.add("nex:uniforms");
    r.apply("nex");
    for (let i = 0; i < 300 && r.transition.state !== "morphing"; i++) await r.frame();
    expect(r.transition.state).toBe("morphing");
    expect(r.counts.warm.get("nex:uniforms")).toBe(1);
    expect(r.counts.warm.get("nex:texture")).toBe(1);
    await settle(r);
    expect(r.transition.source).toBe("nex");
    expect(r.stage.dataset.stageOrbits).toBe("texture");
    expect(r.core.orbitTransport).toBe("texture");
    r.dispose();
  });

  it("both NEX transports fail: unsupported after exactly one attempt each (bounded)", async () => {
    const r = rig();
    r.apply("forge");
    await settle(r);
    r.failing.add("nex:uniforms");
    r.failing.add("nex:texture");
    r.apply("nex");
    for (let i = 0; i < 20; i++) await r.frame();
    expect(r.transition.state).toBe("unsupported");
    expect(r.counts.warm.get("nex:uniforms")).toBe(1);
    expect(r.counts.warm.get("nex:texture")).toBe(1);
    expect(r.engine.scene.children).toHaveLength(0);
    r.dispose();
  });

  it("a swap to an agent whose only program fails: the drawn agent becomes unsupported next frame", async () => {
    const r = rig();
    r.setMotion("reduced");
    r.apply("nex");
    await r.frame();
    r.failing.add("test:uniforms");
    r.apply("forge"); // a swap (Reduced Motion): TEST is verified before it draws, and fails
    await r.frame();
    expect(r.counts.verify.get("test:uniforms")).toBe(1);
    expect(r.engine.scene.children).toHaveLength(0); // never drawn
    await r.frame(); // the clock revalidates: unsupported
    expect(r.transition.state).toBe("unsupported");
    expect(r.stage.dataset.agentSupport).toBe("unsupported");
    await r.frame();
    expect(r.counts.verify.get("test:uniforms")).toBe(1); // not retried
    r.dispose();
  });

  it("a swap (Reduced Motion) to a view whose program fails: verified before it draws, one fallback", async () => {
    const r = rig();
    r.setMotion("reduced");
    r.apply("forge");
    await r.frame();
    r.failing.add("nex:uniforms");
    r.apply("nex");
    await r.frame();
    await r.frame();
    expect(r.transition.source).toBe("nex");
    expect(r.counts.verify.get("nex:uniforms")).toBe(1);
    expect(r.counts.verify.get("nex:texture")).toBe(1);
    expect(r.core.orbitTransport).toBe("texture");
    expect(r.transition.state).toBe("idle");
    r.dispose();
  });
});
