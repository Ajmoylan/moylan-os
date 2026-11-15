import {
  BufferGeometry,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  type Mesh,
  type Vector3,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ShapeModule from "./shape";
import { nexPalette, rgb } from "../ambient/config";
import type { Engine } from "../engine/Engine";
import { createInteraction } from "../flow/interaction";
import { createTransition } from "../transition/StageTransition";
import { CORE_LEAN_UNITS } from "./look";
import { NexAvatar, type NexAvatarProps } from "./NexAvatar";
import { generateNexShape } from "./shape";

/**
 * NEX's renderer (Milestone 2.4a; hosted by AgentCore since 2.4b): change reporting, transactional
 * construction and geometry rebuilds, complete and idempotent disposal (fault injection with real
 * Three.js objects). Since 2.4b.2 its appearance and placement come from TransitionClock (tested in
 * transition/TransitionClock.test.ts and, frame by frame against 2ceeff8, nex/appearance.test.ts).
 */

const faults = vi.hoisted(() => ({ shape: false }));

vi.mock("./shape", async (original) => {
  const actual = await original<typeof ShapeModule>();
  return {
    ...actual,
    generateNexShape: (count: number) => {
      if (faults.shape) throw new Error("shape");
      return actual.generateNexShape(count);
    },
  };
});

/** Materials and geometries a NEX layer creates: 6 materials; rings, quad, sphere, 2 particle. */
const MATERIALS = 6;
const GEOMETRIES = 5;

let scene: Scene;
let engine: Engine;
let stage: HTMLElement;
let geometryDisposals: ReturnType<typeof vi.spyOn>;
let materialDisposals: ReturnType<typeof vi.spyOn>;

const props = (overrides: Partial<NexAvatarProps> = {}): NexAvatarProps => ({
  particles: 1_200,
  particleShare: 1,
  glowLayer: true,
  motion: "full",
  path: "/",
  ...overrides,
});

let interaction = createInteraction(0.1);

const nex = (personality = false) =>
  new NexAvatar(engine, {
    personality,
    stage,
    interaction,
    colours: {
      deep: rgb(nexPalette.base),
      accent: rgb(nexPalette.accent),
      hot: rgb(nexPalette.hot),
    },
    shape: (count) => generateNexShape(count),
    orbitTransport: "uniforms",
    visibility: transition.visibility,
    placement: transition.placement,
  });

let transition = createTransition("nex");

beforeEach(() => {
  faults.shape = false;
  transition = createTransition("nex");
  interaction = createInteraction(0.1);
  scene = new Scene();
  stage = document.createElement("div");
  engine = {
    scene,
    camera: new PerspectiveCamera(20, 1.5, 0.1, 40),
    invalidate: vi.fn(),
  } as unknown as Engine;
  geometryDisposals = vi.spyOn(BufferGeometry.prototype, "dispose");
  materialDisposals = vi.spyOn(ShaderMaterial.prototype, "dispose");
});

afterEach(() => vi.restoreAllMocks());

describe("NexAvatar layer", () => {
  it("is an update-phase layer: one group in the scene", () => {
    const n = nex();
    expect(n.phase).toBe("update");
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0]!.children).toHaveLength(6); // atmosphere, lines, points ×2, shell, glow
  });

  it("draws what the transition clock decided: hidden at fade 0, placed and visible on screen", () => {
    const n = nex();
    n.setProps(props());
    const root = scene.children[0]!;
    n.update(engine);
    expect(root.visible).toBe(false);
    expect(stage.dataset.nexState).toBe("hidden");
    Object.assign(transition.visibility, { fade: 0.5, arrival: 1.2, formed: 0, time: 3 });
    Object.assign(transition.placement.displayed, { x: 0.25, y: -0.5, scale: 0.8, onScreen: true });
    n.update(engine);
    expect(root.visible).toBe(true);
    expect(root.position.toArray()).toEqual([0.25, -0.5, 0]);
    expect(root.scale.x).toBe(0.8);
    expect(stage.dataset.nexState).toBe("visible");
    expect(stage.dataset.nexFormed).toBe("false");
    transition.placement.displayed.onScreen = false;
    n.update(engine);
    expect(root.visible).toBe(false);
    expect(stage.dataset.nexState).toBe("visible"); // fading, merely off screen
  });

  it("reports changes, applies only what changed, and never invalidates by itself", () => {
    const n = nex();
    expect(n.setProps(props())).toBe(true);
    expect(stage.dataset.nexParticles).toBe("1200");
    expect(n.setProps(props())).toBe(false);
    expect(n.setProps(props({ particleShare: 0.5 }))).toBe(true);
    expect(stage.dataset.nexParticles).toBe("600");
    expect(n.setProps(props({ particleShare: 0.5, glowLayer: false }))).toBe(true);
    // A navigation can move NEX's anchor (the transition clock looks it up again).
    expect(n.setProps(props({ particleShare: 0.5, glowLayer: false, path: "/ai" }))).toBe(true);
    expect(engine.invalidate).not.toHaveBeenCalled();
  });

  it("construction failure releases everything created before it (fault injection)", () => {
    vi.spyOn(scene, "add").mockImplementation(() => {
      throw new Error("scene");
    });
    expect(() => nex()).toThrow("scene");
    expect(materialDisposals).toHaveBeenCalledTimes(MATERIALS);
    expect(geometryDisposals).toHaveBeenCalledTimes(GEOMETRIES);
    expect(scene.children).toHaveLength(0);
    expect(Object.keys(stage.dataset)).toEqual([]);
  });

  it("a failing geometry rebuild keeps the current geometries and leaks nothing", () => {
    const n = nex();
    n.setProps(props());
    geometryDisposals.mockClear();
    faults.shape = true;
    expect(() => n.setProps(props({ particles: 2_400 }))).toThrow("shape");
    expect(geometryDisposals).not.toHaveBeenCalled();
    expect(stage.dataset.nexParticles).toBe("1200");
  });

  it("a failing initial setProps leaves a layer that still disposes completely", () => {
    const n = nex();
    faults.shape = true;
    expect(() => n.setProps(props())).toThrow("shape");
    n.dispose();
    expect(materialDisposals).toHaveBeenCalledTimes(MATERIALS);
    expect(geometryDisposals).toHaveBeenCalledTimes(GEOMETRIES);
    expect(scene.children).toHaveLength(0);
  });

  it("dispose is complete and idempotent, and removes NEX's stage attributes", () => {
    const n = nex();
    n.setProps(props());
    n.dispose();
    n.dispose();
    expect(materialDisposals).toHaveBeenCalledTimes(MATERIALS);
    // + the two placeholder particle geometries replaced by the first real shape.
    expect(geometryDisposals).toHaveBeenCalledTimes(GEOMETRIES + 2);
    expect(scene.children).toHaveLength(0);
    expect(stage.dataset.nexParticles).toBeUndefined();
    expect(n.setProps(props({ particles: 2_400 }))).toBe(false);
  });
});

describe("NexAvatar personality (launch sprint)", () => {
  const visibleFrame = () => {
    Object.assign(transition.visibility, { fade: 1, arrival: 2.4, formed: 1, time: 0 });
    Object.assign(transition.placement.displayed, { x: 0, y: 0, scale: 0.8, onScreen: true });
  };
  const sized = () => Object.assign(engine, { width: 1200, height: 800, dpr: 1 });
  const parts = () => {
    const root = scene.children[0]!;
    const [atmosphere, , points, , shell, glow] = root.children as Mesh<
      BufferGeometry,
      ShaderMaterial
    >[];
    return { root, atmosphere: atmosphere!, points: points!, shell: shell!, glow: glow! };
  };
  const pointer = (x: number, y: number) => {
    interaction.mode = "analytic";
    interaction.cursorActive = true;
    interaction.cursor.set(x, y);
  };

  it("off (the default): NEX's approved shader, no core shift, no turn, the approved glow", () => {
    sized();
    const n = nex();
    n.setProps(props());
    visibleFrame();
    pointer(0.9, 0.6);
    const { root, points, glow } = parts();
    n.update(engine, 0.016);
    const rest = root.quaternion.clone();
    for (let i = 0; i < 60; i++) n.update(engine, 1 / 60);
    expect(root.quaternion.toArray()).toEqual(rest.toArray());
    expect(points.material.vertexShader).not.toContain("uCoreShift");
    expect(points.material.uniforms.uCoreShift).toBeUndefined();
    expect(glow.position.toArray()).toEqual([0, 0, 0]);
  });

  it("the rings turn noticeably towards an active cursor, then return exactly to rest", () => {
    sized();
    const n = nex(true);
    n.setProps(props());
    visibleFrame();
    const { root } = parts();
    n.update(engine, 0.016);
    const rest = root.quaternion.clone();
    pointer(0.9, 0.6);
    for (let i = 0; i < 90; i++) n.update(engine, 1 / 60);
    const turned = root.quaternion.angleTo(rest);
    expect(turned).toBeGreaterThan(0.45); // > 25°: clearly noticeable
    expect(turned).toBeLessThan(0.75); // bounded (yaw 0.56 and pitch 0.38 at most)
    // Smooth: no single frame turns by more than a few degrees.
    interaction.cursor.set(-0.9, -0.6);
    let previous = root.quaternion.clone();
    for (let i = 0; i < 30; i++) {
      n.update(engine, 1 / 60);
      expect(root.quaternion.angleTo(previous)).toBeLessThan(0.08); // < 4.6° a frame
      previous = root.quaternion.clone();
    }
    interaction.cursorActive = false;
    for (let i = 0; i < 600; i++) n.update(engine, 1 / 60);
    expect(root.quaternion.toArray()).toEqual(rest.toArray());
  });

  it("the core leans towards the cursor on screen, independently of the rings, then recentres", () => {
    sized();
    const n = nex(true);
    n.setProps(props());
    visibleFrame();
    const { root, points, shell, glow } = parts();
    n.update(engine, 0.016);
    pointer(0.9, 0); // to the right of NEX
    for (let i = 0; i < 120; i++) n.update(engine, 1 / 60);
    const shift = points.material.uniforms.uCoreShift!.value as Vector3;
    expect(points.material.vertexShader).toContain("target += uCoreShift");
    // In world space (NEX's turn applied) the lean points right, within CORE_LEAN of the radius.
    const world = shift.clone().applyQuaternion(root.quaternion);
    expect(world.x).toBeGreaterThan(0.6 * CORE_LEAN_UNITS);
    expect(world.length()).toBeLessThanOrEqual(CORE_LEAN_UNITS + 1e-9);
    expect(Math.abs(world.y)).toBeLessThan(0.05 * CORE_LEAN_UNITS);
    expect(glow.position.toArray()).toEqual(shift.toArray());
    expect(shell.position.toArray()).toEqual(shift.toArray());
    interaction.cursorActive = false;
    for (let i = 0; i < 600; i++) n.update(engine, 1 / 60);
    expect(shift.toArray()).toEqual([0, 0, 0]);
    expect(glow.position.toArray()).toEqual([0, 0, 0]);
  });

  it("no turn or lean without pointer effects (Reduced or Off Motion: interaction mode none)", () => {
    sized();
    const n = nex(true);
    n.setProps(props());
    visibleFrame();
    const { root, points } = parts();
    n.update(engine, 0.016);
    const rest = root.quaternion.clone();
    pointer(0.9, 0.6);
    interaction.mode = "none";
    for (let i = 0; i < 60; i++) n.update(engine, 1 / 60);
    expect(root.quaternion.toArray()).toEqual(rest.toArray());
    expect((points.material.uniforms.uCoreShift!.value as Vector3).toArray()).toEqual([0, 0, 0]);
  });

  it("adds no GPU resources: the same materials and geometries, all released on dispose", () => {
    const n = nex(true);
    n.setProps(props());
    expect(scene.children[0]!.children).toHaveLength(6);
    n.dispose();
    n.dispose();
    expect(materialDisposals).toHaveBeenCalledTimes(MATERIALS);
    expect(geometryDisposals).toHaveBeenCalledTimes(GEOMETRIES + 2);
    expect(scene.children).toHaveLength(0);
  });

  it("vitality: the breathing pulse is larger than approved mid-cycle, identical at rest", () => {
    sized();
    const approved = nex();
    approved.setProps(props());
    const vital = nex(true);
    vital.setProps(props());
    const [a, v] = scene.children.map(
      (root) => root.children as Mesh<BufferGeometry, ShaderMaterial>[],
    );
    const intensities = (children: Mesh<BufferGeometry, ShaderMaterial>[]) => ({
      breath: children[2]!.material.uniforms.uBreath!.value as number,
      glow: children[5]!.material.uniforms.uIntensity!.value as number,
      atmosphere: children[0]!.material.uniforms.uIntensity!.value as number,
      shell: children[4]!.material.uniforms.uIntensity!.value as number,
    });
    visibleFrame();
    approved.update(engine, 0.016);
    vital.update(engine, 0.016);
    expect(intensities(v!)).toEqual(intensities(a!)); // time 0: the cycle's rest phase
    transition.visibility.time = 7.4792 / 2; // the cycle's peak
    approved.update(engine, 0.016);
    vital.update(engine, 0.016);
    const peakA = intensities(a!);
    const peakV = intensities(v!);
    expect(peakV.breath).toBeCloseTo(peakA.breath + 0.045, 6);
    expect(peakV.glow).toBeCloseTo(peakA.glow + 0.22, 6);
    expect(peakV.atmosphere).toBeCloseTo(peakA.atmosphere + 0.5, 6);
    expect(peakV.shell).toBeGreaterThan(peakA.shell);
  });
});
